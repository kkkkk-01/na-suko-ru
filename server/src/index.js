require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { apiKeyAuth } = require('./middleware/auth');
const { healthCheck } = require('./config/database');
const NotificationService = require('./services/notificationService');

// ルーター
const usersRouter = require('./routes/users');
const devicesRouter = require('./routes/devices');
const callsRouter = require('./routes/calls');
const notificationsRouter = require('./routes/notifications');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const server = http.createServer(app);

// Socket.IO 設定
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// 通知サービス初期化
const notificationService = new NotificationService(io);
app.locals.io = io;
app.locals.notificationService = notificationService;

// ============================================================
// ミドルウェア
// ============================================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ============================================================
// ヘルスチェック（認証不要）
// ============================================================
app.get('/api/v1/health', async (req, res) => {
  const dbStatus = await healthCheck();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    services: {
      database: dbStatus.status,
      websocket: io.engine.clientsCount >= 0 ? 'active' : 'inactive',
      websocket_clients: io.engine.clientsCount,
    },
  });
});

// ============================================================
// API認証
// ============================================================
app.use('/api/v1', apiKeyAuth);

// ============================================================
// APIルート
// ============================================================
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/devices', devicesRouter);
app.use('/api/v1/calls', callsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/dashboard', dashboardRouter);

// ============================================================
// エラーハンドリング
// ============================================================
app.use(errorHandler);

// ============================================================
// Socket.IO イベントハンドリング
// ============================================================
io.on('connection', (socket) => {
  logger.info(`WebSocket connected: ${socket.id}`);

  // ユーザールーム参加
  socket.on('join', (data) => {
    const { user_id, role } = data;
    socket.join(`user_${user_id}`);
    if (role === 'admin') {
      socket.join('admin');
    }
    if (role === 'staff') {
      socket.join('staff');
    }
    logger.info(`User ${user_id} (${role}) joined rooms`);
  });

  // 呼出要求（WebSocket経由）
  socket.on('call:request', async (data) => {
    try {
      const { caller_id } = data;
      logger.info(`WebSocket call request from user ${caller_id}`);

      // REST APIと同じロジックを使用
      const { query: dbQuery } = require('./config/database');

      // オンラインの職員を探す
      const staffResult = await dbQuery(
        `SELECT u.id FROM users u
         JOIN devices d ON d.user_id = u.id
         WHERE u.role = 'staff' AND u.is_active = true
         ORDER BY d.is_online DESC, RANDOM() LIMIT 1`
      );

      if (staffResult.rows.length === 0) {
        socket.emit('call:error', { message: '対応可能な職員がいません' });
        return;
      }

      const calleeId = staffResult.rows[0].id;

      // 通話レコード作成
      const callResult = await dbQuery(
        `INSERT INTO calls (caller_id, callee_id, status)
         VALUES ($1, $2, 'ringing') RETURNING *`,
        [caller_id, calleeId]
      );
      const call = callResult.rows[0];

      // 通知送信
      await notificationService.sendCallNotification(caller_id, calleeId, call.id);

      socket.emit('call:requested', {
        call_id: call.id,
        status: 'ringing',
      });
    } catch (error) {
      logger.error('WebSocket call request error:', error);
      socket.emit('call:error', { message: error.message });
    }
  });

  // 通話応答
  socket.on('call:answer', async (data) => {
    const { call_id } = data;
    logger.info(`Call answered via WebSocket: ${call_id}`);
    io.emit('call:answered', { call_id });
  });

  // 通話終了
  socket.on('call:end', async (data) => {
    const { call_id, reason } = data;
    logger.info(`Call ended via WebSocket: ${call_id}`);
    io.emit('call:ended', { call_id, reason });
  });

  // 切断
  socket.on('disconnect', (reason) => {
    logger.info(`WebSocket disconnected: ${socket.id} (${reason})`);
  });
});

// ============================================================
// サーバー起動
// ============================================================
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`==============================================`);
  logger.info(`  ナースコールシステム API サーバー`);
  logger.info(`  Phase1 - 技術検証版`);
  logger.info(`  Port: ${PORT}`);
  logger.info(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`==============================================`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

module.exports = { app, server, io };
