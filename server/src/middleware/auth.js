const logger = require('../utils/logger');

// シンプルなAPIキー認証（Phase1用）
const apiKeyAuth = (req, res, next) => {
  // ヘルスチェックはスキップ
  if (req.path === '/api/v1/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  const validKey = process.env.API_KEY || 'nursecall_api_key_dev';

  if (!apiKey || apiKey !== validKey) {
    logger.warn(`Auth failed: ${req.ip} ${req.method} ${req.path}`);
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'APIキーが無効です',
      },
    });
  }

  next();
};

module.exports = { apiKeyAuth };
