import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ApiService extends ChangeNotifier {
  // 開発環境のAPIサーバーURL（PCのローカルIPに変更すること）
  static const String baseUrl = 'http://10.0.2.2:3001/api/v1';
  static const String apiKey = 'nursecall_api_key_dev';

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

  // GET リクエスト
  Future<Map<String, dynamic>> get(String path) async {
    final response = await http.get(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
    );
    return _handleResponse(response);
  }

  // POST リクエスト
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }

  // PUT リクエスト
  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) async {
    final response = await http.put(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return data;
    } else {
      throw Exception(data['error']?['message'] ?? 'APIエラー: ${response.statusCode}');
    }
  }

  // 通話応答
  Future<Map<String, dynamic>> answerCall(int callId) =>
    post('/calls/$callId/answer', {});

  // 通話終了
  Future<Map<String, dynamic>> endCall(int callId, {String reason = 'normal'}) =>
    post('/calls/$callId/end', {'end_reason': reason});

  // 通話履歴取得
  Future<Map<String, dynamic>> getCallHistory({int page = 1, int perPage = 20}) =>
    get('/calls?page=$page&per_page=$perPage');

  // 通知一覧
  Future<Map<String, dynamic>> getNotifications({int userId = 0, int page = 1}) =>
    get('/notifications?user_id=$userId&page=$page');

  // デバイストークン更新
  Future<Map<String, dynamic>> updateDeviceToken(int deviceId, String token) =>
    put('/devices/$deviceId/token', {'device_token': token});

  // デバイスステータス更新
  Future<Map<String, dynamic>> updateDeviceStatus(int deviceId, bool isOnline) =>
    put('/devices/$deviceId/status', {'is_online': isOnline});

  // ヘルスチェック
  Future<Map<String, dynamic>> healthCheck() => get('/health');
}
