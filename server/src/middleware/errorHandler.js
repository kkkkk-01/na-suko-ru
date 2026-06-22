const logger = require('../utils/logger');

// エラーハンドラーミドルウェア
const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message}`, {
    method: req.method,
    url: req.url,
    stack: err.stack,
  });

  // Joi バリデーションエラー
  if (err.isJoi) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'バリデーションエラー',
        details: err.details.map(d => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      },
    });
  }

  // カスタムアプリケーションエラー
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code || 'APPLICATION_ERROR',
        message: err.message,
      },
    });
  }

  // 未知のエラー
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? err.message
        : 'サーバーエラーが発生しました',
    },
  });
};

// カスタムエラークラス
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APPLICATION_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'リソース') {
    super(`${resource}が見つかりません`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = '競合が発生しました') {
    super(message, 409, 'CONFLICT');
  }
}

module.exports = { errorHandler, AppError, NotFoundError, ConflictError };
