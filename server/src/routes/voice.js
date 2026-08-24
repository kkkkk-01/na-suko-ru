const express = require('express');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================
// GET /voice/config?user_id=4
// 職員ブラウザ用のSIP接続設定を返す（JsSIPが使用）
//
// - sip_extension/password は devices テーブル（migration 003）から取得
// - ws_path はこのAPIサーバー自身がプロキシする /sip-ws
//   （nginx構成でも同パスで asterisk:8088 にプロキシされる）
// - 実機通話が未構成（Asterisk停止/内線未割当）の場合は enabled:false
//   → 職員画面は従来のブラウザ間P2P通話のみで動作（グレースフル）
// ============================================================
router.get('/config', async (req, res, next) => {
  try {
    const userId = parseInt(req.query.user_id);
    if (!userId) {
      return res.json({ enabled: false, reason: 'user_id required' });
    }

    const result = await query(
      `SELECT sip_username, sip_password FROM devices
       WHERE user_id = $1 AND device_type = 'web' AND sip_username IS NOT NULL
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ enabled: false, reason: 'no sip extension assigned' });
    }

    res.json({
      enabled: true,
      sip: {
        extension: result.rows[0].sip_username,
        password: result.rows[0].sip_password,
        ws_path: '/sip-ws',
        domain: 'nursecall.local',
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /voice/status - Asterisk側のSIP登録状況（デバッグ/管理用）
// 実機(1xxx)が今Asteriskに登録されているかをDBのis_onlineと合わせて返す
// ============================================================
router.get('/status', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.sip_username, d.device_type, d.is_online, d.last_heartbeat, u.name
       FROM devices d JOIN users u ON u.id = d.user_id
       WHERE d.sip_username IS NOT NULL
       ORDER BY d.sip_username`
    );
    res.json({ extensions: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
