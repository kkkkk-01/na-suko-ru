#!/usr/bin/env node
/* ============================================================
 * 耐久テスト用 負荷シミュレータ
 *
 * 実運用相当の負荷を連続的に印加し、システムの長時間安定性を検証する。
 *
 *  - 利用者6人分のハートビート（30秒間隔・実機と同じ）
 *  - 5分ごとに呼出→15秒後に応答→30秒後に終了 のフルサイクル
 *  - 毎時サマリ（成功/失敗件数・応答時間・メモリ目安）をログ出力
 *  - 失敗してもシミュレータ自体は止まらない（失敗はカウントして報告）
 *
 * 使い方:
 *   node scripts/endurance-test.js                         # フォアグラウンド
 *   pm2 start scripts/endurance-test.js --name endurance   # 常駐（推奨）
 *
 * 環境変数:
 *   API_BASE (default: http://localhost:3000/api/v1)
 *   API_KEY  (default: nursecall_api_key_dev)
 * ============================================================ */

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';
const API_KEY = process.env.API_KEY || 'nursecall_api_key_dev';

const RESIDENTS = [1, 2, 3];           // 利用者
const BEACONS = ['BCN-101', 'BCN-102', 'BCN-103', 'BCN-TOILET', 'BCN-DINING', 'BCN-COMMON'];

const stats = {
  startedAt: new Date(),
  heartbeat: { ok: 0, fail: 0 },
  call: { ok: 0, fail: 0 },
  latencies: [], // 直近の応答時間(ms)
};

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function api(path, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, ...(opts.headers || {}) },
  });
  const latency = Date.now() - t0;
  stats.latencies.push(latency);
  if (stats.latencies.length > 1000) stats.latencies.shift();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

// --- 30秒間隔ハートビート（実機ESP32と同じ周期） ---
async function heartbeatAll() {
  for (const userId of RESIDENTS) {
    try {
      const beacon = BEACONS[Math.floor(Math.random() * BEACONS.length)];
      await api('/locations/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          beacon_id: beacon,
          rssi: -50 - Math.floor(Math.random() * 25),
          battery_level: 60 + Math.floor(Math.random() * 40), // 60-99%（警報を出さない範囲）
        }),
      });
      stats.heartbeat.ok++;
    } catch (e) {
      stats.heartbeat.fail++;
      log(`HEARTBEAT FAIL user=${userId}: ${e.message}`);
    }
  }
}

// --- 5分ごとの呼出フルサイクル ---
async function callCycle() {
  const caller = RESIDENTS[Math.floor(Math.random() * RESIDENTS.length)];
  try {
    const reqRes = await api('/calls/request', {
      method: 'POST',
      body: JSON.stringify({ caller_id: caller, message: '耐久テスト呼出' }),
    });
    const callId = reqRes.call_id ?? reqRes.call?.id ?? reqRes.id;
    if (!callId) throw new Error('call id not returned');

    // 15秒後に応答（エスカレーション30秒より前）
    await sleep(15000);
    await api(`/calls/${callId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ staff_id: 4 }),
    });

    // 30秒通話後に終了
    await sleep(30000);
    await api(`/calls/${callId}/end`, { method: 'POST', body: JSON.stringify({}) });

    stats.call.ok++;
  } catch (e) {
    stats.call.fail++;
    log(`CALL CYCLE FAIL caller=${caller}: ${e.message}`);
  }
}

// --- 毎時サマリ ---
function hourlySummary() {
  const lat = stats.latencies;
  const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  const max = lat.length ? Math.max(...lat) : 0;
  const upHours = ((Date.now() - stats.startedAt.getTime()) / 3600000).toFixed(1);
  log(
    `SUMMARY uptime=${upHours}h ` +
    `heartbeat=${stats.heartbeat.ok}ok/${stats.heartbeat.fail}fail ` +
    `call=${stats.call.ok}ok/${stats.call.fail}fail ` +
    `latency avg=${avg}ms max=${max}ms`
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- メイン ---
(async () => {
  log(`耐久テスト開始 API=${API_BASE} residents=${RESIDENTS.join(',')}`);

  // 起動時ヘルスチェック
  try {
    const h = await api('/health');
    log(`API health: ${h.status}, DB: ${h.services?.database}`);
  } catch (e) {
    log(`初回ヘルスチェック失敗（継続します）: ${e.message}`);
  }

  heartbeatAll();
  setInterval(heartbeatAll, 30000);        // 30秒ごとハートビート
  setInterval(callCycle, 5 * 60 * 1000);   // 5分ごと呼出サイクル
  setTimeout(callCycle, 10000);            // 最初の呼出は10秒後
  setInterval(hourlySummary, 60 * 60 * 1000); // 毎時サマリ
  setInterval(() => {}, 1 << 30);          // keep alive
})();

process.on('unhandledRejection', (e) => log(`unhandledRejection(継続): ${e}`));
