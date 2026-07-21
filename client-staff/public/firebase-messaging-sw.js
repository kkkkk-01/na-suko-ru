/* ============================================================
 * ナースコール 職員画面用 Service Worker
 * 画面ロック中・ブラウザを閉じていてもFCMプッシュを受信して通知を表示する
 * ============================================================ */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Firebase設定をAPIから取得して初期化（設定はサーバー環境変数で一元管理）
const initPromise = (async () => {
  try {
    const res = await fetch('/api/v1/push/config', {
      headers: { 'X-API-Key': 'nursecall_api_key_dev' },
    });
    const data = await res.json();
    if (!data.enabled) return null;

    firebase.initializeApp(data.config);
    const messaging = firebase.messaging();

    // バックグラウンド受信（画面ロック中はここを通る）
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || 'ナースコール';
      const body = payload.notification?.body || '呼出があります';
      self.registration.showNotification(title, {
        body,
        icon: '/staff/icon-192.png',
        badge: '/staff/icon-192.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true, // タップするまで消えない
        tag: `nursecall-${payload.data?.call_id || Date.now()}`,
        data: payload.data || {},
      });
    });
    return messaging;
  } catch (e) {
    // FCM未設定時は何もしない
    return null;
  }
})();

// 通知タップ → 職員画面を開く/フォーカス
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find((c) => c.url.includes('/staff'));
    if (existing) {
      existing.focus();
    } else {
      self.clients.openWindow('/staff/');
    }
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
