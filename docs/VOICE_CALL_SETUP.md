# 実機通話（M5StickS3 ⇔ 職員スマホ）セットアップガイド

施設運用に一番近い構成 = **施設PC 1台に docker compose で全サービスを立てる**。
Asterisk（SIP交換機）が音声を中継し、実機と職員ブラウザが通話する。

## 全体像

```
M5StickS3（内線1001）          職員スマホ（ブラウザ）
  │ ①ボタン → REST呼出           │ ③応答ボタン
  │ ②SIP登録(UDP/5060)           │ ④JsSIPがwss(/sip-ws)でSIP発信
  ▼                              ▼
┌─────────── 施設PC（docker compose）───────────┐
│ nginx :80 ──┬─ /staff/ /user/ /admin/（画面）    │
│             ├─ /api/ /socket.io/（API・着信通知）│
│             └─ /sip-ws（SIP over WS → Asterisk） │
│ api(Node)   … 呼出/位置/FCM/SIP-WSプロキシ       │
│ asterisk    … SIP交換機 :5060/udp, RTP :10000-10100│
│ postgres    … DB                                  │
└───────────────────────────────────────────────┘
```

- **音声呼は常に「職員→実機」方向**（実機は自動応答）
- コーデックは G.711 ulaw に統一（トランスコード無し・低CPU）
- 職員ブラウザのマイクは HTTPS 必須 → 外部からは Cloudflare Tunnel 経由でOK
  （/sip-ws も同一トンネルを通る。localhost テストなら HTTP でも可）

## 1. 施設PCでの起動

```bash
git clone https://github.com/kkkkk-01/na-suko-ru.git && cd na-suko-ru
cp server/.env.example server/.env   # Firebase設定等を記入（無くても通話は動く）
docker compose up -d --build         # 初回はAsteriskビルドで10-15分
docker compose ps                    # 全サービス healthy を確認
```

確認:
```bash
# Asterisk 内線一覧（1001=実機, 2001-2005=職員）
docker exec nursecall-asterisk asterisk -rx "pjsip show endpoints" | head -30
# API
curl -s http://localhost/api/v1/voice/status -H "X-API-Key: nursecall_api_key_dev"
```

## 2. M5StickS3 の設定（プロビジョニング）

ファームウェア書込後、初回起動でSoftAPモード（`NURSECALL-SETUP-xxxx`）に入る。
スマホで接続して設定ページに入力:

| 項目 | 値 |
|---|---|
| Wi-Fi SSID/パスワード | 施設Wi-Fi |
| サーバーURL | `http://<施設PCのIP>`（例: http://192.168.1.50） |
| APIキー | `nursecall_api_key_dev`（運用前に変更） |
| user_id | 利用者ID（例: 1 = 田中太郎さん） |
| SIP内線/パスワード | `1001` / `res1001_dev`（devicesテーブルと一致） |

## 3. 職員スマホ側

1. `https://<トンネルURL>/staff/`（または施設LAN内なら `http://<施設PCのIP>/staff/`）を開く
2. 画面を開くと自動で SIP 内線（2001等）に登録される（`/api/v1/voice/config` から取得）
3. 着信 → 「応答」を押すと:
   - 実機発の呼出 → **SIP発信で実機と通話**（画面に「実機通話 (SIP内線 1001)」表示）
   - Webシミュレータ発 → 従来のブラウザ間P2P通話
4. 「通話を終了」で切断

## 4. 通話テスト用の内線

| 内線 | 動作 |
|---|---|
| 9999 | エコーテスト（自分の声が返る）— 実機/ブラウザの音声疎通確認 |
| 8888 | トーン再生 — スピーカー出力のみ確認 |

実機からの確認例: SIP登録後 9999 にダイヤル → 自分の声が返れば マイク/スピーカー/RTP 全部OK。

## 5. 内線・アカウントの追加

1. `asterisk/config/pjsip.conf` に endpoint 追加（1004… / 2006…）
2. DB: `devices` テーブルに `sip_username` / `sip_password` を登録
   ```sql
   INSERT INTO devices (user_id, device_type, platform, sip_username, sip_password)
   VALUES (2, 'esp32', 'm5sticks3', '1002', 'res1002_dev');
   ```
3. `docker compose restart asterisk`

## 6. 運用前に必ず変更するもの

- [ ] pjsip.conf の全SIPパスワード（`*_dev` を強いものに）+ devicesテーブルも同じ値に更新
- [ ] APIキー `nursecall_api_key_dev`
- [ ] 外部公開時は認証実装（ログイン）後に行う

## 7. トラブルシューティング

| 症状 | 確認 |
|---|---|
| 実機がSIP登録できない | `docker exec nursecall-asterisk asterisk -rx "pjsip show contacts"` に1001が出るか。UDP/5060がFW未許可でないか |
| 職員画面で「SIP未接続のためP2P」 | ブラウザConsoleで registrationFailed を確認。/sip-ws がnginxでプロキシされているか |
| 呼出は来るが音が出ない | RTPポート(UDP 10000-10100)がFWで塞がれていないか。エコーテスト9999で切り分け |
| 片方向しか聞こえない | 実機側マイク/スピーカー初期化（ES8311）を確認。8888でスピーカーのみ先に確認 |
| 外部(4G/5G)の職員スマホで通話できない | Phase3ではTURN未導入のため音声は施設LAN内が前提。外部通話はTURNサーバー導入後 |

## 8. サンドボックスでの検証結果（2026-08-24）

- Asterisk 20.20.1 をソースビルドし起動 ✅
- 内線1001（実機役: baresip自動応答）・2001（職員役: JsSIP実ライブラリ）が登録 ✅
- `/sip-ws` プロキシ経由の SIP REGISTER（Digest認証）成功 ✅
- 通話成立: PJSIP/1001 ⇔ エコーテスト、チャネル "Up" を確認 ✅
- E2E: REST呼出 → `call:incoming` payload に `sip_extension: "1001"` を確認 ✅
