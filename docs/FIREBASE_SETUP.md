# Firebase (FCM) プッシュ通知 設定ガイド

職員のスマホが**画面ロック中・ポケットの中でも着信する**ようにするための設定です。
費用は**無料**（FCMは無制限無料、50名施設の通知量では課金要素なし）。

```
呼出発生 → サーバー → FCM(Google) → 職員スマホ（画面ロック中でも通知が鳴る）
                └→ Socket.IO → 画面表示中のブラウザ（従来どおり）
```

**未設定でもシステムは全機能正常動作します**（プッシュ通知だけがログ出力のシミュレーションになる）。

---

## あなたがやること（約15分）

### Step 1. Firebaseプロジェクト作成

1. https://console.firebase.google.com/ にGoogleアカウントでログイン
2. **「プロジェクトを追加」** → 名前: `nursecall`（任意）
3. Googleアナリティクスは **無効でOK** → 作成

### Step 2. Webアプリを登録（Web設定の取得）

1. プロジェクトのトップ画面 → **「</>」(ウェブ) アイコン**をクリック
2. アプリ名: `nursecall-staff`（任意）→ 登録
3. 表示される `firebaseConfig` の値を控える:

```js
const firebaseConfig = {
  apiKey: "AIza....",              // → FIREBASE_WEB_API_KEY
  authDomain: "xxx.firebaseapp.com", // → FIREBASE_WEB_AUTH_DOMAIN
  projectId: "nursecall-xxxx",     // → FCM_PROJECT_ID
  messagingSenderId: "1234567890", // → FIREBASE_WEB_SENDER_ID
  appId: "1:1234:web:abcd..."      // → FIREBASE_WEB_APP_ID
};
```

### Step 3. VAPIDキー（Web Push証明書）の取得

1. ⚙️ **プロジェクトの設定** → **Cloud Messaging** タブ
2. 「ウェブプッシュ証明書」→ **「鍵ペアを生成」**
3. 表示された文字列を控える → `FIREBASE_WEB_VAPID_KEY`

### Step 4. サービスアカウントキー（サーバー用秘密鍵）の取得

1. ⚙️ **プロジェクトの設定** → **サービスアカウント** タブ
2. **「新しい秘密鍵の生成」** → JSONファイルがダウンロードされる
3. JSONの中の3つの値を控える:
   - `project_id` → `FCM_PROJECT_ID`（Step2と同じ値のはず）
   - `client_email` → `FCM_CLIENT_EMAIL`
   - `private_key` → `FCM_PRIVATE_KEY`（`-----BEGIN PRIVATE KEY-----\n...` の長い文字列全体）

> ⚠️ このJSONファイルは**秘密情報**です。誰にも渡さない・Gitにコミットしない。

### Step 5. `.env` に設定（施設PCのプロジェクト直下）

```env
# サーバー側（秘密）
FCM_PROJECT_ID=nursecall-xxxx
FCM_CLIENT_EMAIL=firebase-adminsdk-xxx@nursecall-xxxx.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQI...（改行は \n のまま1行で）...\n-----END PRIVATE KEY-----\n"

# Web側（公開情報）
FIREBASE_WEB_API_KEY=AIza....
FIREBASE_WEB_AUTH_DOMAIN=nursecall-xxxx.firebaseapp.com
FIREBASE_WEB_SENDER_ID=1234567890
FIREBASE_WEB_APP_ID=1:1234:web:abcd...
FIREBASE_WEB_VAPID_KEY=BNxxx....
```

再起動して反映:

```bash
docker compose up -d --force-recreate api
# ログに "Firebase Admin initialized" が出れば成功
docker logs nursecall-api 2>&1 | grep -i firebase
```

---

## 職員スマホ側の操作（各職員1回だけ・1分）

1. スマホのブラウザで職員画面 `/staff/` を開く
2. 「プッシュ通知」セクションの **「有効化」** をタップ → 通知を「許可」
3. 「テスト通知を送る」→ **画面をロックして**通知が来れば成功

> 📱 **iPhoneの場合**: iOS 16.4以降で、先に「ホーム画面に追加」（共有ボタン→ホーム画面に追加）してから、その追加されたアイコンで開いて有効化する必要があります（Safariの仕様）。Androidは通常のChromeでそのまま動きます。

> 🔒 **HTTPSが必要**: プッシュ通知はHTTPS環境でのみ動作します。Cloudflare Tunnel経由（https://〜）なら自動的に満たされます。施設内LAN（http://192.168.x.x）では動かないため、**トンネルのURL経由で使ってください**。

---

## 動作の仕組み（実装済みの内容）

| 状況 | 通知経路 |
|---|---|
| 職員画面を表示中 | Socket.IO（即時・全画面着信UI） |
| 別アプリ使用中/画面ロック中 | **FCMプッシュ**（OSの通知として鳴る・タップで職員画面が開く） |
| 呼出30秒無応答 | エスカレーションが**再度FCMで全職員に**飛ぶ |

- 呼出発生時は**職員全員のスマホ**に一斉送信（担当者だけでなく全員が気づける）
- 通知は**タップするまで消えない**設定（requireInteraction）
- 無効になったトークン（機種変更等）は自動掃除

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 「有効化」ボタンが表示されない | `.env` の5つのWeb設定が揃っているか確認 → `curl -H "X-API-Key: ..." https://URL/api/v1/push/config` で `enabled:true` を確認 |
| iPhoneで通知が来ない | 「ホーム画面に追加」してから開いているか確認（上記参照） |
| テスト通知は来るが呼出が来ない | 職員選択が正しいか確認（トークンは選択中の職員に紐づく） |
| `Firebase initialization failed` ログ | `FCM_PRIVATE_KEY` の改行(`\n`)がそのまま入っているか・全体が`"`で囲まれているか確認 |
