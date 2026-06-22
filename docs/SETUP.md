# 🚀 ナースコールシステム Phase1 — セットアップ & 起動ガイド

このドキュメントでは、ローカルPC上で `docker-compose up -d` を使ってシステム全体を起動する手順を **ゼロから** 説明します。

---

## 📋 目次

1. [前提条件の準備](#1-前提条件の準備)
2. [プロジェクトファイルの配置](#2-プロジェクトファイルの配置)
3. [環境変数の設定](#3-環境変数の設定)
4. [システムの起動](#4-システムの起動)
5. [初期データの投入](#5-初期データの投入)
6. [動作確認](#6-動作確認)
7. [各画面へのアクセス](#7-各画面へのアクセス)
8. [停止・再起動・リセット](#8-停止再起動リセット)
9. [トラブルシューティング](#9-トラブルシューティング)
10. [ポート一覧](#10-ポート一覧)

---

## 1. 前提条件の準備

### 必要なソフトウェア

| ソフトウェア | 推奨バージョン | 用途 |
|---|---|---|
| **Docker Desktop** | 最新版 | コンテナ実行環境 |
| **Git** | 任意 | ソースコード管理（任意） |

### Docker Desktop のインストール

#### Windows の場合
1. https://www.docker.com/products/docker-desktop/ にアクセス
2. **「Download for Windows」** をクリックしてインストーラーをダウンロード
3. インストーラーを実行（デフォルト設定でOK）
4. インストール完了後、PCを**再起動**
5. Docker Desktop を起動して、画面左下に **「Engine running」** と表示されることを確認

> ⚠️ **Windows の場合**: WSL 2 が必要です。インストーラーが自動で案内してくれますが、もしエラーが出た場合は以下を実行してください：
> ```powershell
> wsl --install
> ```
> 実行後、PCを再起動してください。

#### Mac の場合
1. https://www.docker.com/products/docker-desktop/ にアクセス
2. お使いのチップに合わせてダウンロード:
   - **Apple Silicon (M1/M2/M3/M4)** → 「Download for Mac - Apple Silicon」
   - **Intel** → 「Download for Mac - Intel Chip」
3. `.dmg` ファイルを開き、Docker を Applications にドラッグ
4. Docker Desktop を起動して、メニューバーのクジラアイコンが安定するまで待つ

#### Docker が正しくインストールされたか確認
ターミナル（Windows: PowerShell / Mac: Terminal）を開いて以下を実行：

```bash
docker --version
docker compose version
```

以下のように表示されれば OK：
```
Docker version 27.x.x, build xxxxxxx
Docker Compose version v2.x.x
```

---

## 2. プロジェクトファイルの配置

### 方法A: ZIPファイルから展開する場合

1. プロジェクトの ZIP ファイルをダウンロード
2. 任意の場所に展開（例: `C:\Projects\nursecall-system` や `~/Projects/nursecall-system`）

### 方法B: Git でクローンする場合

```bash
git clone <リポジトリURL> nursecall-system
cd nursecall-system
```

### ディレクトリ構造の確認

展開後、以下のような構造になっていることを確認してください：

```
nursecall-system/
├── docker-compose.yml          ← ★ これが存在することを確認
├── .env.example
├── server/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── seeds/
│       └── seed.sql
├── asterisk/
│   ├── Dockerfile
│   └── config/
├── client-user/
│   └── public/
│       └── index.html
├── client-admin/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── docker/
│   └── nginx/
│       └── nginx.conf
├── tests/
└── docs/
```

---

## 3. 環境変数の設定

### 3.1 .env ファイルの作成

プロジェクトのルートディレクトリで以下を実行：

```bash
cp .env.example .env
```

### 3.2 .env の内容確認

**Phase1（技術検証）ではデフォルト値のままで動作します。** 変更は不要です。

```env
# --- API サーバー ---
NODE_ENV=development
PORT=3001
API_KEY=nursecall_api_key_dev
JWT_SECRET=nursecall_jwt_secret_dev_2024

# --- データベース ---
DATABASE_URL=postgresql://nursecall:nursecall_dev_2024@localhost:5432/nursecall

# --- Asterisk ---
ASTERISK_HOST=localhost
ASTERISK_ARI_PORT=8088
ASTERISK_ARI_USER=nursecall
ASTERISK_ARI_PASSWORD=nursecall_ari_2024

# --- Firebase (Phase1では空でOK → シミュレーションモードで動作) ---
FCM_PROJECT_ID=your-project-id
FCM_PRIVATE_KEY=
FCM_CLIENT_EMAIL=

# --- タイムゾーン ---
TZ=Asia/Tokyo
```

> 💡 **ポイント**: Firebase（FCM）の設定が空の場合、Push通知は「シミュレーションモード」で動作します。コンソールにログが出力されるだけで、実際のPush通知は送信されません。Phase1ではこれで問題ありません。

---

## 4. システムの起動

### 4.1 ターミナルを開く

- **Windows**: PowerShell またはコマンドプロンプトを開く
- **Mac**: Terminal.app を開く

### 4.2 プロジェクトディレクトリに移動

```bash
cd nursecall-system
```

> ⚠️ `docker-compose.yml` があるディレクトリで実行してください。確認方法：
> ```bash
> # Windows (PowerShell)
> dir docker-compose.yml
> 
> # Mac / Linux
> ls docker-compose.yml
> ```

### 4.3 Docker イメージのビルド（初回のみ）

初回起動時はDockerイメージをビルドする必要があります：

```bash
docker compose build
```

> ⏱️ **所要時間**: 初回は **5〜15分** かかります（ネットワーク速度によります）。  
> Asterisk、Node.js API、React管理画面の3つのカスタムイメージがビルドされます。

以下のような出力が表示されます：
```
[+] Building 120.5s (25/25) FINISHED
 => [asterisk] ...
 => [api] ...
 => [client-admin] ...
```

### 4.4 コンテナの起動

```bash
docker compose up -d
```

> 💡 **`-d` フラグ** = デタッチモード（バックグラウンド実行）。ターミナルがブロックされません。

成功すると以下のように表示されます：
```
[+] Running 7/7
 ✔ Network nursecall-system_nursecall-net  Created
 ✔ Volume "nursecall-system_postgres_data"  Created
 ✔ Volume "nursecall-system_asterisk_logs"  Created
 ✔ Container nursecall-db                   Started
 ✔ Container nursecall-asterisk             Started
 ✔ Container nursecall-api                  Started
 ✔ Container nursecall-client-user          Started
 ✔ Container nursecall-admin                Started
 ✔ Container nursecall-nginx                Started
```

### 4.5 起動状態の確認

```bash
docker compose ps
```

**全てのコンテナが `Up` または `Up (healthy)` と表示されればOK**：

```
NAME                    STATUS                   PORTS
nursecall-db            Up (healthy)             0.0.0.0:5432->5432/tcp
nursecall-asterisk      Up                       0.0.0.0:5060->5060/tcp, ...
nursecall-api           Up (healthy)             0.0.0.0:3001->3001/tcp
nursecall-client-user   Up                       0.0.0.0:3002->80/tcp
nursecall-admin         Up                       0.0.0.0:3000->3000/tcp
nursecall-nginx         Up                       0.0.0.0:80->80/tcp
```

> ⚠️ **STATUS が `Restarting` の場合**: ログを確認してください（[トラブルシューティング](#9-トラブルシューティング)参照）

### 4.6 APIヘルスチェック

```bash
curl http://localhost:3001/api/v1/health
```

正常応答：
```json
{
  "status": "ok",
  "timestamp": "2026-06-22T...",
  "uptime": 30.5,
  "database": "connected"
}
```

> Windows でcurlがない場合は、ブラウザで http://localhost:3001/api/v1/health を開いてください。

---

## 5. 初期データの投入

データベーススキーマは Docker 起動時に自動で作成されますが、テスト用データ（利用者・職員アカウント）は手動で投入します。

### 5.1 シードデータの実行

```bash
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/seeds/seed.sql
```

成功すると以下が表示されます：
```
INSERT 0 3
INSERT 0 3
INSERT 0 1
INSERT 0 3
INSERT 0 3
```

### 5.2 データ投入の確認

```bash
docker exec nursecall-db psql -U nursecall -d nursecall -c "SELECT id, name, role, extension FROM users ORDER BY id;"
```

以下のように表示されます：
```
 id |     name     |   role   | extension
----+--------------+----------+-----------
  1 | 田中 太郎    | resident | 1001
  2 | 佐藤 花子    | resident | 1002
  3 | 鈴木 一郎    | resident | 1003
  4 | 山田 看護師  | staff    | 2001
  5 | 高橋 介護士  | staff    | 2002
  6 | 伊藤 介護士  | staff    | 2003
  7 | 管理者       | admin    | 9001
 (7 rows)
```

---

## 6. 動作確認

### 6.1 各サービスの確認コマンド

```bash
# 1. API サーバー
curl http://localhost:3001/api/v1/health

# 2. 利用者一覧を取得
curl -H "X-API-Key: nursecall_api_key_dev" http://localhost:3001/api/v1/users

# 3. 呼出テスト（田中太郎が呼出ボタンを押す）
curl -X POST http://localhost:3001/api/v1/calls/request \
  -H "Content-Type: application/json" \
  -H "X-API-Key: nursecall_api_key_dev" \
  -d '{"caller_id": 1}'

# 4. 通話履歴の確認
curl -H "X-API-Key: nursecall_api_key_dev" http://localhost:3001/api/v1/calls
```

### 6.2 ブラウザでの確認

各画面をブラウザで開いて確認してください（次のセクションで詳細説明）。

---

## 7. 各画面へのアクセス

### 🖥️ 画面一覧

| 画面 | URL | 説明 |
|---|---|---|
| **利用者画面（呼出ボタン）** | http://localhost:3002 | 入居者用の大きな呼出ボタン |
| **管理者画面（React）** | http://localhost:3000 | 通話履歴・通知履歴・システムステータス |
| **API サーバー** | http://localhost:3001/api/v1/health | REST APIヘルスチェック |
| **Nginx統合** | http://localhost | 全サービスを80番ポートで統合 |

### 📱 Nginx経由でアクセスする場合（ポート80）

Nginx リバースプロキシ経由では以下のURLでアクセスできます：

| パス | 転送先 |
|---|---|
| `http://localhost/` | 利用者画面 |
| `http://localhost/admin/` | 管理者画面 |
| `http://localhost/api/` | APIサーバー |
| `http://localhost/socket.io/` | WebSocket |

### 📱 スマートフォンからアクセスする場合

同じWi-Fiネットワーク内であれば、PCのIPアドレスを使ってスマートフォンからもアクセスできます。

#### PCのIPアドレスを調べる

```bash
# Windows (PowerShell)
ipconfig | findstr /i "IPv4"

# Mac / Linux
ifconfig | grep "inet " | grep -v 127.0.0.1
```

例: IPアドレスが `192.168.1.100` の場合：

| 画面 | スマートフォンからのURL |
|---|---|
| 利用者画面 | `http://192.168.1.100:3002` |
| 管理者画面 | `http://192.168.1.100:3000` |
| 統合URL | `http://192.168.1.100` |

> ⚠️ **Windows ファイアウォール**: 初回アクセス時に「ネットワークアクセスを許可しますか？」のダイアログが出た場合は **「許可」** を選んでください。

---

## 8. 停止・再起動・リセット

### コンテナの停止

```bash
docker compose down
```

> データベースのデータは **保持されます**（Docker Volume に保存されているため）。

### コンテナの再起動

```bash
docker compose restart
```

### 特定のコンテナだけ再起動

```bash
docker compose restart api          # APIサーバーだけ再起動
docker compose restart client-admin # 管理画面だけ再起動
```

### 完全リセット（データも全て削除）

```bash
docker compose down -v
```

> ⚠️ **`-v` フラグ** をつけると、データベースのデータも含めて全て削除されます。再起動後にシードデータの再投入が必要です。

### イメージの再ビルド（コード変更後）

```bash
docker compose build --no-cache
docker compose up -d
```

### ログの確認

```bash
# 全コンテナのログ（リアルタイム）
docker compose logs -f

# 特定のコンテナのログ
docker compose logs -f api           # APIサーバーのログ
docker compose logs -f asterisk      # Asteriskのログ
docker compose logs -f postgres      # データベースのログ

# 最新50行だけ表示
docker compose logs --tail 50 api
```

---

## 9. トラブルシューティング

### ❌ `docker compose up -d` でエラーが出る

#### エラー: `port is already allocated`
他のアプリケーションがポートを使用しています。

```bash
# どのプロセスがポートを使っているか確認
# Windows
netstat -ano | findstr :3000

# Mac / Linux
lsof -i :3000
```

**解決方法**: 競合するアプリケーションを停止するか、`docker-compose.yml` のポート番号を変更：
```yaml
ports:
  - "3100:3000"   # ← ホスト側のポートを変更（左側の数字）
```

#### エラー: `Cannot connect to the Docker daemon`
Docker Desktop が起動していません。

**解決方法**: Docker Desktop を起動して、「Engine running」が表示されるまで待ってください。

#### エラー: `no matching manifest for linux/arm64`（M1/M2 Mac）
一部のイメージがARMに対応していない場合。

**解決方法**: `docker-compose.yml` に `platform` を追加：
```yaml
services:
  postgres:
    image: postgres:16-alpine
    platform: linux/amd64    # ← この行を追加
```

---

### ❌ API サーバーが `Restarting` を繰り返す

PostgreSQL がまだ起動完了していない可能性があります。

```bash
# PostgreSQLの状態確認
docker compose logs postgres

# APIサーバーのログ確認
docker compose logs api
```

**解決方法**: 数秒〜数十秒待ってから再確認してください。PostgreSQL のヘルスチェックが通ると API が自動的に起動します。

---

### ❌ `curl: command not found`（Windows）

**解決方法**: PowerShell では `curl` は `Invoke-WebRequest` のエイリアスです。以下のどちらかで対応：

```powershell
# 方法1: curl.exe を直接指定
curl.exe http://localhost:3001/api/v1/health

# 方法2: Invoke-WebRequest を使用
(Invoke-WebRequest -Uri http://localhost:3001/api/v1/health).Content
```

または、ブラウザで直接 URL を開いてください。

---

### ❌ シードデータ投入時にエラー

#### `relation "users" does not exist`
マイグレーションがまだ実行されていません。

```bash
# マイグレーションを手動実行
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/migrations/001_initial_schema.sql

# その後シードデータを再投入
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/seeds/seed.sql
```

#### `duplicate key value violates unique constraint`
データが既に存在しています。seed.sql は `ON CONFLICT DO NOTHING` を使用しているため、通常は安全ですが、完全にやり直したい場合：

```bash
# データベース完全リセット
docker compose down -v
docker compose up -d
# PostgreSQLが起動完了するまで20秒ほど待つ
sleep 20
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/seeds/seed.sql
```

---

### ❌ Asterisk が起動しない

```bash
docker compose logs asterisk
```

よくある原因：
- 設定ファイルの構文エラー → `asterisk/config/` のファイルを確認
- ポート5060が既に使用されている → 他のSIPソフトを停止

---

### ❌ 管理画面が表示されない（3000番ポート）

```bash
docker compose logs client-admin
```

npm install が完了していない場合があります。初回起動時は1〜2分かかることがあります。

---

## 10. ポート一覧

| ポート | サービス | プロトコル | 用途 |
|---|---|---|---|
| **80** | Nginx | HTTP | リバースプロキシ（全サービス統合） |
| **3000** | React管理画面 | HTTP | 管理者ダッシュボード |
| **3001** | Node.js API | HTTP | REST API + WebSocket (Socket.IO) |
| **3002** | 利用者Web画面 | HTTP | 呼出ボタンページ |
| **5060** | Asterisk | SIP (UDP/TCP) | SIP通話 |
| **5061** | Asterisk | SIP TLS | 暗号化SIP通話 |
| **8088** | Asterisk | WebSocket | WebRTC用WebSocket |
| **8089** | Asterisk | WSS | 暗号化WebSocket |
| **5432** | PostgreSQL | TCP | データベース接続 |
| **10000-10100** | Asterisk | RTP (UDP) | 音声データ（メディア） |

---

## 🎯 クイックスタートまとめ（最短手順）

すべてを最短で起動するには、以下のコマンドを順番に実行してください：

```bash
# 1. プロジェクトディレクトリに移動
cd nursecall-system

# 2. 環境変数ファイルを作成（初回のみ）
cp .env.example .env

# 3. ビルド＆起動（初回は5〜15分）
docker compose build
docker compose up -d

# 4. 全コンテナ起動を確認（全てUpになるまで20〜30秒待つ）
docker compose ps

# 5. APIヘルスチェック
curl http://localhost:3001/api/v1/health

# 6. テストデータ投入
docker exec -i nursecall-db psql -U nursecall -d nursecall < server/seeds/seed.sql

# 7. ブラウザで確認 🎉
# 利用者画面: http://localhost:3002
# 管理者画面: http://localhost:3000
# 統合URL:   http://localhost
```

**以上で起動完了です！** 🎉
