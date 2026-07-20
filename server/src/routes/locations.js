const express = require('express');
const Joi = require('joi');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// POST /locations/heartbeat - 端末ハートビート（生存確認 + 位置 + バッテリー報告）
// ESP32実機・Webシミュレーターの両方が同一仕様で叩く
router.post('/heartbeat', async (req, res, next) => {
  try {
    const schema = Joi.object({
      user_id: Joi.number().integer().required(),
      beacon_id: Joi.string().max(50).allow(null, ''),
      rssi: Joi.number().integer().allow(null),
      battery_level: Joi.number().integer().min(0).max(100).allow(null),
    });
    const { error, value } = schema.validate(req.body);
    if (error) { error.isJoi = true; throw error; }

    const { user_id, beacon_id, rssi, battery_level } = value;

    // デバイス更新（オンライン化 + 位置 + バッテリー）
    const devResult = await query(
      `UPDATE devices SET
        is_online = true,
        last_seen = NOW(),
        last_heartbeat = NOW(),
        current_beacon_id = COALESCE($2, current_beacon_id),
        battery_level = COALESCE($3, battery_level)
       WHERE user_id = $1
       RETURNING *`,
      [user_id, beacon_id || null, battery_level]
    );

    // 位置履歴記録
    if (beacon_id) {
      await query(
        `INSERT INTO location_logs (user_id, device_id, beacon_id, rssi)
         VALUES ($1, $2, $3, $4)`,
        [user_id, devResult.rows[0]?.id || null, beacon_id, rssi || null]
      );
    }

    // バッテリー低下アラート（20%以下、既存activeアラートがなければ発報）
    if (battery_level !== null && battery_level !== undefined && battery_level <= 20) {
      const existing = await query(
        `SELECT id FROM alerts WHERE type='battery_low' AND user_id=$1 AND status='active'`,
        [user_id]
      );
      if (existing.rows.length === 0) {
        const userResult = await query('SELECT name FROM users WHERE id=$1', [user_id]);
        const alert = await query(
          `INSERT INTO alerts (type, severity, user_id, device_id, message)
           VALUES ('battery_low', $4, $1, $2, $3) RETURNING *`,
          [user_id, devResult.rows[0]?.id || null,
           `${userResult.rows[0]?.name || '端末'}の端末バッテリーが${battery_level}%です。充電してください`,
           battery_level <= 10 ? 'critical' : 'warning']
        );
        const io = req.app.locals.io;
        io.to('admin').emit('alert:new', alert.rows[0]);
        io.to('staff').emit('alert:new', alert.rows[0]);
      }
    } else if (battery_level !== null && battery_level !== undefined && battery_level > 30) {
      // 充電されたら自動解決
      await query(
        `UPDATE alerts SET status='resolved', resolved_at=NOW()
         WHERE type='battery_low' AND user_id=$1 AND status='active'`,
        [user_id]
      );
    }

    // オフラインアラートの自動解決
    await query(
      `UPDATE alerts SET status='resolved', resolved_at=NOW()
       WHERE type='offline' AND user_id=$1 AND status='active'`,
      [user_id]
    );

    // 所在マップのリアルタイム更新を管理画面へ
    if (beacon_id) {
      const io = req.app.locals.io;
      io.to('admin').emit('location:update', {
        user_id, beacon_id, rssi, battery_level,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ ok: true, server_time: new Date().toISOString() });
  } catch (error) { next(error); }
});

// GET /locations/presence - 全利用者の現在所在（フロアマップ用）
router.get('/presence', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id as user_id, u.name, u.room_number, u.role,
              d.id as device_id, d.is_online, d.battery_level, d.last_heartbeat,
              d.current_beacon_id,
              b.name as location_name, b.floor, b.area_type, b.map_x, b.map_y
       FROM users u
       JOIN devices d ON d.user_id = u.id
       LEFT JOIN beacons b ON b.beacon_id = d.current_beacon_id
       WHERE u.role = 'resident' AND u.is_active = true
       ORDER BY u.id`
    );
    res.json({ presence: result.rows });
  } catch (error) { next(error); }
});

// GET /locations/history/:userId - 利用者の位置履歴（徘徊検知・行動分析の土台）
router.get('/history/:userId', async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const result = await query(
      `SELECT l.*, b.name as location_name, b.floor, b.area_type
       FROM location_logs l
       LEFT JOIN beacons b ON b.beacon_id = l.beacon_id
       WHERE l.user_id = $1
       ORDER BY l.created_at DESC
       LIMIT $2`,
      [req.params.userId, Math.min(parseInt(limit), 200)]
    );
    res.json({ history: result.rows });
  } catch (error) { next(error); }
});

module.exports = router;
