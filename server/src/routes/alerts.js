const express = require('express');
const { query } = require('../config/database');
const { NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// GET /alerts - アラート一覧
router.get('/', async (req, res, next) => {
  try {
    const { status = 'active', limit = 50 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (status !== 'all') {
      params.push(status);
      where += ` AND a.status = $${params.length}`;
    }
    params.push(Math.min(parseInt(limit), 200));
    const result = await query(
      `SELECT a.*, u.name as user_name, u.room_number
       FROM alerts a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ alerts: result.rows });
  } catch (error) { next(error); }
});

// PUT /alerts/:id/resolve - アラート解決
router.put('/:id/resolve', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE alerts SET status='resolved', resolved_at=NOW()
       WHERE id=$1 AND status='active' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('アラート');
    const io = req.app.locals.io;
    io.to('admin').emit('alert:resolved', { alert_id: parseInt(req.params.id) });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

module.exports = router;
