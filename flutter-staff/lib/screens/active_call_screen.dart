import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/call_service.dart';
import '../services/api_service.dart';

/// 通話中画面
class ActiveCallScreen extends StatelessWidget {
  const ActiveCallScreen({super.key});

  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes.toString().padLeft(2, '0');
    final seconds = (duration.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CallService>(
      builder: (context, callService, _) {
        final call = callService.currentCall;
        final isConnecting = callService.state == CallState.connecting;

        return Scaffold(
          backgroundColor: const Color(0xFF0d7a3e),
          body: SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 48),

                // ステータス
                Text(
                  isConnecting ? '接続中...' : '通話中',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.white70,
                  ),
                ),
                const SizedBox(height: 8),

                // 通話時間
                Text(
                  _formatDuration(callService.callDuration),
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    color: Colors.white,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w300,
                  ),
                ),

                const Spacer(flex: 2),

                // 通話相手情報
                Container(
                  width: 100, height: 100,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withOpacity(0.15),
                  ),
                  child: const Icon(
                    Icons.person,
                    size: 56,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 24),

                Text(
                  call?.callerName ?? '利用者',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (call?.callerRoom.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      '${call!.callerRoom}号室',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: Colors.white60,
                      ),
                    ),
                  ),

                const Spacer(flex: 3),

                // 操作ボタン群
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    // ミュートボタン（Phase1: UIのみ）
                    _RoundButton(
                      icon: Icons.mic_off,
                      label: 'ミュート',
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Phase1: ミュート機能は未実装')),
                        );
                      },
                    ),

                    // 終了ボタン
                    Column(
                      children: [
                        SizedBox(
                          width: 80, height: 80,
                          child: ElevatedButton(
                            onPressed: () {
                              callService.endCall();
                              if (call != null) {
                                context.read<ApiService>().endCall(call.callId);
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.red,
                              foregroundColor: Colors.white,
                              shape: const CircleBorder(),
                              elevation: 4,
                            ),
                            child: const Icon(Icons.call_end, size: 36),
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          '終了',
                          style: TextStyle(color: Colors.white70, fontSize: 14),
                        ),
                      ],
                    ),

                    // スピーカーボタン（Phase1: UIのみ）
                    _RoundButton(
                      icon: Icons.volume_up,
                      label: 'スピーカー',
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Phase1: スピーカー切替は未実装')),
                        );
                      },
                    ),
                  ],
                ),

                const SizedBox(height: 48),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  const _RoundButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: 56, height: 56,
          child: ElevatedButton(
            onPressed: onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white.withOpacity(0.2),
              foregroundColor: Colors.white,
              shape: const CircleBorder(),
              padding: EdgeInsets.zero,
            ),
            child: Icon(icon, size: 24),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 12),
        ),
      ],
    );
  }
}
