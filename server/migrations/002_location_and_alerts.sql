-- ============================================================
-- Migration 002: BLE位置検知 + アラート監視 (Phase2/3機能)
-- ============================================================

-- BLEビーコン（各居室・トイレ・共用部に設置、工事不要）
CREATE TABLE IF NOT EXISTS beacons (
    id SERIAL PRIMARY KEY,
    beacon_id VARCHAR(50) UNIQUE NOT NULL,          -- 例: BCN-101
    name VARCHAR(100) NOT NULL,                     -- 例: 101号室
    floor VARCHAR(20) DEFAULT '1F',
    area_type VARCHAR(20) NOT NULL DEFAULT 'room'
        CHECK (area_type IN ('room', 'toilet', 'bath', 'dining', 'common', 'corridor', 'entrance')),
    map_x DECIMAL(5,2) DEFAULT 50,                  -- フロアマップ上のX座標(%)
    map_y DECIMAL(5,2) DEFAULT 50,                  -- フロアマップ上のY座標(%)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 位置履歴（端末ハートビートで最寄りビーコンを記録 → 所在確認・徘徊検知の土台）
CREATE TABLE IF NOT EXISTS location_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    beacon_id VARCHAR(50) NOT NULL,
    rssi INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_location_logs_user ON location_logs(user_id, created_at DESC);

-- アラート（オフライン・バッテリー低下・呼出無応答エスカレーション）
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('offline', 'battery_low', 'unanswered_call', 'charge_reminder', 'system')),
    severity VARCHAR(10) NOT NULL DEFAULT 'warning'
        CHECK (severity IN ('info', 'warning', 'critical')),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, created_at DESC);

-- devices拡張: バッテリー・ハートビート・現在位置
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level INTEGER DEFAULT 100;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS current_beacon_id VARCHAR(50);

-- calls拡張: 呼出時の位置情報（革命ポイント: どこから呼んだかが分かる）
ALTER TABLE calls ADD COLUMN IF NOT EXISTS location_beacon_id VARCHAR(50);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS location_name VARCHAR(100);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS location_rssi INTEGER;
