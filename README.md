# 🏥 ウェアラブルナースコールシステム Phase2 - 施設実証モデル

## プロジェクト概要

- **名称**: ウェアラブルナースコールシステム（"ナースコール界のAir端末"）
- **ゴール**: 従来の有線ナースコール（工事必須・固定・高額）を、**工事不要・持ち運べる・その場で通話できる**無線システムで置き換える
- **現状**: Phase2（施設実証モデル）— BLE位置検知・アラート監視・双方向通話まで実装済み

### 革命の3点セット
1. 🔧 **工事不要** — Wi-Fi + 電池式BLEビーコンのみ。配線ゼロ
2. 🚶 **持ち運べる** — 名札型端末を常時携帯。**どこから呼んだかが分かる**（BLE位置検知）
3. 📞 **その場で通話** — 呼出→職員応答→双方向音声通話（WebRTC）

## デモURL（サンドボックス）

| 画面 | パス | 内容 |
|---|---|---|
| 利用者端末 | `/user/` | 呼出ボタン + ビーコンシミュレーター + バッテリーシミュレーター |
| 職員端末 | `/staff/` | 位置付き着信・応答・通話・アラート・履歴 |
| 管理センター | `/admin/` | リアルタイム所在マップ・端末監視・アラート・統計 |

## 完成済み機能

### コア機能
- ✅ 呼出ボタン → 職員へリアルタイム通知（Socket.IO）
- ✅ **BLE位置検知**: 呼出時に「田中さん・現在【トイレ】付近から呼出」と表示
- ✅ 職員Web画面での応答・通話・履歴確認
- ✅ ブラウザ間WebRTC双方向音声通話（STUN経由、将来Asterisk/SIPに差替可）
- ✅ リアルタイム所在マップ（フロアマップ上に利用者の現在地を表示）

### 監視・アラート（"不達を必ず検知する"仕組み）
- ✅ 端末ハートビート（30秒間隔、位置+バッテリー報告）
- ✅ オフライン検知ウォッチドッグ（90秒途絶→自動アラート）
- ✅ バッテリー低下アラート（20%以下で発報、充電で自動解決）
- ✅ 呼出無応答エスカレーション（30秒無応答→全職員へ再通知+アラート）

### 未実装（次のステップ）
- ⬜ ESP32実機ファームウェア（仕様書は `docs/ESP32_FIRMWARE_SPEC.md` に完備）
- ⬜ Asterisk/SIP経由の通話（現在はブラウザ間WebRTC直結）
- ⬜ FCM Push通知の本番設定（コードは実装済み、鍵未設定）
- ⬜ MQTTブローカー統合（ESP32軽量通信用）
- ⬜ 冗長化（主系・待機系、Phase3）

## URLs

- **GitHub**: https://github.com/kkkkk-01/na-suko-ru

## システム構成

```
利用者端末(名札型/Webシミュレーター)
   │ Wi-Fi (呼出 + BLE位置 + バッテリー)
   ▼
サーバー (ノートPC/MiniPC, Docker Compose)
   ├─ Node.js API + Socket.IO (:3001)
   ├─ PostgreSQL 16 (:5432)
   ├─ Asterisk SIP/WebRTC (:5060/:8088)
   └─ Nginx リバースプロキシ (:80)
   │
   ├──▶ 職員端末 /staff/ (:3003)  ← 位置付き着信・応答・通話
   ├──▶ 管理画面 /admin/ (:3000)  ← 所在マップ・アラート・統計
   └──▶ 利用者画面 /user/ (:3002)
```

## データアーキテクチャ

- **ストレージ**: PostgreSQL 16
- **テーブル（8つ）**: users / devices / calls / notifications / call_logs / **beacons** / **location_logs** / **alerts**
- **データフロー**: 端末ハートビート → devices更新+location_logs記録 → 閾値判定でalerts発報 → Socket.IOで各画面へリアルタイム配信

### 主要API（`X-API-Key: nursecall_api_key_dev`）

| メソッド | パス | 説明 |
|---|---|---|
| POST | /api/v1/calls/request | 呼出（`beacon_id`で位置付き） |
| POST | /api/v1/calls/:id/answer | 応答 |
| POST | /api/v1/calls/:id/end | 終了 |
| GET | /api/v1/calls | 履歴（位置情報付き） |
| POST | /api/v1/locations/heartbeat | 端末ハートビート（位置+電池） |
| GET | /api/v1/locations/presence | 全利用者の現在所在 |
| GET | /api/v1/locations/history/:userId | 位置履歴 |
| GET/POST/PUT/DELETE | /api/v1/beacons | ビーコン管理 |
| GET | /api/v1/alerts | アラート一覧 |
| PUT | /api/v1/alerts/:id/resolve | アラート解決 |
| GET | /api/v1/health | ヘルスチェック（認証不要） |

### Socket.IOイベント
- 受信: `join`, `call:request`, `call:answer`, `call:end`, `webrtc:offer/answer/ice`
- 送信: `call:incoming`（位置付き）, `call:answered`, `call:ended`, `call:escalation`, `alert:new`, `alert:resolved`, `location:update`, `notification:new`

## クイックスタート（Windows + Docker Desktop）

```powershell
# 1. ZIPをダウンロード・展開後
cd na-suko-ru-main

# 2. ビルド & 起動（DBは初回起動時にmigrations/が自動実行される）
docker compose build
docker compose up -d

# 3. シードデータ投入
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/seeds/seed.sql
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/seeds/seed_beacons.sql

# 4. アクセス
# 管理画面:   http://localhost:3000
# 利用者画面: http://localhost:3002
# 職員画面:   http://localhost:3003
# API:        http://localhost:3001/api/v1/health
```

