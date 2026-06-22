import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/call_service.dart';
import '../services/api_service.dart';

/// 着信画面
class IncomingCallScreen extends StatelessWidget {
  const IncomingCallScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<CallService>(
      builder: (context, callService, _) {
        final call = callService.currentCall;

        if (callService.state != CallState.incoming) {
          // 着信でなくなったら閉じる
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop();
            }
          });
        }

        return Scaffold(
          backgroundColor: const Color(0xFF1a237e),
          body: SafeArea(
            child: Column(
              children: [
                const Spacer(flex: 2),

                // 着信アイコン
                Container(
                  width: 120, height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withOpacity(0.15),
                  ),
                  child: const Icon(
                    Icons.phone_callback,
                    size: 56,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 32),

                // 呼出元情報
                Text(
                  '利用者からの呼出',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.white70,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  call?.callerName ?? '不明',
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (call?.callerRoom.isNotEmpty == true)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      '${call!.callerRoom}号室',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: Colors.white60,
                      ),
                    ),
                  ),

                const Spacer(flex: 3),

                // 操作ボタン
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    // 拒否ボタン
                    _CallActionButton(
                      icon: Icons.call_end,
                      label: '拒否',
                      color: Colors.red,
                      onPressed: () {
                        callService.rejectCall();
                        if (call != null) {
                          context.read<ApiService>().endCall(
                            call.callId,
                            reason: 'rejected',
                          );
                        }
                        Navigator.of(context).pop();
                      },
                    ),

                    // 応答ボタン
                    _CallActionButton(
                      icon: Icons.call,
                      label: '応答',
                      color: Colors.green,
                      onPressed: () {
                        callService.answerCall();
                        if (call != null) {
                          context.read<ApiService>().answerCall(call.callId);
                        }
                        Navigator.of(context).pop();
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

class _CallActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onPressed;

  const _CallActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: 72, height: 72,
          child: ElevatedButton(
            onPressed: onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: color,
              foregroundColor: Colors.white,
              shape: const CircleBorder(),
              padding: EdgeInsets.zero,
              elevation: 4,
            ),
            child: Icon(icon, size: 32),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 14),
        ),
      ],
    );
  }
}
