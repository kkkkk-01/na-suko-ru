const express = require('express');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { NotFoundError, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// POST /calls/request - 呼出要求（利用者→職員）
router.post('/request', async (req, res, next) => {
  try {
    const schema = Joi.object({
      caller_id: Joi.number().integer().required(),
      callee_id: Joi.number().integer(),
      message: Joi.string().max(500).default('呼出'),
    });
    const { error, value } = schema.validate(req.body);
    if (error) { error.isJoi = true; throw error; }

    const { caller_id, callee_id, message } = value;

    // 発信者確認
    const callerResult = await query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [caller_id]
    );
    if (callerResult.rows.length === 0) {
      throw new NotFoundError('発信者');
    }

    // 着信者決定（指定なしの場合はオンラインの職員から選択）
    let targetCalleeId = callee_id;
    if (!targetCalleeId) {
      const staffResult = await query(
        `SELECT u.id FROM users u
         JOIN devices d ON d.user_id = u.id
         WHERE u.role = 'staff' AND u.is_active = true AND d.is_online = true
         ORDER BY RANDOM() LIMIT 1`
      );
      if (staffResult.rows.length === 0) {
        // オンライン職員がいない場合、最初のアクティブ職員
        const fallbackResult = await query(
          "SELECT id FROM users WHERE role = 'staff' AND is_active = true ORDER BY id LIMIT 1"
        );
        if (fallbackResult.rows.length === 0) {
          throw new AppError('対応可能な職員がいません', 503, 'NO_STAFF_AVAILABLE');
        }
        targetCalleeId = fallbackResult.rows[0].id;
      } else {
        targetCalleeId = staffResult.rows[0].id;
      }
    }

    // 着信者情報取得
    const calleeResult = await query(
      'SELECT id, name, extension FROM users WHERE id = $1',
      [targetCalleeId]
    );

    // 通話レコード作成
    const callResult = await query(
      `INSERT INTO calls (caller_id, callee_id, status, started_at)
       VALUES ($1, $2, 'ringing', NOW())
       RETURNING *`,
      [caller_id, targetCalleeId]
    );
    const call = callResult.rows[0];

    // 通話ログ記録
    await query(
      `INSERT INTO call_logs (call_id, event_type, description, metadata)
       VALUES ($1, 'initiated', $2, $3)`,
      [call.id, `呼出: ${message}`, JSON.stringify({ caller_id, callee_id: targetCalleeId })]
    );

    // Push通知 + WebSocket通知
    const notificationService = req.app.locals.notificationService;
    const notifResult = await notificationService.sendCallNotification(
      caller_id, targetCalleeId, call.id
    );

    logger.info(`Call request: ${caller_id} -> ${targetCalleeId} (call_id: ${call.id})`);

    res.status(201).json({
      call_id: call.id,
      notification_id: notifResult.notification.id,
      status: 'ringing',
      callee: calleeResult.rows[0],
      message: '通知を送信しました',
    });
  } catch (error) {
    next(error);
  }
});

