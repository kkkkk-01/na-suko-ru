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

  // 職員全員へのPush一斉送信（ポケットの中のスマホを鳴らす）
  async sendPushToAllStaff(title, body, data = {}) {
    try {
      const result = await query(
        `SELECT d.device_token FROM devices d
         JOIN users u ON u.id = d.user_id
         WHERE u.role = 'staff' AND u.is_active = true AND d.device_token IS NOT NULL`
      );
      const tokens = [...new Set(result.rows.map(r => r.device_token).filter(Boolean))];

      if (!this.firebaseApp || tokens.length === 0) {
        logger.info(`[SIMULATED] Push to all staff (${tokens.length} tokens): ${title} - ${body}`);
        return { success: true, simulated: true, tokens: tokens.length };
      }

      const admin = require('firebase-admin');
      const response = await admin.messaging().sendEachForMulticast({
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        tokens,
        webpush: {
          notification: {
            title, body,
            icon: '/staff/icon-192.png',
            badge: '/staff/icon-192.png',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true, // タップするまで消えない
            tag: `nursecall-${data.call_id || Date.now()}`,
          },
          fcmOptions: { link: '/staff/' },
        },
      });
      logger.info(`FCM staff broadcast: ${response.successCount} ok / ${response.failureCount} fail (${tokens.length} tokens)`);

      // 無効トークンの自動掃除
      response.responses.forEach((r, i) => {
        if (!r.success && /not-found|invalid-registration|unregistered/i.test(r.error?.code || '')) {
          query('UPDATE devices SET device_token = NULL WHERE device_token = $1', [tokens[i]])
            .catch(() => {});
        }
      });

      return { success: true, successCount: response.successCount, failureCount: response.failureCount };
    } catch (error) {
      logger.error('Staff push broadcast error:', error.message);
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

  // 呼出通知を送信（location: {beacon_id, name, rssi} 位置情報付き）
  async sendCallNotification(callerId, calleeId, callId, location = null) {
    // 発信者情報取得
    const callerResult = await query(
      'SELECT name, room_number, extension FROM users WHERE id = $1',
      [callerId]
    );
    const caller = callerResult.rows[0];

    const title = 'ナースコール';
    // 革命ポイント: 「どこから呼んだか」が分かる
    const locationText = location?.name
      ? `現在【${location.name}】付近`
      : `${caller.room_number || ''}号室`;
    const body = `${caller.name}さん・${locationText}から呼出があります`;

    // DB記録
    const notifResult = await query(
      `INSERT INTO notifications (caller_id, callee_id, call_id, type, status, message, sent_at)
       VALUES ($1, $2, $3, 'call_request', 'sent', $4, NOW())
       RETURNING *`,
      [callerId, calleeId, callId, body]
    );
    const notification = notifResult.rows[0];

    // Push通知：担当職員 + 職員全員に一斉（画面ロック中のスマホも鳴る）
    const pushData = {
      type: 'call_request',
      call_id: String(callId),
      caller_id: String(callerId),
      caller_name: caller.name,
      caller_room: caller.room_number || '',
    };
    const pushResult = await this.sendPushToAllStaff(title, body, pushData);

    // 着信ペイロード（位置情報付き）
    const incomingPayload = {
      call_id: callId,
      caller: {
        id: callerId,
        name: caller.name,
        room_number: caller.room_number,
        extension: caller.extension,
      },
      location: location ? {
        beacon_id: location.beacon_id,
        name: location.name,
        rssi: location.rssi ?? null,
      } : null,
      notification_id: notification.id,
      timestamp: new Date().toISOString(),
    };

    // WebSocket通知（担当職員宛）
    this.sendWebSocketNotification('call:incoming', incomingPayload, `user_${calleeId}`);

    // 職員全員（staffルーム）にも通知 — 職員Web画面が受信
    this.sendWebSocketNotification('call:incoming', incomingPayload, 'staff');

    // 管理画面にも通知
    this.sendWebSocketNotification('notification:new', {
      ...notification,
      caller,
      location,
    }, 'admin');

    // 無応答エスカレーション: 30秒後に未応答なら全員に再通知 + アラート
    this.scheduleEscalation(callId, incomingPayload);

    return { notification, pushResult };
  }

  // 呼出無応答エスカレーション（不達を必ず検知する仕組み）
  scheduleEscalation(callId, payload, delayMs = 30000) {
    setTimeout(async () => {
      try {
        const result = await query('SELECT status FROM calls WHERE id = $1', [callId]);
        if (result.rows.length > 0 && result.rows[0].status === 'ringing') {
          logger.warn(`Call ${callId} unanswered after ${delayMs / 1000}s - escalating`);

          // アラート発報
          const alert = await query(
            `INSERT INTO alerts (type, severity, user_id, call_id, message)
             VALUES ('unanswered_call', 'critical', $1, $2, $3) RETURNING *`,
            [payload.caller.id, callId,
             `${payload.caller.name}さんの呼出（${payload.location?.name || payload.caller.room_number + '号室'}）に${delayMs / 1000}秒間応答がありません`]
          );

          // エスカレーションはPushでも全職員に再通知（確実に気づかせる）
          this.sendPushToAllStaff(
            '⚠️ 呼出未応答エスカレーション',
            alert.rows[0].message,
            { type: 'escalation', call_id: String(callId) }
          ).catch(() => {});

          // 全職員 + 管理者にエスカレーション通知
          this.sendWebSocketNotification('call:escalation', {
            ...payload,
            alert_id: alert.rows[0].id,
            escalated_at: new Date().toISOString(),
          }, 'staff');
          this.sendWebSocketNotification('alert:new', alert.rows[0], 'admin');
        }
      } catch (err) {
        logger.error('Escalation check failed:', err.message);
      }
    }, delayMs);
  }
}

module.exports = NotificationService;
