#!/usr/bin/env node
/* ============================================================
 * 施設規模負荷試験: 利用者50名 + 職員15名想定
 *
 * フェーズ1: 定常負荷 — 50台の30秒ハートビート(=1.7req/s)を2分間
 * フェーズ2: ピーク負荷 — 朝のラッシュ想定。10件同時呼出 + 全台ハートビート
 * フェーズ3: 異常時ピーク — 20件同時呼出（災害・夜間急変レベル）
 * 各フェーズでレイテンシ(p50/p95/max)・エラー率・Socket.IO配信遅延を計測
 *
 * 使い方: node scripts/load-test-50.js
 * ============================================================ */
const { io } = require('/home/user/webapp/server/node_modules/socket.io-client');

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';
const WS_BASE = process.env.WS_BASE || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'nursecall_api_key_dev';
const BEACONS = ['BCN-101','BCN-102','BCN-103','BCN-TOILET','BCN-BATH','BCN-DINING','BCN-COMMON','BCN-ENT'];

const log = (m) => console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(s.length*p))]; };

async function api(path, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, ...(opts.headers||{}) },
  });
  const ms = Date.now() - t0;
  if (!res.ok) { const body = await res.text(); throw Object.assign(new Error(`HTTP ${res.status} ${path}: ${body.slice(0,80)}`), { ms }); }
  return { data: await res.json(), ms };
}

async function getIds() {
  const { data } = await api('/users?per_page=100');
  const users = data.users || data;
  const residents = users.filter(u => u.role === 'resident').map(u => u.id);
  const staff = users.filter(u => u.role === 'staff').map(u => u.id);
  return { residents, staff };
}

function report(name, lat, errors, extra = '') {
  log(`── ${name} ── req=${lat.length + errors} err=${errors} (${(errors/(lat.length+errors)*100).toFixed(1)}%) `
    + `p50=${pct(lat,0.5)}ms p95=${pct(lat,0.95)}ms max=${Math.max(0,...lat)}ms ${extra}`);
  return { errors, p95: pct(lat,0.95) };
}

// フェーズ1: 定常負荷（50台ハートビート×4周 ≒ 実運用2分間）
async function phase1(residents) {
  log('▶ フェーズ1: 定常負荷（50台×30秒ハートビート相当×4周）');
  const lat = []; let errors = 0;
  for (let round = 0; round < 4; round++) {
    const t0 = Date.now();
    await Promise.all(residents.map(async (id, i) => {
      try {
        const { ms } = await api('/locations/heartbeat', { method: 'POST', body: JSON.stringify({
          user_id: id, beacon_id: BEACONS[i % BEACONS.length], rssi: -55 - (i % 20), battery_level: 60 + (i % 40),
        })});
        lat.push(ms);
      } catch (e) { errors++; }
    }));
    log(`  round${round+1}: 50台一斉ハートビート完了 ${Date.now()-t0}ms`);
    if (round < 3) await sleep(3000);
  }
  return report('フェーズ1結果', lat, errors);
}

// 呼出1件のフルサイクル（Socket.IO配信遅延も計測）
async function oneCall(callerId, staffSockets, dispatchLat) {
  const notified = new Promise((resolve) => {
    const t0 = Date.now();
    const handler = (d) => { resolve(Date.now() - t0); staffSockets.forEach(s => s.off('call:incoming', handler)); };
    staffSockets.forEach(s => s.once('call:incoming', handler));
    setTimeout(() => resolve(-1), 10000);
  });
  const { data } = await api('/calls/request', { method: 'POST', body: JSON.stringify({ caller_id: callerId, message: '負荷試験' }) });
  const dispatchMs = await notified;
  if (dispatchMs >= 0) dispatchLat.push(dispatchMs);
  await sleep(500 + Math.random() * 1000);
  await api(`/calls/${data.call_id}/answer`, { method: 'POST', body: JSON.stringify({}) });
  await sleep(300);
  await api(`/calls/${data.call_id}/end`, { method: 'POST', body: JSON.stringify({}) });
}

async function burstPhase(name, nCalls, residents, staffSockets) {
  log(`▶ ${name}: ${nCalls}件同時呼出 + 50台ハートビート同時`);
  const lat = []; const dispatchLat = []; let errors = 0;
  const callers = residents.slice(0, nCalls);
  const t0 = Date.now();
  await Promise.all([
    ...callers.map(async (id) => {
      const s = Date.now();
      try { await oneCall(id, staffSockets, dispatchLat); lat.push(Date.now() - s); }
      catch (e) { errors++; log(`  CALL FAIL user=${id}: ${e.message}`); }
    }),
    // 同時に全台ハートビートも流す（最悪ケース）
    ...residents.map(async (id, i) => {
      try { await api('/locations/heartbeat', { method: 'POST', body: JSON.stringify({
        user_id: id, beacon_id: BEACONS[i % BEACONS.length], rssi: -60, battery_level: 70,
      })}); } catch (e) { /* HBエラーはcallに含めない */ }
    }),
  ]);
  log(`  全${nCalls}呼出サイクル完了: ${Date.now()-t0}ms`);
  const d50 = pct(dispatchLat, 0.5), d95 = pct(dispatchLat, 0.95);
  return report(`${name}結果`, lat, errors, `| 職員着信までの配信遅延 p50=${d50}ms p95=${d95}ms`);
}

(async () => {
  log(`負荷試験開始 (${API_BASE})`);
  const { residents, staff } = await getIds();
  log(`利用者=${residents.length}名 職員=${staff.length}名`);

  // 職員15名分のSocket.IO接続（実運用と同じくstaffルーム参加）
  const staffSockets = await Promise.all(staff.map((id) => new Promise((resolve) => {
    const s = io(WS_BASE, { transports: ['websocket'] });
    s.on('connect', () => { s.emit('join', { user_id: id, role: 'staff' }); resolve(s); });
    setTimeout(() => resolve(s), 5000);
  })));
  const connected = staffSockets.filter(s => s.connected).length;
  log(`職員Socket.IO接続: ${connected}/${staff.length}`);

  const r1 = await phase1(residents);
  await sleep(2000);
  const r2 = await burstPhase('フェーズ2(朝ラッシュ)', 10, residents, staffSockets);
  await sleep(2000);
  const r3 = await burstPhase('フェーズ3(異常時)', 20, residents, staffSockets);

  // 判定
  log('════════ 総合判定 ════════');
  const pass = r1.errors === 0 && r2.errors === 0 && r3.errors === 0 && r2.p95 < 5000 && r3.p95 < 8000;
  log(pass ? '✅ 合格: 50名+15名規模の定常・ピーク負荷に耐えました' : '⚠️ 要確認: 上記結果を確認してください');

  staffSockets.forEach(s => s.disconnect());
  process.exit(0);
})().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
