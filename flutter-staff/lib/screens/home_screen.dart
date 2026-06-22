import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/call_service.dart';
import '../services/notification_service.dart';
import '../services/api_service.dart';
import 'incoming_call_screen.dart';
import 'active_call_screen.dart';
import 'call_history_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    // WebSocket接続
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final notifService = context.read<NotificationService>();
      final callService = context.read<CallService>();

      notifService.connect(
        userId: 4, // Phase1: 固定の職員ID（山田看護師）
        onIncomingCall: (data) {
          callService.onIncomingCall(data);
          // 着信画面を表示
          if (mounted) {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => const IncomingCallScreen(),
                fullscreenDialog: true,
              ),
            );
          }
        },
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CallService>(
      builder: (context, callService, _) {
        // 通話中は通話画面を表示
        if (callService.state == CallState.active ||
            callService.state == CallState.connecting) {
          return const ActiveCallScreen();
        }

        return Scaffold(
          appBar: AppBar(
            title: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.local_hospital, size: 24),
                SizedBox(width: 8),
                Text('ナースコール', style: TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
            actions: [
              // 接続ステータス
              Consumer<NotificationService>(
                builder: (context, notifService, _) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(
                      children: [
                        Container(
                          width: 8, height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: notifService.isConnected
                                ? Colors.green
                                : Colors.red,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          notifService.isConnected ? '接続中' : '切断',
                          style: TextStyle(
                            fontSize: 12,
                            color: notifService.isConnected
                                ? Colors.green
                                : Colors.red,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
          body: IndexedStack(
            index: _currentIndex,
            children: [
              const _WaitingScreen(),
              const CallHistoryScreen(),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _currentIndex,
            onDestinationSelected: (index) {
              setState(() => _currentIndex = index);
            },
            destinations: [
              NavigationDestination(
                icon: Consumer<NotificationService>(
                  builder: (context, notifService, child) {
                    return Badge(
                      isLabelVisible: notifService.unreadCount > 0,
                      label: Text('${notifService.unreadCount}'),
                      child: const Icon(Icons.home_outlined),
                    );
                  },
                ),
                selectedIcon: const Icon(Icons.home),
                label: '待機',
              ),
              const NavigationDestination(
                icon: Icon(Icons.history_outlined),
                selectedIcon: Icon(Icons.history),
                label: '履歴',
              ),
            ],
          ),
        );
      },
    );
  }
}

/// 待機画面
class _WaitingScreen extends StatelessWidget {
  const _WaitingScreen();

  @override
  Widget build(BuildContext context) {
    return Consumer<NotificationService>(
      builder: (context, notifService, _) {
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // ステータスアイコン
              Container(
                width: 120, height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: notifService.isConnected
                      ? Colors.green.withOpacity(0.1)
                      : Colors.red.withOpacity(0.1),
                ),
                child: Icon(
                  notifService.isConnected
                      ? Icons.headset_mic
                      : Icons.signal_wifi_off,
                  size: 56,
                  color: notifService.isConnected ? Colors.green : Colors.red,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                notifService.isConnected ? '待機中' : '接続中...',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: notifService.isConnected ? Colors.green : Colors.grey,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                notifService.isConnected
                    ? '利用者からの呼出を待っています'
                    : 'サーバーに接続しています...',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Colors.grey,
                ),
              ),
              const SizedBox(height: 48),

              // 最近の通知
              if (notifService.notifications.isNotEmpty) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    '最新の通知',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: Colors.grey[600],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                ...notifService.notifications.take(3).map((notif) {
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: notif['read'] == true
                          ? Colors.grey[100]
                          : Colors.blue[50],
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: notif['read'] == true
                            ? Colors.grey[300]!
                            : Colors.blue[200]!,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.notifications,
                          color: notif['read'] == true
                              ? Colors.grey
                              : Colors.blue,
                          size: 20,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                notif['data']?['caller']?['name'] ?? '呼出通知',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              Text(
                                notif['timestamp'] ?? '',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey[500],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ],
          ),
        );
      },
    );
  }
}
