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
const beaconsRouter = require('./routes/beacons');
const locationsRouter = require('./routes/locations');
const alertsRouter = require('./routes/alerts');

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
app.use('/api/v1/beacons', beaconsRouter);
app.use('/api/v1/locations', locationsRouter);
app.use('/api/v1/alerts', alertsRouter);

// ============================================================
// 静的UI配信（単一サーバーで全画面を提供。Dockerではnginxが同等の役割）
// ============================================================
const path = require('path');
app.use('/user', express.static(path.join(__dirname, '../../client-user/public')));
app.use('/staff', express.static(path.join(__dirname, '../../client-staff/public')));
app.use('/admin', express.static(path.join(__dirname, '../../client-admin/public')));
app.get('/', (req, res) => res.redirect('/admin/'));

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

      // 位置情報解決（ハートビートの最新位置）
      let location = null;
      const devLoc = await dbQuery(
        `SELECT b.beacon_id, b.name, b.floor, b.area_type
         FROM devices d JOIN beacons b ON b.beacon_id = d.current_beacon_id
         WHERE d.user_id = $1 LIMIT 1`,
        [caller_id]
      );
      if (devLoc.rows.length > 0) location = { ...devLoc.rows[0], rssi: null };

      // 通知送信（位置情報付き）
      await notificationService.sendCallNotification(caller_id, calleeId, call.id, location);

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

  // ============================================================
  // WebRTC シグナリング（ブラウザ間P2P音声通話）
  // Asteriskなしでも双方向通話を実現（将来はAsterisk/SIPに差替可）
  // ============================================================
  socket.on('webrtc:offer', (data) => {
    const { to_user_id, call_id, sdp, from_user_id } = data;
    io.to(`user_${to_user_id}`).emit('webrtc:offer', { call_id, sdp, from_user_id });
    logger.info(`WebRTC offer relayed: ${from_user_id} -> ${to_user_id} (call ${call_id})`);
  });

  socket.on('webrtc:answer', (data) => {
    const { to_user_id, call_id, sdp, from_user_id } = data;
    io.to(`user_${to_user_id}`).emit('webrtc:answer', { call_id, sdp, from_user_id });
    logger.info(`WebRTC answer relayed: ${from_user_id} -> ${to_user_id}`);
  });

  socket.on('webrtc:ice', (data) => {
    const { to_user_id, call_id, candidate, from_user_id } = data;
    io.to(`user_${to_user_id}`).emit('webrtc:ice', { call_id, candidate, from_user_id });
  });

  // 切断
  socket.on('disconnect', (reason) => {
    logger.info(`WebSocket disconnected: ${socket.id} (${reason})`);
  });
});

// ============================================================
// オフライン監視ウォッチドッグ（60秒ごと）
// ハートビートが90秒途絶えた利用者端末をオフライン判定→アラート
// 「不達を必ず検知する」仕組みの中核
// ============================================================
const { query: watchdogQuery } = require('./config/database');

setInterval(async () => {
  try {
    // タイムアウトした端末をオフライン化
    const timedOut = await watchdogQuery(
      `UPDATE devices SET is_online = false
       WHERE is_online = true
         AND last_heartbeat IS NOT NULL
         AND last_heartbeat < NOW() - INTERVAL '90 seconds'
         AND device_type IN ('esp32', 'web')
       RETURNING id, user_id`
    );

    for (const dev of timedOut.rows) {
      const existing = await watchdogQuery(
        `SELECT id FROM alerts WHERE type='offline' AND device_id=$1 AND status='active'`,
        [dev.id]
      );
      if (existing.rows.length === 0) {
        const userResult = await watchdogQuery('SELECT name, room_number FROM users WHERE id=$1', [dev.user_id]);
        const u = userResult.rows[0] || {};
        const alert = await watchdogQuery(
          `INSERT INTO alerts (type, severity, user_id, device_id, message)
           VALUES ('offline', 'critical', $1, $2, $3) RETURNING *`,
          [dev.user_id, dev.id,
           `${u.name || '端末'}さん（${u.room_number || '-'}号室）の端末がオフラインになりました。電源・電波状態を確認してください`]
        );
        io.to('admin').emit('alert:new', alert.rows[0]);
        io.to('staff').emit('alert:new', alert.rows[0]);
        logger.warn(`Device offline alert: user ${dev.user_id}`);
      }
    }
  } catch (err) {
    logger.error('Watchdog error:', err.message);
  }
}, 60000);

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

// ============================================================
// 障害時ポリシー: 「不明な状態で生き続けない」
// 予期しない例外 = プロセスの内部状態が保証できない状態。
// ログを残して即終了し、Docker/PM2 の restart 機構に数秒で
// 再起動させる（クラッシュオンリー設計・業界標準）。
// ============================================================
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception (restarting process):', error);
  // ログをフラッシュする猶予を与えてから終了 → supervisor が自動再起動
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection (restarting process):', reason);
  setTimeout(() => process.exit(1), 500);
});

module.exports = { app, server, io };
