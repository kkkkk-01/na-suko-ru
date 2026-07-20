-- BLEビーコン シードデータ（1Fフロアマップ想定）
INSERT INTO beacons (beacon_id, name, floor, area_type, map_x, map_y) VALUES
    ('BCN-101',    '101号室',   '1F', 'room',     12, 22),
    ('BCN-102',    '102号室',   '1F', 'room',     32, 22),
    ('BCN-103',    '103号室',   '1F', 'room',     52, 22),
    ('BCN-TOILET', 'トイレ',    '1F', 'toilet',   75, 22),
    ('BCN-BATH',   '浴室',      '1F', 'bath',     90, 22),
    ('BCN-DINING', '食堂',      '1F', 'dining',   25, 72),
    ('BCN-COMMON', '談話室',    '1F', 'common',   60, 72),
    ('BCN-ENT',    '玄関',      '1F', 'entrance', 88, 72)
ON CONFLICT (beacon_id) DO NOTHING;

-- 初期位置: 各利用者を居室に配置
UPDATE devices SET current_beacon_id = 'BCN-101', battery_level = 85, last_heartbeat = NOW()
WHERE user_id = (SELECT id FROM users WHERE extension = '1001');
UPDATE devices SET current_beacon_id = 'BCN-102', battery_level = 62, last_heartbeat = NOW()
WHERE user_id = (SELECT id FROM users WHERE extension = '1002');
UPDATE devices SET current_beacon_id = 'BCN-103', battery_level = 91, last_heartbeat = NOW()
WHERE user_id = (SELECT id FROM users WHERE extension = '1003');
