# データベース設計書

## ER図

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│    users     │     │   devices    │     │  notifications   │
├──────────────┤     ├──────────────┤     ├──────────────────┤
│ id (PK)      │◄──┐ │ id (PK)      │     │ id (PK)          │
│ name         │   │ │ user_id (FK) │────►│ caller_id (FK)   │
│ role         │   │ │ device_type  │     │ callee_id (FK)   │
│ extension    │   │ │ device_token │     │ type             │
│ email        │   └─│ platform     │     │ status           │
│ is_active    │     │ sip_username │     │ message          │
│ created_at   │     │ is_online    │     │ sent_at          │
│ updated_at   │     │ last_seen    │     │ delivered_at     │
└──────────────┘     │ created_at   │     │ read_at          │
       │             └──────────────┘     │ created_at       │
       │                                  └──────────────────┘
       │
       │             ┌──────────────┐     ┌──────────────────┐
       │             │    calls     │     │    call_logs      │
       │             ├──────────────┤     ├──────────────────┤
       └────────────►│ id (PK)      │◄────│ id (PK)          │
                     │ caller_id(FK)│     │ call_id (FK)     │
                     │ callee_id(FK)│     │ event_type       │
                     │ status       │     │ description      │
                     │ started_at   │     │ metadata (JSON)  │
                     │ answered_at  │     │ created_at       │
                     │ ended_at     │     └──────────────────┘
                     │ duration     │
                     │ quality_score│
                     │ created_at   │
                     └──────────────┘
```

## テーブル定義

### users テーブル
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | ユーザーID |
| name | VARCHAR(100) | NOT NULL | 氏名 |
| role | VARCHAR(20) | NOT NULL | 'resident' or 'staff' |
| extension | VARCHAR(10) | UNIQUE | 内線番号 |
| email | VARCHAR(255) | UNIQUE | メールアドレス |
| room_number | VARCHAR(20) | | 部屋番号（利用者のみ） |
| is_active | BOOLEAN | DEFAULT true | アクティブ状態 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新日時 |

### devices テーブル
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | デバイスID |
| user_id | INTEGER | FK → users.id | 所有者 |
| device_type | VARCHAR(20) | NOT NULL | 'esp32' / 'android' / 'web' |
| device_token | VARCHAR(512) | | FCMトークン |
| platform | VARCHAR(20) | | 'android' / 'ios' / 'web' |
| sip_username | VARCHAR(50) | UNIQUE | SIPユーザー名 |
| sip_password | VARCHAR(100) | | SIPパスワード（暗号化） |
| is_online | BOOLEAN | DEFAULT false | オンライン状態 |
| last_seen | TIMESTAMP | | 最終応答日時 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

### calls テーブル
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 通話ID |
| caller_id | INTEGER | FK → users.id | 発信者 |
| callee_id | INTEGER | FK → users.id | 着信者 |
| status | VARCHAR(20) | NOT NULL | 'ringing' / 'answered' / 'ended' / 'missed' / 'failed' |
| started_at | TIMESTAMP | DEFAULT NOW() | 発信日時 |
| answered_at | TIMESTAMP | | 応答日時 |
| ended_at | TIMESTAMP | | 終了日時 |
| duration | INTEGER | | 通話秒数 |
| quality_score | DECIMAL(3,1) | | 音声品質スコア(1.0-5.0) |
| end_reason | VARCHAR(50) | | 終了理由 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

### notifications テーブル
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | 通知ID |
| caller_id | INTEGER | FK → users.id | 発信者（利用者） |
| callee_id | INTEGER | FK → users.id | 着信者（職員） |
| type | VARCHAR(20) | NOT NULL | 'call_request' / 'emergency' / 'system' |
| status | VARCHAR(20) | DEFAULT 'pending' | 'pending' / 'sent' / 'delivered' / 'read' / 'failed' |
| message | TEXT | | 通知メッセージ |
| sent_at | TIMESTAMP | | 送信日時 |
| delivered_at | TIMESTAMP | | 到達日時 |
| read_at | TIMESTAMP | | 既読日時 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

### call_logs テーブル
| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL | PK | ログID |
| call_id | INTEGER | FK → calls.id | 通話ID |
| event_type | VARCHAR(50) | NOT NULL | 'initiated' / 'ringing' / 'answered' / 'ended' / 'error' |
| description | TEXT | | イベント説明 |
| metadata | JSONB | | 追加メタデータ |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |

## インデックス

```sql
CREATE INDEX idx_calls_caller_id ON calls(caller_id);
CREATE INDEX idx_calls_callee_id ON calls(callee_id);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_started_at ON calls(started_at DESC);
CREATE INDEX idx_notifications_callee_id ON notifications(callee_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_call_logs_call_id ON call_logs(call_id);
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at DESC);
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_sip_username ON devices(sip_username);
```
