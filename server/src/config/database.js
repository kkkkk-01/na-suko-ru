const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://nursecall:nursecall_dev_2024@localhost:5432/nursecall',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  logger.info('Database: New client connected');
});

pool.on('error', (err) => {
  logger.error('Database: Unexpected error on idle client', err);
});

// クエリヘルパー
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 80)}...`);
    return result;
  } catch (error) {
    logger.error(`Query error: ${error.message}`, { query: text, params });
    throw error;
  }
};

// トランザクションヘルパー
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ヘルスチェック
const healthCheck = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    return { status: 'connected', timestamp: result.rows[0].now };
  } catch (error) {
    return { status: 'disconnected', error: error.message };
  }
};

module.exports = { pool, query, transaction, healthCheck };