> 既にDBボリュームがある場合（アップデート時）は追加マイグレーションを手動適用:
> `docker exec -i nursecall-db psql -U nursecall -d nursecall < server/migrations/002_location_and_alerts.sql`

## プッシュ通知（Firebase / FCM）

職員スマホが**画面ロック中・ポケットの中でも着信**するプッシュ通知に対応。

- 未設定でも全機能正常動作（プッシュだけシミュレーションログ出力）
- 設定手順（無料・約15分）: **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**
- 有効化すると: 呼出→**全職員のスマホに一斉プッシュ** / 30秒無応答エスカレーションも再プッシュ
- 職員は `/staff/` 画面の「プッシュ通知 → 有効化」をタップするだけ（HTTPS環境=トンネルURL経由が必要）

## 外部公開URL（Cloudflare Tunnel）

ルーター設定・ポート開放不要で、施設外（デモ相手・外出中の職員）からアクセスできる公開URLを発行できます。

```powershell
# デモ用（アカウント不要、1分で公開。URLは毎回変わる）
scripts\start-demo-tunnel.bat   # ← ダブルクリックでOK。表示されたURLをデモ相手に送る
scripts\stop-demo-tunnel.bat    # デモ終了後は必ず停止
```

本運用向けの固定URL（独自ドメイン）の手順は **[docs/CLOUDFLARE_TUNNEL_SETUP.md](docs/CLOUDFLARE_TUNNEL_SETUP.md)** を参照。

> ⚠️ ログイン認証は未実装のため、URLを知っている人は誰でもアクセス可能です。
> デモ用途に限定し、外部職員の本運用前には認証実装（ロードマップ①）とTURN導入（同④）が必要です。

## 使い方（デモシナリオ）

1. **3画面を並べて開く**（利用者・職員・管理）
2. 利用者画面で「現在地」を **トイレ** に変更 → 管理画面のマップ上でアイコンが移動
3. **呼出ボタン**を押す → 職員画面に「田中 太郎さん・現在【トイレ】付近から呼出」と着信
4. 職員が**応答** → 双方向通話開始（マイク許可でWebRTC音声）
5. バッテリースライダーを15%にする → 管理・職員画面に**バッテリー低下アラート**
6. 呼出後30秒放置 → **無応答エスカレーション**が全職員に発報

## ノートPC運用時の注意（実証運用）

- 蓋を閉じてもスリープしない設定 + 電源常時接続
- Docker Desktop自動起動 + `restart: unless-stopped`（設定済み）
- Windows Updateの自動再起動を抑止
- 本番（Phase3）はMiniPC 2台冗長化へ移行（ソフトはそのまま載せ替え）

## 耐障害設計（落ちにくさ・落ちたら自動復旧）

| 層 | 仕組み | 復旧時間 |
|---|---|---|
| アプリ内 | 全API/WebSocket/監視ループ try-catch。予期しない例外は即終了→自動再起動（クラッシュオンリー設計） | 約3秒 |
| プロセス | Docker `restart: unless-stopped` / PM2 `autorestart` + メモリ上限300MB | 約3秒 |
| 応答不能 | **autoheal** コンテナがヘルスチェックunhealthyを検知して自動再起動 | 最大30秒 |
| DB | 接続プール自動再接続。DB瞬断でAPIは落ちない | 自動 |
| クライアント | Socket.IO自動再接続 + 再接続時のルーム再参加（実装済み） | 数秒 |
| 検知 | 端末90秒無応答→オフライン警報 / 呼出30秒無応答→全職員エスカレーション | - |

> クラッシュ蘇生テスト済み: プロセスを `kill -9` で強制終了 → 3秒で自動復帰・API正常応答を確認（2026-07-21）

### 連続運用チェックリスト（施設PC）

**初期設定（1回だけ）**
- [ ] 電源プラン「高パフォーマンス」/ スリープ・休止を「なし」
- [ ] 蓋を閉じたときの動作→「何もしない」
- [ ] Docker Desktop 自動起動 ON（Settings → General → Start when you sign in）
- [ ] Windows Update「アクティブ時間」を日中に設定（夜間の勝手な再起動を抑止）
- [ ] ウイルス対策ソフトのフルスキャンを深夜帯以外に

**毎日の確認（1分）**
- [ ] 管理画面 `/admin/` を開き、全端末がオンライン・アラート0件を確認
- [ ] 職員スマホは画面ロックしない設定＋充電スタンド常置（画面ロック中は着信に気づけないため）

**週1の確認**
- [ ] `docker compose ps` で全コンテナ `Up (healthy)` を確認
- [ ] PCの空きディスク容量確認（ログ肥大チェック）

### 耐久テスト

負荷シミュレータで実運用相当の負荷を連続印加できます:

```bash
# 利用者6人分の30秒ハートビート + 5分ごとの呼出→応答→終了サイクルを模擬
node scripts/endurance-test.js            # フォアグラウンド
pm2 start scripts/endurance-test.js --name endurance  # 常駐（推奨）

# 結果確認（毎時サマリをログ出力）
pm2 logs endurance --nostream --lines 20
```

## デプロイ

- **プラットフォーム**: Docker Compose（施設内オンプレ / ノートPC・MiniPC）
- **技術スタック**: Node.js 20 + Express + Socket.IO + PostgreSQL 16 + Asterisk + Nginx + TailwindCSS(CDN) + WebRTC
- **外部公開**: Cloudflare Tunnel（docker-compose.tunnel.yml / scripts/start-demo-tunnel.*）
- **最終更新**: 2026-07-21
