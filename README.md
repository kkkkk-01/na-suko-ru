# 🏥 ウェアラブルナースコールシステム - Phase1 技術検証版

## 概要

介護施設向け音声コミュニケーションシステムのPoC（技術検証版）です。

### Phase1のゴール

- ✅ ボタンを押すとスマホに通知が届く
- ✅ スマホから通話できる
- ✅ 音声の双方向通話ができる

## システム構成

```
利用者端末(Web) → Wi-Fi → Asterisk(SIP/WebRTC) → 職員スマホ(Flutter)
                           ↓
                    Node.js API + PostgreSQL
                           ↓
                    React管理画面
```

## 技術スタック

| 層 | 技術 |
|---|---|
| DB | PostgreSQL 16 |
| API | Node.js 20 + Express + Socket.IO |
| 通話 | Asterisk 20 (SIP/WebRTC) |
| Push通知 | Firebase Cloud Messaging |
| 利用者UI | HTML + JS + WebRTC |
| 管理画面 | React 18 + Vite + TailwindCSS |
| 職員アプリ | Flutter 3 (Android) |
| インフラ | Docker Compose |

## クイックスタート

### 前提条件

- Docker & Docker Compose
- Node.js 20+ (ローカル開発時)
- Flutter 3.x (職員アプリ開発時)

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd webapp
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .env ファイルを編集（FCM設定など）
```

### 3. Docker Compose で起動

```bash
docker-compose up -d
```

### 4. データベースの初期化（自動実行されない場合）

```bash
# マイグレーション
docker exec -it nursecall-db psql -U nursecall -d nursecall -f /docker-entrypoint-initdb.d/001_initial_schema.sql

# シードデータ
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/seeds/seed.sql
```

### 5. アクセス

| サービス | URL |
|---|---|
| 利用者画面（呼出ボタン） | http://localhost:3002 |
| 管理画面（React） | http://localhost:3000 |
| API サーバー | http://localhost:3001/api/v1 |
| API ヘルスチェック | http://localhost:3001/api/v1/health |
| Nginx プロキシ | http://localhost |

## ディレクトリ構成

```
webapp/
├── docker-compose.yml          # Docker Compose 構成
├── .env.example                # 環境変数テンプレート
│
├── server/                     # Node.js API サーバー
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # エントリーポイント
│   │   ├── config/
│   │   │   └── database.js     # PostgreSQL接続
│   │   ├── routes/
│   │   │   ├── users.js        # ユーザーAPI
│   │   │   ├── devices.js      # デバイスAPI
│   │   │   ├── calls.js        # 通話API（呼出・応答・終了）
│   │   │   ├── notifications.js # 通知API
│   │   │   └── dashboard.js    # ダッシュボードAPI
│   │   ├── services/
│   │   │   └── notificationService.js  # FCM + WebSocket通知
│   │   ├── middleware/
│   │   │   ├── auth.js         # APIキー認証
│   │   │   └── errorHandler.js # エラーハンドリング
│   │   └── utils/
│   │       └── logger.js       # Winston ロガー
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # DBスキーマ
│   └── seeds/
│       └── seed.sql            # テストデータ
│
├── asterisk/                   # Asterisk SIPサーバー
│   ├── Dockerfile
│   └── config/
│       ├── pjsip.conf          # SIP/WebRTC エンドポイント設定
│       ├── extensions.conf     # ダイヤルプラン
│       ├── http.conf           # WebSocket設定
│       ├── rtp.conf            # RTP設定
│       ├── modules.conf        # モジュール設定
│       └── logger.conf         # ログ設定
│
├── client-user/                # 利用者Web画面
│   └── public/
│       └── index.html          # 呼出ボタン + WebRTC
│
├── client-admin/               # React 管理画面
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx             # メインアプリ
│       ├── pages/
│       │   ├── Dashboard.jsx       # ダッシュボード
│       │   ├── CallHistory.jsx     # 通話履歴
│       │   ├── NotificationHistory.jsx  # 通知履歴
│       │   └── SystemStatus.jsx    # システム状態
│       ├── hooks/
│       │   └── useSocket.js    # WebSocketフック
│       └── services/
│           └── api.js          # API クライアント
│
├── flutter-staff/              # Flutter 職員アプリ
│   ├── pubspec.yaml
│   └── lib/
│       ├── main.dart           # エントリーポイント
│       ├── screens/
│       │   ├── home_screen.dart         # 待機画面
│       │   ├── incoming_call_screen.dart # 着信画面
│       │   ├── active_call_screen.dart   # 通話中画面
│       │   └── call_history_screen.dart  # 履歴画面
│       └── services/
│           ├── api_service.dart          # APIクライアント
│           ├── call_service.dart         # 通話管理
│           └── notification_service.dart # 通知管理
│
├── docker/                     # Docker関連設定
│   └── nginx/
│       └── nginx.conf          # Nginxリバースプロキシ
│
├── tests/                      # テストスクリプト
│   ├── test_notifications.sh   # 通知100回テスト
│   ├── test_call_duration.sh   # 30分通話テスト
│   └── test_stability.sh       # 24時間安定性テスト
│
└── docs/                       # 設計ドキュメント
    ├── ARCHITECTURE.md         # システム構成図
    ├── DATABASE.md             # DB設計書
    └── API.md                  # API設計書
