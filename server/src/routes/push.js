const express = require('express');
const Joi = require('joi');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================
// GET /push/config - フロント用Firebase Web設定の配布
// （Web設定は公開情報。秘密鍵はサーバー側環境変数のみで保持）
// 未設定時は enabled:false を返し、フロントはFCM機能を非表示にする
// ============================================================
router.get('/config', (req, res) => {
  const cfg = {
    apiKey: process.env.FIREBASE_WEB_API_KEY,
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN,
    projectId: process.env.FCM_PROJECT_ID,
    messagingSenderId: process.env.FIREBASE_WEB_SENDER_ID,
    appId: process.env.FIREBASE_WEB_APP_ID,
  };
  const vapidKey = process.env.FIREBASE_WEB_VAPID_KEY;
  const enabled = !!(cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId && vapidKey
    && cfg.projectId !== 'your-project-id');

  res.json(enabled ? { enabled: true, config: cfg, vapidKey } : { enabled: false });
});

// ============================================================
// POST /push/register - FCMトークン登録
// body: { user_id, token, platform? }
// 同一ユーザーのwebデバイスにトークンを保存（無ければデバイス作成）
// ============================================================
router.post('/register', async (req, res, next) => {
  try {
    const schema = Joi.object({
      user_id: Joi.number().integer().required(),
      token: Joi.string().max(512).required(),
      platform: Joi.string().max(20).default('web'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) { error.isJoi = true; throw error; }

    const { user_id, token, platform } = value;

    // 別ユーザーに同じトークンが残っていれば掃除（スマホの使い回し対策）
    await query(
      'UPDATE devices SET device_token = NULL WHERE device_token = $1 AND user_id != $2',
      [token, user_id]
    );

    // 既存webデバイスに保存、無ければ作成
    const updated = await query(
      `UPDATE devices SET device_token = $2, platform = $3, is_online = true, last_seen = NOW()
       WHERE id = (SELECT id FROM devices WHERE user_id = $1 AND device_type = 'web' LIMIT 1)
       RETURNING id`,
      [user_id, token, platform]
    );

    let deviceId;
    if (updated.rows.length > 0) {
      deviceId = updated.rows[0].id;
    } else {
      const inserted = await query(
        `INSERT INTO devices (user_id, device_type, device_token, platform, is_online, last_seen)
         VALUES ($1, 'web', $2, $3, true, NOW()) RETURNING id`,
        [user_id, token, platform]
      );
      deviceId = inserted.rows[0].id;
    }

    logger.info(`FCM token registered: user=${user_id} device=${deviceId}`);
    res.json({ success: true, device_id: deviceId });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /push/test - テスト通知送信（動作確認用）
// body: { user_id }
// ============================================================
router.post('/test', async (req, res, next) => {
  try {
    const userId = parseInt(req.body.user_id, 10);
    if (!userId) return res.status(400).json({ error: 'user_id required' });

    const ns = req.app.get('notificationService');
    const result = await ns.sendPushNotification(
      userId,
      '🔔 テスト通知',
      'プッシュ通知は正常に動作しています（ナースコールシステム）',
      { type: 'test' }
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
