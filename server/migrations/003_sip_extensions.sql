-- ============================================================
-- 003: SIP内線の整備（実機通話 Phase3）
--
-- 方針:
--   - 利用者実機(ESP32/M5StickS3) = 内線 1000 + user_id 系
--     （user_id=1 → 内線1001）… pjsip.conf の 1001-1003 と一致
--   - 職員ブラウザ = 内線 2000 + 連番 … pjsip.conf の 2001-2005 と一致
--   - sip_username = 内線番号そのもの（Asterisk endpoint名と同一）
-- ============================================================

-- 利用者1（田中太郎）の実機端末を登録
-- device_type='esp32' が「実機」の印。webシミュレータ端末とは別レコード
INSERT INTO devices (user_id, device_type, platform, sip_username, sip_password, is_online)
SELECT 1, 'esp32', 'm5sticks3', '1001', 'res1001_dev', false
WHERE NOT EXISTS (SELECT 1 FROM devices WHERE sip_username = '1001');

-- 既存の resident_1001 形式の旧SIP設定は内線番号形式に更新
UPDATE devices SET sip_username = NULL, sip_password = NULL
WHERE sip_username LIKE 'resident_%' OR sip_username LIKE 'staff_%';

-- 職員のブラウザ端末（webデバイス）に内線を割当（職員上位5名）
WITH staff_ext AS (
  SELECT u.id AS user_id,
         2000 + ROW_NUMBER() OVER (ORDER BY u.id) AS ext
  FROM users u
  WHERE u.role = 'staff' AND u.is_active = true
  ORDER BY u.id
  LIMIT 5
)
UPDATE devices d
SET sip_username = s.ext::text,
    sip_password = 'staff' || s.ext || '_dev'
FROM staff_ext s
WHERE d.user_id = s.user_id
  AND d.device_type = 'web';

-- webデバイスが無い職員には作成
INSERT INTO devices (user_id, device_type, platform, sip_username, sip_password, is_online)
SELECT s.user_id, 'web', 'browser', s.ext::text, 'staff' || s.ext || '_dev', false
FROM (
  SELECT u.id AS user_id,
         2000 + ROW_NUMBER() OVER (ORDER BY u.id) AS ext
  FROM users u
  WHERE u.role = 'staff' AND u.is_active = true
  ORDER BY u.id
  LIMIT 5
) s
WHERE NOT EXISTS (
  SELECT 1 FROM devices d WHERE d.user_id = s.user_id AND d.device_type = 'web'
)
AND NOT EXISTS (SELECT 1 FROM devices WHERE sip_username = s.ext::text);
