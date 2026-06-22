# ウェアラブルナースコールシステム Phase1 - 技術検証版 設計書

## 1. システム構成図

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose 環境                          │
│                                                                     │
│  ┌──────────┐   ┌──────────────┐   ┌───────────┐   ┌───────────┐  │
│  │PostgreSQL│   │  Node.js API │   │  Asterisk  │   │  Nginx    │  │
│  │  :5432   │◄──│  :3001       │──►│  :5060 SIP │   │  :80/:443 │  │
│  │          │   │  Express     │   │  :8088 WS  │   │  Reverse  │  │
│  │ DB永続化 │   │  Socket.IO   │   │  :8089 WSS │   │  Proxy    │  │
│  └──────────┘   │  FCM Push    │   │  :10000-   │   └─────┬─────┘  │
│                 └──────┬───────┘   │  20000 RTP │         │        │
│                        │           └───────────┘         │        │
│                        │  WebSocket                      │        │
└────────────────────────┼─────────────────────────────────┼────────┘
                         │                                 │
            ┌────────────┼─────────────────────────────────┼───┐
            │            ▼                                 ▼   │
            │  ┌─────────────────┐  ┌──────────────────────┐   │
            │  │ 利用者Web画面   │  │ React管理画面        │   │
            │  │ (呼出ボタン)    │  │ (履歴・監視)         │   │
            │  │ WebRTC対応      │  │ :3000                │   │
            │  └─────────────────┘  └──────────────────────┘   │
            │                                                   │
            │  ┌─────────────────────────────────────────────┐  │
            │  │ Flutter 職員アプリ (Android)                 │  │
            │  │ - FCM Push通知受信                           │  │
            │  │ - SIP通話 (flutter_osp)                     │  │
            │  │ - 呼出履歴表示                               │  │
            │  └─────────────────────────────────────────────┘  │
            └───────────────────────────────────────────────────┘
```

## 2. 通信フロー

### 呼出フロー
```
利用者端末 ──HTTP POST──► Node.js API ──INSERT──► PostgreSQL
                              │
                              ├──FCM Push──► 職員スマホ（Flutter）
                              │
                              └──WebSocket──► React管理画面
```

### 通話フロー
```
利用者端末 ──WebRTC/SIP──► Asterisk ◄──SIP──► 職員スマホ（Flutter）
                              │
                    Node.js API（通話ログ記録）
                              │
                          PostgreSQL
```

### 通話確立シーケンス
```
利用者        Node.js API      Asterisk       職員アプリ
  │               │               │               │
  │──呼出要求────►│               │               │
  │               │──DB記録──────►│               │
  │               │──FCM Push────────────────────►│
  │               │──WebSocket──►│               │
  │               │               │               │
  │               │               │◄──SIP REGISTER│
  │               │               │               │
  │──WebRTC Offer────────────────►│               │
  │               │               │──SIP INVITE──►│
  │               │               │◄──SIP 200 OK──│
  │◄─WebRTC Answer────────────────│               │
  │               │               │               │
  │◄═══════════ RTP 双方向音声通話 ═══════════════►│
  │               │               │               │
  │──通話終了────►│               │               │
  │               │──DB更新──────►│               │
  │               │               │──SIP BYE─────►│
```

## 3. 技術スタック

| 層 | 技術 | 用途 |
|---|---|---|
| DB | PostgreSQL 16 | データ永続化 |
| API | Node.js 20 + Express | REST API + WebSocket |
| 通話 | Asterisk 20 | SIP/WebRTC メディアサーバー |
| Push通知 | FCM (Firebase) | Android Push通知 |
| リアルタイム | Socket.IO | WebSocket通信 |
| 利用者UI | HTML + JS (WebRTC) | 呼出ボタン + 音声通話 |
| 管理画面 | React 18 + Vite | 管理・監視ダッシュボード |
| 職員アプリ | Flutter 3 (Android) | 通知受信・SIP通話 |
| インフラ | Docker Compose | ローカル開発環境 |
| プロキシ | Nginx | リバースプロキシ・SSL終端 |

## 4. ポート一覧

| サービス | ポート | プロトコル | 用途 |
|---|---|---|---|
| Nginx | 80 | HTTP | リバースプロキシ |
| Nginx | 443 | HTTPS | SSL終端 |
| Node.js API | 3001 | HTTP/WS | REST API + Socket.IO |
| React管理画面 | 3000 | HTTP | 開発サーバー |
| PostgreSQL | 5432 | TCP | データベース |
| Asterisk | 5060 | UDP/TCP | SIP |
| Asterisk | 5061 | TCP | SIP TLS |
| Asterisk | 8088 | TCP | WebSocket (HTTP) |
| Asterisk | 8089 | TCP | WebSocket (HTTPS) |
| Asterisk | 10000-20000 | UDP | RTP (音声メディア) |
