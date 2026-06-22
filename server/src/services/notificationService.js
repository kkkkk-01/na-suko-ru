const logger = require('../utils/logger');
const { query } = require('../config/database');

// FCM Push通知サービス
// Phase1ではFirebase Admin SDKを使用
// FCMが未設定の場合はログ出力のみで動作する
class NotificationService {
  constructor(io) {
    this.io = io;
    this.firebaseApp = null;
    this.initFirebase();
  }

  initFirebase() {
    try {
      if (process.env.FCM_PROJECT_ID && process.env.FCM_PROJECT_ID !== 'your-project-id') {
        const admin = require('firebase-admin');
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FCM_PROJECT_ID,
            privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FCM_CLIENT_EMAIL,
          }),
        });
        logger.info('Firebase Admin initialized');
      } else {
        logger.warn('FCM not configured - push notifications will be simulated');
      }
    } catch (error) {
      logger.error('Firebase initialization failed:', error.message);
    }
  }

  // Push通知送信
  async sendPushNotification(userId, title, body, data = {}) {
    try {
      // デバイストークン取得
      const result = await query(
        'SELECT device_token FROM devices WHERE user_id = $1 AND device_token IS NOT NULL',
        [userId]
      );

      if (result.rows.length === 0) {
        logger.warn(`No device token found for user ${userId}`);
        return { success: false, reason: 'no_device_token' };
      }

      const tokens = result.rows.map(r => r.device_token).filter(Boolean);

      if (this.firebaseApp && tokens.length > 0) {
        // FCM送信
        const admin = require('firebase-admin');
        const message = {
          notification: { title, body },
          data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
          tokens,
        };
        const response = await admin.messaging().sendEachForMulticast(message);
        logger.info(`FCM sent: ${response.successCount} success, ${response.failureCount} failed`);
        return {
          success: true,
          fcm_response: {
            successCount: response.successCount,
            failureCount: response.failureCount,
          },
        };
      } else {
        // FCM未設定時はシミュレーション
        logger.info(`[SIMULATED] Push to user ${userId}: ${title} - ${body}`);
        return { success: true, simulated: true };
      }
    } catch (error) {
      logger.error('Push notification error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // WebSocket通知（リアルタイム）
  sendWebSocketNotification(event, data, room = null) {
    if (room) {
      this.io.to(room).emit(event, data);
    } else {
      this.io.emit(event, data);
    }
    logger.debug(`WebSocket event: ${event} to ${room || 'all'}`);
  }

  // 呼出通知を送信
  async sendCallNotification(callerId, calleeId, callId) {
    // 発信者情報取得
    const callerResult = await query(
      'SELECT name, room_number, extension FROM users WHERE id = $1',
      [callerId]
    );
    const caller = callerResult.rows[0];

    const title = 'ナースコール';
    const body = `${caller.name}さん（${caller.room_number || ''}号室）から呼出があります`;

    // DB記録
    const notifResult = await query(
      `INSERT INTO notifications (caller_id, callee_id, call_id, type, status, message, sent_at)
       VALUES ($1, $2, $3, 'call_request', 'sent', $4, NOW())
       RETURNING *`,
      [callerId, calleeId, callId, body]
    );
    const notification = notifResult.rows[0];

    // Push通知
    const pushResult = await this.sendPushNotification(calleeId, title, body, {
      type: 'call_request',
      call_id: String(callId),
      caller_id: String(callerId),
      caller_name: caller.name,
      caller_room: caller.room_number || '',
    });

    // WebSocket通知
    this.sendWebSocketNotification('call:incoming', {
      call_id: callId,
      caller: {
        id: callerId,
        name: caller.name,
        room_number: caller.room_number,
        extension: caller.extension,
      },
      notification_id: notification.id,
      timestamp: new Date().toISOString(),
    }, `user_${calleeId}`);

    // 管理画面にも通知
    this.sendWebSocketNotification('notification:new', {
      ...notification,
      caller,
    }, 'admin');

    return { notification, pushResult };
  }
}

module.exports = NotificationService;
