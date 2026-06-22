const express = require('express');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { NotFoundError, ConflictError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// バリデーションスキーマ
const createUserSchema = Joi.object({
  name: Joi.string().max(100).required(),
  role: Joi.string().valid('resident', 'staff', 'admin').required(),
  extension: Joi.string().max(10),
  email: Joi.string().email().max(255),
  room_number: Joi.string().max(20),
});

const updateUserSchema = Joi.object({
  name: Joi.string().max(100),
  extension: Joi.string().max(10),
  email: Joi.string().email().max(255),
  room_number: Joi.string().max(20),
  is_active: Joi.boolean(),
});

// GET /users - ユーザー一覧
router.get('/', async (req, res, next) => {
  try {
    const { role, is_active, page = 1, per_page = 20 } = req.query;
    const offset = (page - 1) * per_page;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (role) {
      params.push(role);
      whereClause += ` AND role = $${params.length}`;
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      whereClause += ` AND is_active = $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM users ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(per_page, offset);
    const result = await query(
      `SELECT id, name, role, extension, email, room_number, is_active, created_at, updated_at
       FROM users ${whereClause}
       ORDER BY id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      users: result.rows,
      total,
      page: parseInt(page),
      per_page: parseInt(per_page),
    });
  } catch (error) {
    next(error);
  }
});

// GET /users/:id - ユーザー詳細
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.*, json_agg(
        json_build_object(
          'id', d.id,
          'device_type', d.device_type,
          'platform', d.platform,
          'sip_username', d.sip_username,
          'is_online', d.is_online,
          'last_seen', d.last_seen
        )
       ) FILTER (WHERE d.id IS NOT NULL) as devices
       FROM users u
       LEFT JOIN devices d ON d.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('ユーザー');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /users - ユーザー登録
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      throw error;
    }

    const { name, role, extension, email, room_number } = value;

    const result = await query(
      `INSERT INTO users (name, role, extension, email, room_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, role, extension, email, room_number]
    );

    logger.info(`User created: ${result.rows[0].id} - ${name} (${role})`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return next(new ConflictError('内線番号またはメールアドレスが既に使用されています'));
    }
    next(error);
  }
});

// PUT /users/:id - ユーザー更新
router.put('/:id', async (req, res, next) => {
  try {
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      throw error;
    }

    const fields = Object.entries(value).filter(([, v]) => v !== undefined);
    if (fields.length === 0) {
      return res.status(400).json({ error: { message: '更新するフィールドがありません' } });
    }

    const setClauses = fields.map(([key], i) => `${key} = $${i + 2}`);
    const params = [req.params.id, ...fields.map(([, v]) => v)];

    const result = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('ユーザー');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /users/:id - 論理削除
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE users SET is_active = false WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('ユーザー');
    }

    res.json({ message: 'ユーザーを無効化しました', user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
