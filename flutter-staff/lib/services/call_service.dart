import 'package:flutter/foundation.dart';

enum CallState {
  idle,       // 待機中
  incoming,   // 着信中
  connecting, // 接続中
  active,     // 通話中
  ended,      // 通話終了
}

class CallInfo {
  final int callId;
  final String callerName;
  final String callerRoom;
  final String callerExtension;
  final DateTime startedAt;

  CallInfo({
    required this.callId,
    required this.callerName,
    required this.callerRoom,
    required this.callerExtension,
    required this.startedAt,
  });

  factory CallInfo.fromJson(Map<String, dynamic> json) {
    return CallInfo(
      callId: json['call_id'] ?? 0,
      callerName: json['caller']?['name'] ?? json['caller_name'] ?? '不明',
      callerRoom: json['caller']?['room_number'] ?? json['caller_room'] ?? '',
      callerExtension: json['caller']?['extension'] ?? json['caller_extension'] ?? '',
      startedAt: DateTime.tryParse(json['timestamp'] ?? '') ?? DateTime.now(),
    );
  }
}

/// 通話管理サービス
/// Phase1: SIP/WebRTC統合前のUI/UXモック + API連携
class CallService extends ChangeNotifier {
  CallState _state = CallState.idle;
  CallInfo? _currentCall;
  Duration _callDuration = Duration.zero;

  CallState get state => _state;
  CallInfo? get currentCall => _currentCall;
  Duration get callDuration => _callDuration;

  // 着信受信
  void onIncomingCall(Map<String, dynamic> data) {
    _currentCall = CallInfo.fromJson(data);
    _state = CallState.incoming;
    notifyListeners();
  }

  // 通話応答
  void answerCall() {
    if (_state == CallState.incoming) {
      _state = CallState.connecting;
      notifyListeners();

      // Phase1: SIP接続をシミュレート
      Future.delayed(const Duration(seconds: 1), () {
        _state = CallState.active;
        _callDuration = Duration.zero;
        notifyListeners();
        _startDurationTimer();
      });
    }
  }

  // 通話拒否
  void rejectCall() {
    _state = CallState.ended;
    notifyListeners();
    _reset();
  }

  // 通話終了
  void endCall() {
    _state = CallState.ended;
    notifyListeners();
    _reset();
  }

  // 通話時間タイマー
  void _startDurationTimer() {
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (_state == CallState.active) {
        _callDuration += const Duration(seconds: 1);
        notifyListeners();
        return true;
      }
      return false;
    });
  }

  void _reset() {
    Future.delayed(const Duration(seconds: 2), () {
      _state = CallState.idle;
      _currentCall = null;
      _callDuration = Duration.zero;
      notifyListeners();
    });
  }
}
