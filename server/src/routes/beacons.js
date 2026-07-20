const express = require('express');
const Joi = require('joi');
const { query } = require('../config/database');
const { NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

const beaconSchema = Joi.object({
  beacon_id: Joi.string().max(50).required(),
  name: Joi.string().max(100).required(),
  floor: Joi.string().max(20).default('1F'),
  area_type: Joi.string().valid('room', 'toilet', 'bath', 'dining', 'common', 'corridor', 'entrance').default('room'),
  map_x: Joi.number().min(0).max(100).default(50),
  map_y: Joi.number().min(0).max(100).default(50),
});

// GET /beacons - ビーコン一覧
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM beacons WHERE is_active = true ORDER BY floor, beacon_id'
    );
    res.json({ beacons: result.rows });
  } catch (error) { next(error); }
});

// POST /beacons - ビーコン登録
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = beaconSchema.validate(req.body);
    if (error) { error.isJoi = true; throw error; }
    const { beacon_id, name, floor, area_type, map_x, map_y } = value;
    const result = await query(
      `INSERT INTO beacons (beacon_id, name, floor, area_type, map_x, map_y)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [beacon_id, name, floor, area_type, map_x, map_y]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

// PUT /beacons/:id - ビーコン更新
router.put('/:id', async (req, res, next) => {
  try {
    const { error, value } = beaconSchema.validate(req.body);
    if (error) { error.isJoi = true; throw error; }
    const { beacon_id, name, floor, area_type, map_x, map_y } = value;
    const result = await query(
      `UPDATE beacons SET beacon_id=$1, name=$2, floor=$3, area_type=$4, map_x=$5, map_y=$6
       WHERE id=$7 RETURNING *`,
      [beacon_id, name, floor, area_type, map_x, map_y, req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('ビーコン');
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

// DELETE /beacons/:id - ビーコン削除（論理削除）
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE beacons SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('ビーコン');
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

module.exports = router;
