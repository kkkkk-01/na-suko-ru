# Cloudflare Tunnel 公開URL設定ガイド

施設のPCで動いているナースコールシステムを、**ルーター設定・ポート開放なし**でインターネットに公開する手順です。

```
【施設外】デモ相手 / 外出中の職員
    │ https://○○○.trycloudflare.com（または独自ドメイン）
    ▼
Cloudflare のネットワーク
    ▲ 施設PCから「外向き」に接続（内向きの穴あけ不要＝安全）
    │
【施設内】施設PC（Docker一式）─ 施設Wi-Fi ─ 利用者/職員のスマホ
```

2つの方式があります。

| | A. クイックトンネル | B. 恒久トンネル |
|---|---|---|
| 用途 | **デモ・お試し** | **本運用** |
| Cloudflareアカウント | 不要 | 必要（無料） |
| 独自ドメイン | 不要 | 必要（年約1,000円〜） |
| URL | 毎回変わる `xxxx.trycloudflare.com` | 固定 `nursecall.example.com` |
| 準備時間 | 1分 | 30分（初回のみ） |

---

## A. デモ用クイックトンネル（1分で公開）

### 手順

**Windows**: `scripts\start-demo-tunnel.bat` をダブルクリック — 以上です。

画面に表示される `https://xxxx.trycloudflare.com` がデモ相手に送るURLです。

- 利用者画面: `https://xxxx.trycloudflare.com/`
- 職員画面: `https://xxxx.trycloudflare.com/staff/`
- 管理センター: `https://xxxx.trycloudflare.com/admin/`

**macOS/Linux**: `./scripts/start-demo-tunnel.sh`

**手動で行う場合**:
```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile quick up -d
docker logs nursecall-tunnel-quick 2>&1 | grep trycloudflare
```

### 停止

`scripts\stop-demo-tunnel.bat` を実行（システム本体・施設内LAN利用は継続されます）。

### 注意事項

- URLは**起動のたびに変わります**。デモの直前に起動してURLを送ってください
- URLを知っている人は誰でもアクセスできます。**デモが終わったら必ず停止**してください
- クイックトンネルはCloudflareのお試し機能のため、SLA（稼働保証）はありません。本運用にはBを使ってください

---

## B. 恒久トンネル（固定URL・本運用向け）

### 事前に必要なもの

1. **Cloudflareアカウント**（無料）: https://dash.cloudflare.com/sign-up
2. **独自ドメイン**（例: `example.com`）
   - お名前.com / ムームードメイン等で取得（年1,000円前後）
   - または Cloudflare Registrar で直接購入も可能
3. ドメインをCloudflareに登録（Add a Site → ネームサーバーを変更）

### 手順（初回のみ・約30分）

#### 1. トンネルを作成してトークンを取得

1. https://one.dash.cloudflare.com/ を開く
2. 左メニュー **Networks → Tunnels** → **Create a tunnel**
3. **Cloudflared** を選択 → トンネル名: `nursecall`（任意）→ Save
4. 「Install and run a connector」画面で **Docker** タブを選ぶと
   `docker run cloudflare/cloudflared:latest tunnel run --token eyJhI...`
   というコマンドが表示される。この **`eyJhI...` で始まる長い文字列（トークン）** をコピー

#### 2. 公開ホスト名を設定

同じ画面の **Public Hostname** タブ → **Add a public hostname**:

| 項目 | 値 |
|---|---|
| Subdomain | `nursecall`（任意） |
| Domain | あなたのドメイン |
| Service Type | `HTTP` |
| URL | `nginx:80` |

→ 公開URLは `https://nursecall.あなたのドメイン` になります。

#### 3. 施設PCにトークンを設定して起動

プロジェクト直下に `.env` ファイルを作成（既にある場合は追記）:

```
TUNNEL_TOKEN=eyJhI...（コピーしたトークン）
```

起動:

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile named up -d
```

確認:

```bash
docker logs nursecall-tunnel 2>&1 | tail -5
# "Registered tunnel connection" が出ていれば接続成功
```

ブラウザで `https://nursecall.あなたのドメイン/admin/` を開いて管理画面が表示されればOKです。

#### 4. PC再起動後も自動で復帰

`restart: unless-stopped` を設定済みのため、Docker Desktop が自動起動する設定になっていれば、**PC再起動後もトンネルは自動復帰**します。
（Docker Desktop → Settings → General → 「Start Docker Desktop when you sign in」をON）

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| URLにアクセスすると 502 | `docker compose ps` で nginx / api が起動しているか確認。起動直後は30秒ほど待つ |
| `TUNNEL_TOKEN が設定されていません` エラー | `.env` がプロジェクト直下（docker-compose.ymlと同じ場所）にあるか、`TUNNEL_TOKEN=` の行があるか確認 |
| 音声通話が外部とつながらない | 既知の制約です（下記「セキュリティと制約」参照）。TURN サーバー導入で解決予定 |
| クイックトンネルのURLが取得できない | ネットワークがCloudflareへの接続を遮断していないか確認。`docker logs nursecall-tunnel-quick` に ERR が出ていないか見る |
| WebSocket（リアルタイム通知）が動かない | Cloudflare Tunnel はWebSocket対応済み。ブラウザのコンソールで `socket.io` のエラーを確認し、ページを再読み込み |

---

## ⚠️ セキュリティと制約（必読）

公開URLを有効にしている間は、以下を理解した上で運用してください。

1. **ログイン認証は未実装です**
   - URLを知っている人は誰でも全画面にアクセスできます
   - **デモ時は終了後すぐトンネルを停止**してください
   - 本運用（外部職員の常時利用）を始める前に、ログイン認証の実装が必須です

2. **音声通話（WebRTC）は外部との組み合わせで失敗することがあります**
   - 現在はSTUNのみでTURNサーバー未導入のため、「施設内⇔外部」の通話はネットワーク環境によって音声が通りません
   - 呼出通知・位置表示・応答操作は外部からでも問題なく動作します
   - 外部職員との通話を本運用にする際はTURN導入（ロードマップ④）が必要です

3. **クイックトンネルは本運用に使わない**
   - デモ専用。本運用は必ずB（恒久トンネル）+ 認証実装後に

---

## 運用フローまとめ

```
デモのとき:
  start-demo-tunnel.bat → URLをデモ相手に送る → デモ → stop-demo-tunnel.bat

本運用（将来・認証実装後）:
  恒久トンネル常時起動 + ログイン認証 + TURN
  → 外部職員はスマホで https://nursecall.○○○.com/staff/ を開くだけ
```
