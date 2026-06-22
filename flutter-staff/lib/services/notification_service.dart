import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;

/// WebSocket + Push通知管理
class NotificationService extends ChangeNotifier {
  socket_io.Socket? _socket;
  bool _isConnected = false;
  final List<Map<String, dynamic>> _notifications = [];

  bool get isConnected => _isConnected;
  List<Map<String, dynamic>> get notifications => List.unmodifiable(_notifications);

  // サーバー接続URL（開発環境用）
  static const String wsUrl = 'http://10.0.2.2:3001';

  // WebSocket接続
  void connect({required int userId, Function(Map<String, dynamic>)? onIncomingCall}) {
    _socket = socket_io.io(wsUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
      'reconnection': true,
      'reconnectionDelay': 1000,
    });

    _socket!.onConnect((_) {
      debugPrint('WebSocket connected');
      _isConnected = true;
      _socket!.emit('join', {'user_id': userId, 'role': 'staff'});
      notifyListeners();
    });

    _socket!.onDisconnect((_) {
      debugPrint('WebSocket disconnected');
      _isConnected = false;
      notifyListeners();
    });

    // 着信通知
    _socket!.on('call:incoming', (data) {
      debugPrint('Incoming call: $data');
      final callData = data is Map<String, dynamic> ? data : jsonDecode(jsonEncode(data));
      _notifications.insert(0, {
        'type': 'call_incoming',
        'data': callData,
        'timestamp': DateTime.now().toIso8601String(),
        'read': false,
      });
      notifyListeners();
      onIncomingCall?.call(callData);
    });

    // 通知
    _socket!.on('notification:new', (data) {
      debugPrint('New notification: $data');
      final notifData = data is Map<String, dynamic> ? data : jsonDecode(jsonEncode(data));
      _notifications.insert(0, {
        'type': 'notification',
        'data': notifData,
        'timestamp': DateTime.now().toIso8601String(),
        'read': false,
      });
      notifyListeners();
    });

    // 通話終了
    _socket!.on('call:ended', (data) {
      debugPrint('Call ended: $data');
      notifyListeners();
    });

    _socket!.connect();
  }

  // 切断
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _isConnected = false;
    notifyListeners();
  }

  // 通知既読
  void markAsRead(int index) {
    if (index < _notifications.length) {
      _notifications[index]['read'] = true;
      notifyListeners();
    }
  }

  // 未読数
  int get unreadCount => _notifications.where((n) => n['read'] != true).length;

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
