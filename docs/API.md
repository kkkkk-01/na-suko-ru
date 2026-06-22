# API設計書

## Base URL
```
http://localhost:3001/api/v1
```

## 認証
Phase1ではシンプルなAPIキー認証を使用。
```
Header: X-API-Key: <api_key>
```

---

## エンドポイント一覧

### 1. ユーザー管理

#### GET /users
ユーザー一覧取得
```json
// Response 200
{
  "users": [
    {
      "id": 1,
      "name": "田中太郎",
      "role": "resident",
      "extension": "1001",
      "room_number": "101",
      "is_active": true
    }
  ],
  "total": 10,
  "page": 1,
  "per_page": 20
}
```

#### POST /users
ユーザー登録
```json
// Request
{
  "name": "田中太郎",
  "role": "resident",
  "extension": "1001",
  "email": "tanaka@example.com",
  "room_number": "101"
}
// Response 201
{
  "id": 1,
  "name": "田中太郎",
  "role": "resident",
  "extension": "1001",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### GET /users/:id
ユーザー詳細取得

#### PUT /users/:id
ユーザー更新

#### DELETE /users/:id
ユーザー削除（論理削除）

---

### 2. デバイス管理

#### GET /devices
デバイス一覧取得

#### POST /devices
デバイス登録
```json
// Request
{
  "user_id": 1,
  "device_type": "android",
  "device_token": "fcm_token_here",
  "platform": "android",
  "sip_username": "staff_1001",
  "sip_password": "secure_password"
}
// Response 201
{
  "id": 1,
  "user_id": 1,
  "device_type": "android",
  "sip_username": "staff_1001",
  "is_online": false
}
```

#### PUT /devices/:id/status
デバイスステータス更新
```json
// Request
{ "is_online": true }
```

#### PUT /devices/:id/token
FCMトークン更新
```json
// Request
{ "device_token": "new_fcm_token" }
```

---

### 3. 呼出・通知

#### POST /calls/request
呼出要求（利用者→職員）
```json
// Request
{
  "caller_id": 1,
  "message": "呼出"
}
// Response 201
{
  "call_id": 1,
  "notification_id": 1,
  "status": "ringing",
  "callee": {
    "id": 2,
    "name": "佐藤花子",
    "extension": "2001"
  },
  "message": "通知を送信しました"
}
```

#### GET /notifications
通知一覧取得
```json
// Query: ?user_id=2&status=pending&page=1&per_page=20
// Response 200
{
  "notifications": [
    {
      "id": 1,
      "caller": { "id": 1, "name": "田中太郎", "room_number": "101" },
      "type": "call_request",
      "status": "sent",
      "message": "利用者から呼出があります",
      "sent_at": "2024-01-01T10:00:00Z"
    }
  ],
  "total": 5
}
```

#### PUT /notifications/:id/read
通知既読
```json
// Response 200
{ "id": 1, "status": "read", "read_at": "2024-01-01T10:00:05Z" }
```

---

### 4. 通話管理

#### POST /calls/:id/answer
通話応答
```json
// Response 200
{
  "call_id": 1,
  "status": "answered",
  "answered_at": "2024-01-01T10:00:10Z",
  "sip_info": {
    "server": "asterisk.local",
    "caller_extension": "1001",
    "callee_extension": "2001"
  }
}
```

#### POST /calls/:id/end
通話終了
```json
// Request
{ "end_reason": "normal" }
// Response 200
{
  "call_id": 1,
  "status": "ended",
  "duration": 120,
  "ended_at": "2024-01-01T10:02:10Z"
}
```

#### GET /calls
通話履歴取得
```json
// Query: ?page=1&per_page=20&status=ended&from=2024-01-01&to=2024-01-31
// Response 200
{
  "calls": [
    {
      "id": 1,
      "caller": { "id": 1, "name": "田中太郎", "room_number": "101" },
      "callee": { "id": 2, "name": "佐藤花子" },
      "status": "ended",
      "started_at": "2024-01-01T10:00:00Z",
      "answered_at": "2024-01-01T10:00:10Z",
      "ended_at": "2024-01-01T10:02:10Z",
      "duration": 120
    }
  ],
  "total": 50,
  "page": 1
}
```

#### GET /calls/:id
通話詳細取得

#### GET /calls/:id/logs
通話ログ取得

---

### 5. ダッシュボード・統計

#### GET /dashboard/stats
ダッシュボード統計
```json
// Response 200
{
  "today": {
    "total_calls": 15,
    "answered_calls": 12,
    "missed_calls": 3,
    "avg_response_time": 8.5,
    "avg_duration": 95.2
  },
  "active_devices": {
    "online": 5,
    "offline": 3,
    "total": 8
  },
  "recent_calls": [ /* 直近5件 */ ]
}
```

#### GET /dashboard/status
システムステータス
```json
// Response 200
{
  "api_server": "healthy",
  "database": "healthy",
  "asterisk": "healthy",
  "uptime_seconds": 86400,
  "memory_usage_mb": 128,
  "active_sip_peers": 5
}
```

---

### 6. ヘルスチェック

#### GET /health
```json
// Response 200
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "connected",
    "asterisk": "connected"
  }
}
```

---

## WebSocket イベント

### Socket.IO 名前空間: /

#### クライアント → サーバー
| イベント | ペイロード | 説明 |
|---|---|---|
| `join` | `{ user_id, role }` | ルーム参加 |
| `call:request` | `{ caller_id }` | 呼出要求 |
| `call:answer` | `{ call_id }` | 通話応答 |
| `call:end` | `{ call_id, reason }` | 通話終了 |

#### サーバー → クライアント
| イベント | ペイロード | 説明 |
|---|---|---|
| `notification:new` | `{ notification }` | 新規通知 |
| `call:incoming` | `{ call, caller }` | 着信通知 |
| `call:answered` | `{ call_id }` | 通話開始 |
| `call:ended` | `{ call_id, duration }` | 通話終了 |
| `device:status` | `{ device_id, is_online }` | デバイスステータス変更 |
| `system:status` | `{ status }` | システムステータス更新 |

---

## エラーレスポンス形式
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が不正です",
    "details": [
      { "field": "name", "message": "名前は必須です" }
    ]
  }
}
```

## HTTPステータスコード
| コード | 説明 |
|---|---|
| 200 | 成功 |
| 201 | 作成成功 |
| 400 | リクエスト不正 |
| 401 | 認証エラー |
| 404 | リソース不存在 |
| 409 | 競合（重複など） |
| 500 | サーバーエラー |
