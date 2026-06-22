const express = require('express');
const { query } = require('../config/database');
const { NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// GET /notifications - 通知一覧
router.get('/', async (req, res, next) => {
  try {
    const { user_id, status, page = 1, per_page = 20 } = req.query;
    const offset = (page - 1) * per_page;
    const params = [];
    let whereClause = 'WHERE 1=1';

    if (user_id) {
      params.push(user_id);
      whereClause += ` AND n.callee_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      whereClause += ` AND n.status = $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM notifications n ${whereClause}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(per_page, offset);
    const result = await query(
      `SELECT n.*,
        json_build_object('id', u1.id, 'name', u1.name, 'room_number', u1.room_number) as caller,
        json_build_object('id', u2.id, 'name', u2.name) as callee
       FROM notifications n
       JOIN users u1 ON u1.id = n.caller_id
       LEFT JOIN users u2 ON u2.id = n.callee_id
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      notifications: result.rows,
      total,
      page: parseInt(page),
      per_page: parseInt(per_page),
    });
  } catch (error) {
    next(error);
  }
});

// PUT /notifications/:id/read - 通知既読
router.put('/:id/read', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE notifications SET status = 'read', read_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('通知');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
