import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

/// 通話履歴画面
class CallHistoryScreen extends StatefulWidget {
  const CallHistoryScreen({super.key});

  @override
  State<CallHistoryScreen> createState() => _CallHistoryScreenState();
}

class _CallHistoryScreenState extends State<CallHistoryScreen> {
  List<dynamic> _calls = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchHistory();
  }

  Future<void> _fetchHistory() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await context.read<ApiService>().getCallHistory();
      setState(() {
        _calls = data['calls'] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'answered': case 'ended': return Icons.call;
      case 'missed': return Icons.phone_missed;
      case 'ringing': return Icons.ring_volume;
      case 'failed': return Icons.error;
      default: return Icons.phone;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'answered': case 'ended': return Colors.green;
      case 'missed': return Colors.red;
      case 'ringing': return Colors.orange;
      case 'failed': return Colors.red;
      default: return Colors.grey;
    }
  }

  String _statusText(String status) {
    switch (status) {
      case 'answered': return '応答';
      case 'ended': return '終了';
      case 'missed': return '不在';
      case 'ringing': return '呼出中';
      case 'failed': return '失敗';
      default: return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red[300]),
            const SizedBox(height: 16),
            Text('データ取得失敗', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _fetchHistory,
              icon: const Icon(Icons.refresh),
              label: const Text('再試行'),
            ),
          ],
        ),
      );
    }

    if (_calls.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 48, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              '通話履歴はありません',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchHistory,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _calls.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final call = _calls[index];
          final status = call['status'] ?? '';
          final caller = call['caller'] ?? {};
          final callee = call['callee'] ?? {};
          final duration = call['duration'] ?? 0;

          return ListTile(
            leading: CircleAvatar(
              backgroundColor: _statusColor(status).withOpacity(0.1),
              child: Icon(
                _statusIcon(status),
                color: _statusColor(status),
                size: 22,
              ),
            ),
            title: Text(
              '${caller['name'] ?? '不明'} → ${callee['name'] ?? '不明'}',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),
            subtitle: Text(
              '${_statusText(status)}${duration > 0 ? ' (${(duration ~/ 60)}分${duration % 60}秒)' : ''}',
              style: TextStyle(
                fontSize: 13,
                color: _statusColor(status),
              ),
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  _formatDate(call['started_at']),
                  style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                ),
                Text(
                  _formatTime(call['started_at']),
                  style: TextStyle(fontSize: 11, color: Colors.grey[400]),
                ),
              ],
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          );
        },
      ),
    );
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return '';
    final date = DateTime.tryParse(dateStr);
    if (date == null) return '';
    return '${date.month}/${date.day}';
  }

  String _formatTime(String? dateStr) {
    if (dateStr == null) return '';
    final date = DateTime.tryParse(dateStr);
    if (date == null) return '';
    return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}
