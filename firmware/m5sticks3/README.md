# M5StickS3 ナースコール名札端末ファームウェア

`docs/ESP32_FIRMWARE_SPEC.md` 準拠の実機ファームウェア。
**呼出ボタン + BLE位置検知 + ハートビート + SIP自動応答通話 (G.711 ulaw)** をこれ1本で実装。

## 機能

| 操作/状態 | 動作 |
|---|---|
| **ボタンA (前面) 短押し** | 呼出送信 → 職員に着信 (スマホプッシュ含む) |
| 職員が「応答」 | 端末が**自動応答** → スピーカー/マイクで双方向通話 |
| **通話中 ボタンA 1秒長押し** | 通話終了 (BYE) |
| **ボタンB を押しながら電源ON** | 設定モード (Wi-Fi AP) に入る |
| 30秒ごと | ハートビート (位置 + 電池残量) を自動送信 |
| 15秒ごと | BLEビーコンスキャン → 最寄り位置更新 (通話中は停止) |

### 画面表示 (状態LEDの代替)

| 画面 | 意味 |
|---|---|
| 緑「オンライン」 | 正常稼働 (下部に 現在位置 / SIP登録状態 / 電池%) |
| オレンジ「呼出中」 | 呼出送信済み・職員の応答待ち |
| 緑「通話中」 | 通話中 (長押しで終了) |
| 赤「Wi-Fi切断」 | Wi-Fi再接続中 |
| 赤「送信失敗」 | 呼出が3回とも届かなかった (**職員に届いていない**ことの可視化) |

## 書き込み手順 (PC: Windows/Mac/Linux 共通)

### 1. PlatformIO のインストール

```bash
# Python がある環境なら1行 (VS Code拡張版でも可)
pip install platformio
```

### 2. 書き込み

M5StickS3 を USB-C で PC に接続して:

```bash
cd firmware/m5sticks3
pio run -t upload
```

- 自動でポート検出されます。失敗する場合はデバイス側面のリセットボタンを**長押し**して
  ダウンロードモード(内部緑LED点滅)にしてから再実行
- 初回は ESP32 ツールチェーンのダウンロードで数分かかります

### 3. シリアルモニタ (動作確認・任意)

```bash
pio device monitor
```

## 初期設定 (プロビジョニング)

初回起動時(または**ボタンBを押しながら電源ON**)は設定モードになります:

1. 画面に `SETUP MODE` と Wi-Fi AP名 (`NURSECALL-SETUP-xxxx`) が表示される
2. スマホ/PCでその Wi-Fi に接続 → ブラウザで `http://192.168.4.1/` を開く
3. 以下を入力して保存 → 自動再起動:

| 項目 | 値 (開発環境の例) |
|---|---|
| 施設Wi-Fi SSID / パスワード | 施設のWi-Fi (**2.4GHz帯のみ対応**) |
| サーバーIP | 施設PCのIP (例 `192.168.1.50`) |
| APIポート | `3001` (docker compose構成) / サンドボックスは `3000` |
| APIキー | `nursecall_api_key_dev` |
| 利用者ID | `1` (田中太郎に紐付け済み) |
| SIP内線番号 | `1001` |
| SIPパスワード | `res1001_dev` |
| SIPドメイン | `nursecall.local` |
| ビーコンUUID | 空でOK (施設ビーコン導入後に設定) |

> SIP資格情報は `server/migrations/003_sip_extensions.sql` と `asterisk/config/pjsip.conf` に一致。
> 本番運用前にパスワード変更 (docs/VOICE_CALL_SETUP.md のチェックリスト参照)

## 通話の仕組み (施設運用構成)

```
① ボタンA → REST POST /calls/request (位置情報付き)
② サーバー → 職員へ Socket.IO + FCMプッシュ (payload に sip_extension)
③ 職員「応答」→ ブラウザ(JsSIP) が内線1001へSIP発信
④ 本ファームが INVITE を自動応答 (200 OK) → RTP/G.711 ulaw 双方向通話
```

- SIP: UDP/5060、REGISTER 300秒 (半分経過で自動再登録)
- 音声: G.711 ulaw 8kHz / 20ms RTP、ES8311コーデック全二重
- スピーカーアンプ (AW8737) は通話中のみON (省電力・M5PM1経由制御)

## BLEビーコン規約 (施設ビーコン設置時)

iBeacon の Major/Minor を次の規約で設定するとサーバーの beacons テーブルと自動対応:

| Major | Minor | beacon_id |
|---|---|---|
| 1 (居室) | 部屋番号 (101等) | `BCN-101` 等 |
| 2 (共用) | 1 | `BCN-TOILET` |
| 2 | 2 | `BCN-BATH` |
| 2 | 3 | `BCN-DINING` |
| 2 | 4 | `BCN-COMMON` |
| 2 | 5 | `BCN-ENT` |

判定ロジック: RSSI移動平均3サンプル + ヒステリシス+6dB (仕様書§3で机上検証済み・ふらつき96%削減)

## ファイル構成

```
src/
├── main.cpp          # メインループ (ボタン/ハートビート/状態画面)
├── config.h          # ピン定義・動作パラメータ
├── provisioning.hpp  # 初期設定ポータル (SoftAP + NVS保存)
├── sip.hpp           # 最小SIP UA (REGISTER/Digest認証/自動応答/BYE)
├── rtp.hpp           # RTP送受信 (PCMU)
├── g711.h            # G.711 u-law コーデック
├── audio.hpp         # ES8311全二重I2S + AW8737アンプ制御 + ビープ
└── beacon.hpp        # NimBLE iBeaconスキャン + 最寄り判定
```

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 書き込みポートが見つからない | リセットボタン長押し→ダウンロードモードで再実行 |
| Wi-Fiに繋がらない | 2.4GHz帯か確認。SSID/パスワード再設定 (BtnB押し起動) |
| SIP:-- のまま | サーバーIPとSIPパスワード確認。施設PCで `docker compose logs asterisk` |
| 呼出が届くが通話にならない | ファイアウォールで UDP 5060 / 10000-10100 / 40000 を許可 |
| スピーカー音が小さい | `audio.hpp` の DAC音量 (REG 0x32) を 0xBF→0xC8 程度に |
| マイク感度不足 | `audio.hpp` の PGA (REG 0x14) を 0x10→0x14 (+12dB) に |
| 電池駆動で通話中に再起動 | 仕様 (音量75%超は非推奨)。DAC音量を下げる |
