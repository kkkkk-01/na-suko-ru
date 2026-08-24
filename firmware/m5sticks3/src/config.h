// ナースコール名札端末 (M5StickS3) ハードウェア定義
#pragma once

// ===== ES8311 オーディオ (公式PinMapより) =====
#define PIN_I2S_MCLK 18   // 未使用 (ES8311はBCLKを内部MCLK化: REG01 bit7)
#define PIN_I2S_BCLK 17
#define PIN_I2S_LRCK 15
#define PIN_I2S_DOUT 16   // ESP32 → ES8311 DIN (スピーカー)
#define PIN_I2S_DIN  14   // ES8311 DOUT → ESP32 (マイク)

#define ES8311_ADDR 0x18
#define M5PM1_ADDR  0x6E
// M5PM1 GPIO3 = SPKアンプ(AW8737)有効化: reg 0x10=方向, 0x11=出力レベル, bit3
#define PM1_REG_GPIO_DIR 0x10
#define PM1_REG_GPIO_OUT 0x11
#define PM1_SPK_BIT      0x08

// ===== 音声パラメータ (G.711 ulaw 固定) =====
#define AUDIO_RATE   8000
#define RTP_PTIME_MS 20
#define RTP_SAMPLES  160          // 8000Hz * 0.02s
#define RTP_LOCAL_PORT 40000
#define RTP_PAYLOAD_PCMU 0

// ===== SIP =====
#define SIP_LOCAL_PORT 5060
#define SIP_EXPIRES    300        // REGISTER有効期間(秒)。1/2経過で再登録

// ===== 動作周期 =====
#define HEARTBEAT_INTERVAL_MS   30000
#define BLE_SCAN_INTERVAL_MS    15000
#define BLE_SCAN_DURATION_SEC   3
#define BLE_RSSI_FLOOR          (-90)  // これ未満は無視
#define BLE_HYSTERESIS_DB       6      // 現在地変更は+6dB以上強い場合のみ
#define BLE_AVG_WINDOW          3      // RSSI移動平均サンプル数

// ===== ボタン =====
#define HANGUP_HOLD_MS 1000       // 通話中 BtnA 長押し → BYE

// ===== プロビジョニング =====
#define SETUP_AP_PREFIX "NURSECALL-SETUP-"