// POST /calls/:id/answer - 通話応答
router.post('/:id/answer', async (req, res, next) => {
  try {
    const callId = req.params.id;

    const result = await query(
      `UPDATE calls SET status = 'answered', answered_at = NOW()
       WHERE id = $1 AND status = 'ringing'
       RETURNING *`,
      [callId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('通話');
    }

    const call = result.rows[0];

    // ログ記録
    await query(
      `INSERT INTO call_logs (call_id, event_type, description)
       VALUES ($1, 'answered', '通話応答')`,
      [callId]
    );

    // WebSocket通知
    const io = req.app.locals.io;
    io.emit('call:answered', { call_id: parseInt(callId), answered_at: call.answered_at });

    // SIP接続情報
    const callerDevice = await query(
      'SELECT sip_username FROM devices WHERE user_id = $1 LIMIT 1',
      [call.caller_id]
    );
    const calleeDevice = await query(
      'SELECT sip_username FROM devices WHERE user_id = $1 LIMIT 1',
      [call.callee_id]
    );

    logger.info(`Call answered: ${callId}`);

    res.json({
      call_id: parseInt(callId),
      status: 'answered',
      answered_at: call.answered_at,
      sip_info: {
        server: process.env.ASTERISK_HOST || 'localhost',
        caller_extension: callerDevice.rows[0]?.sip_username,
        callee_extension: calleeDevice.rows[0]?.sip_username,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /calls/:id/end - 通話終了
router.post('/:id/end', async (req, res, next) => {
  try {
    const callId = req.params.id;
    const { end_reason = 'normal' } = req.body;

    const result = await query(
      `UPDATE calls SET
        status = 'ended',
        ended_at = NOW(),
        duration = EXTRACT(EPOCH FROM (NOW() - COALESCE(answered_at, started_at)))::integer,
        end_reason = $2
       WHERE id = $1 AND status IN ('ringing', 'answered')
       RETURNING *`,
      [callId, end_reason]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('通話');
    }

    const call = result.rows[0];

    // ログ記録
    await query(
      `INSERT INTO call_logs (call_id, event_type, description, metadata)
       VALUES ($1, 'ended', $2, $3)`,
      [callId, `通話終了: ${end_reason}`, JSON.stringify({ duration: call.duration })]
    );

    // WebSocket通知
    const io = req.app.locals.io;
    io.emit('call:ended', {
      call_id: parseInt(callId),
      duration: call.duration,
      ended_at: call.ended_at,
    });

    logger.info(`Call ended: ${callId} (duration: ${call.duration}s)`);

    res.json({
      call_id: parseInt(callId),
      status: 'ended',
      duration: call.duration,
      ended_at: call.ended_at,
    });
  } catch (error) {
    next(error);
  }
});

// GET /calls - 通話履歴
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, per_page = 20, status, from, to } = req.query;
    const offset = (page - 1) * per_page;
    const params = [];
    let whereClause = 'WHERE 1=1';

    if (status) {
      params.push(status);
      whereClause += ` AND c.status = $${params.length}`;
    }
    if (from) {
      params.push(from);
      whereClause += ` AND c.started_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND c.started_at <= $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM calls c ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(per_page, offset);
    const result = await query(
      `SELECT c.*,
        json_build_object('id', u1.id, 'name', u1.name, 'room_number', u1.room_number, 'extension', u1.extension) as caller,
        json_build_object('id', u2.id, 'name', u2.name, 'extension', u2.extension) as callee
       FROM calls c
       JOIN users u1 ON u1.id = c.caller_id
       LEFT JOIN users u2 ON u2.id = c.callee_id
       ${whereClause}
       ORDER BY c.started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      calls: result.rows,
      total,
      page: parseInt(page),
      per_page: parseInt(per_page),
    });
  } catch (error) {
    next(error);
  }
});

// GET /calls/:id - 通話詳細
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.*,
        json_build_object('id', u1.id, 'name', u1.name, 'room_number', u1.room_number) as caller,
        json_build_object('id', u2.id, 'name', u2.name) as callee
       FROM calls c
       JOIN users u1 ON u1.id = c.caller_id
       LEFT JOIN users u2 ON u2.id = c.callee_id
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('通話');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /calls/:id/logs - 通話ログ
router.get('/:id/logs', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM call_logs WHERE call_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ logs: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /calls/asterisk/event - Asteriskイベント受信
router.post('/asterisk/event', async (req, res, next) => {
  try {
    const { event, caller, callee, channel, duration, status, disposition } = req.body;

    logger.info(`Asterisk event: ${event}`, { caller, callee, channel });

    // イベントに応じてDB更新
    if (event === 'ended' && channel) {
      await query(
        `UPDATE calls SET
          status = 'ended',
          ended_at = NOW(),
          duration = COALESCE($2::integer, duration),
          asterisk_channel = $1
         WHERE asterisk_channel = $1 OR
           (status IN ('ringing', 'answered') AND
            ended_at IS NULL)
         RETURNING id`,
        [channel, duration ? parseInt(duration) : null]
      );
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
