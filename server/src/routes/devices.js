const express = require('express');
const Joi = require('joi');
const { query } = require('../config/database');
const { NotFoundError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// バリデーションスキーマ
const createDeviceSchema = Joi.object({
  user_id: Joi.number().integer().required(),
  device_type: Joi.string().valid('esp32', 'android', 'ios', 'web').required(),
  device_token: Joi.string().max(512).allow(null, ''),
  platform: Joi.string().max(20),
  sip_username: Joi.string().max(50),
  sip_password: Joi.string().max(100),
});

// GET /devices - デバイス一覧
router.get('/', async (req, res, next) => {
  try {
    const { user_id, is_online } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (user_id) {
      params.push(user_id);
      whereClause += ` AND d.user_id = $${params.length}`;
    }
    if (is_online !== undefined) {
      params.push(is_online === 'true');
      whereClause += ` AND d.is_online = $${params.length}`;
    }

    const result = await query(
      `SELECT d.*, u.name as user_name, u.role as user_role, u.extension
       FROM devices d
       JOIN users u ON u.id = d.user_id
       ${whereClause}
       ORDER BY d.id ASC`,
      params
    );

    res.json({ devices: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /devices - デバイス登録
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createDeviceSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      throw error;
    }

    const { user_id, device_type, device_token, platform, sip_username, sip_password } = value;

    const result = await query(
      `INSERT INTO devices (user_id, device_type, device_token, platform, sip_username, sip_password)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, device_type, platform, sip_username, is_online, created_at`,
      [user_id, device_type, device_token, platform, sip_username, sip_password]
    );

    logger.info(`Device registered: ${result.rows[0].id} for user ${user_id}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /devices/:id/status - ステータス更新
router.put('/:id/status', async (req, res, next) => {
  try {
    const { is_online } = req.body;
    const result = await query(
      `UPDATE devices SET is_online = $2, last_seen = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, is_online]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('デバイス');
    }

    // WebSocket通知
    if (req.app.locals.io) {
      req.app.locals.io.emit('device:status', {
        device_id: parseInt(req.params.id),
        is_online,
        last_seen: new Date().toISOString(),
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /devices/:id/token - FCMトークン更新
router.put('/:id/token', async (req, res, next) => {
  try {
    const { device_token } = req.body;
    const result = await query(
      'UPDATE devices SET device_token = $2 WHERE id = $1 RETURNING id, user_id, device_type',
      [req.params.id, device_token]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('デバイス');
    }

    logger.info(`Device token updated: ${req.params.id}`);
    res.json({ message: 'トークンを更新しました', device: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /devices/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM devices WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('デバイス');
    }

    res.json({ message: 'デバイスを削除しました' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
