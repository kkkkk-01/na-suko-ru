const express = require('express');
const { query, healthCheck } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /dashboard/stats - ダッシュボード統計
router.get('/stats', async (req, res, next) => {
  try {
    // 今日の統計
    const todayStats = await query(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE status = 'answered' OR status = 'ended') as answered_calls,
        COUNT(*) FILTER (WHERE status = 'missed') as missed_calls,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
        COALESCE(AVG(
          EXTRACT(EPOCH FROM (answered_at - started_at))
        ) FILTER (WHERE answered_at IS NOT NULL), 0) as avg_response_time,
        COALESCE(AVG(duration) FILTER (WHERE duration > 0), 0) as avg_duration
      FROM calls
      WHERE started_at >= CURRENT_DATE
    `);

    // デバイスステータス
    const deviceStats = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_online = true) as online,
        COUNT(*) FILTER (WHERE is_online = false) as offline
      FROM devices
    `);

    // 直近の通話
    const recentCalls = await query(`
      SELECT c.id, c.status, c.started_at, c.duration,
        json_build_object('id', u1.id, 'name', u1.name, 'room_number', u1.room_number) as caller,
        json_build_object('id', u2.id, 'name', u2.name) as callee
      FROM calls c
      JOIN users u1 ON u1.id = c.caller_id
      LEFT JOIN users u2 ON u2.id = c.callee_id
      ORDER BY c.started_at DESC
      LIMIT 10
    `);

    // 未読通知数
    const unreadNotifs = await query(`
      SELECT COUNT(*) FROM notifications WHERE status IN ('pending', 'sent')
    `);

    const today = todayStats.rows[0];

    res.json({
      today: {
        total_calls: parseInt(today.total_calls),
        answered_calls: parseInt(today.answered_calls),
        missed_calls: parseInt(today.missed_calls),
        failed_calls: parseInt(today.failed_calls),
        avg_response_time: parseFloat(today.avg_response_time).toFixed(1),
        avg_duration: parseFloat(today.avg_duration).toFixed(1),
      },
      active_devices: {
        online: parseInt(deviceStats.rows[0].online),
        offline: parseInt(deviceStats.rows[0].offline),
        total: parseInt(deviceStats.rows[0].total),
      },
      unread_notifications: parseInt(unreadNotifs.rows[0].count),
      recent_calls: recentCalls.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /dashboard/status - システムステータス
router.get('/status', async (req, res, next) => {
  try {
    const dbStatus = await healthCheck();

    // プロセス情報
    const memUsage = process.memoryUsage();

    res.json({
      api_server: 'healthy',
      database: dbStatus.status,
      asterisk: 'unknown', // Phase1ではAMIチェック未実装
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage: {
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        external_mb: Math.round(memUsage.external / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /dashboard/hourly - 時間帯別統計
router.get('/hourly', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        EXTRACT(HOUR FROM started_at) as hour,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('answered', 'ended')) as answered,
        COUNT(*) FILTER (WHERE status = 'missed') as missed
      FROM calls
      WHERE started_at >= CURRENT_DATE
      GROUP BY EXTRACT(HOUR FROM started_at)
      ORDER BY hour
    `);

    res.json({ hourly: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
