// プロビジョニング (仕様書§6): 初回起動時 SoftAP + 設定Webページ → NVS保存
#pragma once
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "config.h"

struct DeviceConfig {
  String wifiSsid, wifiPass;
  String serverHost;      // 施設PCのIP (例 192.168.1.50)
  uint16_t apiPort = 3001;
  String apiKey;
  int userId = 0;
  String sipUser, sipPass, sipDomain;
  String beaconUuid;      // 施設ビーコンUUID (空 = 全iBeacon受理)
  bool valid = false;
};

class Provisioning {
public:
  DeviceConfig cfg;

  bool load() {
    Preferences p;
    p.begin("nursecall", true);
    cfg.wifiSsid   = p.getString("ssid", "");
    cfg.wifiPass   = p.getString("pass", "");
    cfg.serverHost = p.getString("host", "");
    cfg.apiPort    = p.getUShort("apiport", 3001);
    cfg.apiKey     = p.getString("apikey", "");
    cfg.userId     = p.getInt("userid", 0);
    cfg.sipUser    = p.getString("sipuser", "1001");
    cfg.sipPass    = p.getString("sippass", "");
    cfg.sipDomain  = p.getString("sipdom", "nursecall.local");
    cfg.beaconUuid = p.getString("bcnuuid", "");
    p.end();
    cfg.valid = cfg.wifiSsid.length() > 0 && cfg.serverHost.length() > 0 && cfg.userId > 0;
    return cfg.valid;
  }

  void save() {
    Preferences p;
    p.begin("nursecall", false);
    p.putString("ssid", cfg.wifiSsid);
    p.putString("pass", cfg.wifiPass);
    p.putString("host", cfg.serverHost);
    p.putUShort("apiport", cfg.apiPort);
    p.putString("apikey", cfg.apiKey);
    p.putInt("userid", cfg.userId);
    p.putString("sipuser", cfg.sipUser);
    p.putString("sippass", cfg.sipPass);
    p.putString("sipdom", cfg.sipDomain);
    p.putString("bcnuuid", cfg.beaconUuid);
    p.end();
  }

  // SoftAPモードで設定ページを提供 (保存されるまでブロック → 再起動)
  void runSetupPortal() {
    uint32_t chipId = (uint32_t)(ESP.getEfuseMac() & 0xFFFF);
    char ssid[32];
    snprintf(ssid, sizeof(ssid), SETUP_AP_PREFIX "%04X", chipId);
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ssid);   // オープンAP (設定専用・短時間運用)

    WebServer server(80);
    bool saved = false;

    server.on("/", [&]() {
      String html =
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>ナースコール端末設定</title>"
        "<style>body{font-family:sans-serif;max-width:400px;margin:20px auto;padding:0 12px}"
        "label{display:block;margin-top:10px;font-weight:bold;font-size:14px}"
        "input{width:100%;padding:8px;box-sizing:border-box}"
        "button{margin-top:16px;width:100%;padding:12px;background:#2563eb;color:#fff;border:0;border-radius:6px;font-size:16px}</style>"
        "</head><body><h2>ナースコール端末 初期設定</h2><form method='POST' action='/save'>"
        "<label>施設Wi-Fi SSID</label><input name='ssid' required value='" + cfg.wifiSsid + "'>"
        "<label>Wi-Fi パスワード</label><input name='pass' type='password' value='" + cfg.wifiPass + "'>"
        "<label>サーバーIP (施設PC)</label><input name='host' required placeholder='192.168.1.50' value='" + cfg.serverHost + "'>"
        "<label>APIポート</label><input name='apiport' value='" + String(cfg.apiPort) + "'>"
        "<label>APIキー</label><input name='apikey' required value='" + cfg.apiKey + "'>"
        "<label>利用者ID (user_id)</label><input name='userid' type='number' required value='" + (cfg.userId ? String(cfg.userId) : "") + "'>"
        "<label>SIP内線番号</label><input name='sipuser' value='" + cfg.sipUser + "'>"
        "<label>SIPパスワード</label><input name='sippass' required value='" + cfg.sipPass + "'>"
        "<label>SIPドメイン</label><input name='sipdom' value='" + cfg.sipDomain + "'>"
        "<label>ビーコンUUID (任意)</label><input name='bcnuuid' placeholder='空=全iBeacon受理' value='" + cfg.beaconUuid + "'>"
        "<button type='submit'>保存して再起動</button></form></body></html>";
      server.send(200, "text/html", html);
    });

    server.on("/save", HTTP_POST, [&]() {
      cfg.wifiSsid   = server.arg("ssid");
      cfg.wifiPass   = server.arg("pass");
      cfg.serverHost = server.arg("host");
      cfg.apiPort    = server.arg("apiport").toInt();
      if (cfg.apiPort == 0) cfg.apiPort = 3001;
      cfg.apiKey     = server.arg("apikey");
      cfg.userId     = server.arg("userid").toInt();
      cfg.sipUser    = server.arg("sipuser");
      cfg.sipPass    = server.arg("sippass");
      cfg.sipDomain  = server.arg("sipdom");
      cfg.beaconUuid = server.arg("bcnuuid");
      save();
      server.send(200, "text/html",
        "<meta charset='utf-8'><h2>保存しました。再起動します...</h2>");
      saved = true;
    });

    server.begin();
    M5.Display.fillScreen(TFT_NAVY);
    M5.Display.setCursor(4, 8);
    M5.Display.setTextSize(2);
    M5.Display.println("SETUP MODE");
    M5.Display.setTextSize(1);
    M5.Display.printf("\n Wi-Fi AP:\n %s\n\n http://192.168.4.1/", ssid);

    while (!saved) { server.handleClient(); delay(2); }
    delay(1500);
    ESP.restart();
  }
};
