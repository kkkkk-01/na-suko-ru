-- ============================================================
-- Phase1 テスト用シードデータ
-- ============================================================

-- 利用者（入居者）
INSERT INTO users (name, role, extension, email, room_number) VALUES
    ('田中 太郎', 'resident', '1001', 'tanaka@example.com', '101'),
    ('佐藤 花子', 'resident', '1002', 'sato@example.com', '102'),
    ('鈴木 一郎', 'resident', '1003', 'suzuki@example.com', '103')
ON CONFLICT (extension) DO NOTHING;

-- 職員
INSERT INTO users (name, role, extension, email) VALUES
    ('山田 看護師', 'staff', '2001', 'yamada@facility.com'),
    ('高橋 介護士', 'staff', '2002', 'takahashi@facility.com'),
    ('伊藤 介護士', 'staff', '2003', 'ito@facility.com')
ON CONFLICT (extension) DO NOTHING;

-- 管理者
INSERT INTO users (name, role, extension, email) VALUES
    ('管理者', 'admin', '9001', 'admin@facility.com')
ON CONFLICT (extension) DO NOTHING;

-- 利用者端末（WebRTC）
INSERT INTO devices (user_id, device_type, platform, sip_username, sip_password)
SELECT id, 'web', 'web', 'resident_' || extension, 'res' || extension || 'pass'
FROM users WHERE role = 'resident'
ON CONFLICT (sip_username) DO NOTHING;

-- 職員端末（Android SIP）
INSERT INTO devices (user_id, device_type, platform, sip_username, sip_password)
SELECT id, 'android', 'android', 'staff_' || extension, 'staff' || extension || 'pass'
FROM users WHERE role = 'staff'
ON CONFLICT (sip_username) DO NOTHING;