```

## API仕様

### 主要エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | /api/v1/health | ヘルスチェック |
| POST | /api/v1/calls/request | 呼出要求 |
| POST | /api/v1/calls/:id/answer | 通話応答 |
| POST | /api/v1/calls/:id/end | 通話終了 |
| GET | /api/v1/calls | 通話履歴 |
| GET | /api/v1/notifications | 通知履歴 |
| GET | /api/v1/dashboard/stats | 統計情報 |
| GET | /api/v1/dashboard/status | システムステータス |
| GET | /api/v1/users | ユーザー一覧 |
| POST | /api/v1/users | ユーザー登録 |
| GET | /api/v1/devices | デバイス一覧 |
| POST | /api/v1/devices | デバイス登録 |

認証: `X-API-Key: nursecall_api_key_dev` ヘッダー

詳細は [docs/API.md](docs/API.md) を参照。

## データベース

### テーブル一覧

| テーブル | 説明 |
|---|---|
| users | ユーザー（利用者・職員・管理者） |
| devices | デバイス（端末情報・SIP設定） |
| calls | 通話記録 |
| notifications | 通知記録 |
| call_logs | 通話イベントログ |

詳細は [docs/DATABASE.md](docs/DATABASE.md) を参照。

## テスト実行

```bash
# テスト1: 通知100回テスト
./tests/test_notifications.sh

# テスト2: 30分通話テスト
DURATION_MINUTES=30 ./tests/test_call_duration.sh

# テスト3: 24時間安定性テスト
DURATION_HOURS=24 ./tests/test_stability.sh

# 短時間テスト（1時間）
DURATION_HOURS=1 INTERVAL_SECONDS=30 ./tests/test_stability.sh
```

## 検証項目

| # | テスト | 基準 | 方法 |
|---|---|---|---|
| 1 | 通知到達性 | 成功率 95% 以上 | 100回連続通知 |
| 2 | 通話持続性 | 30分間正常動作 | API + Asterisk |
| 3 | 安定性 | 24時間メモリリークなし | ヘルスチェック監視 |

## Firebase (FCM) 設定手順

Push通知を有効化する場合:

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト作成
2. Cloud Messaging を有効化
3. サービスアカウントキーをダウンロード
4. `.env` に以下を設定:
   ```
   FCM_PROJECT_ID=your-project-id
   FCM_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
   FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
5. Flutter アプリに `google-services.json` を配置

※ FCM未設定の場合、Push通知はシミュレーション（ログ出力のみ）で動作します。

## 次のステップ (Phase2)

- [ ] ESP32-S3 実機端末の開発
- [ ] 名札型端末のハード設計
- [ ] 音声品質の最適化（ノイズ対策・音量調整）
- [ ] バッテリー駆動の実装
- [ ] Wi-Fiエリアカバレッジの検証
- [ ] 端末状態監視（バッテリー・オンライン状態）
- [ ] 管理画面の機能拡充
- [ ] UI/UX 評価

## ライセンス

Private - All rights reserved
