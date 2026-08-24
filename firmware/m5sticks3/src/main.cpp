// ============================================================
// ナースコール名札型端末ファームウェア (M5StickS3)
// docs/ESP32_FIRMWARE_SPEC.md 準拠
//
//  - ボタンA: 呼出 (REST POST /calls/request)
//  - SIP内線として登録 → 職員からの着信を自動応答 → G.711通話
//  - 通話中 ボタンA長押し(1秒): 切断 (BYE)
//  - 30秒ごとハートビート (位置 + バッテリー)
//  - 15秒ごとBLEビーコンスキャン (通話中は停止)
//  - 画面 = 状態表示 (LED仕様を1.14" LCDで表現)
// ============================================================
#include <M5Unified.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "config.h"
#include "provisioning.hpp"
#include "beacon.hpp"
#include "sip.hpp"
#include "rtp.hpp"
#include "audio.hpp"

Provisioning prov;
BeaconScanner beacons;
SipClient sip;
RtpSession rtp;
AudioHW audio;

// ---- 状態 ----
enum class UiState { BOOT, ONLINE, CALLING, IN_CALL, WIFI_DOWN, SEND_FAIL };
UiState ui = UiState::BOOT;
uint32_t lastHeartbeat = 0;
uint32_t lastScan = 0;
uint32_t callingSince = 0;
volatile bool callActive = false;
TaskHandle_t audioTaskHandle = nullptr;

// ============ 画面表示 (LED仕様の代替) ============
void drawStatus() {
  auto& d = M5.Display;
  uint16_t bg; const char* label; const char* sub = "";
  switch (ui) {
    case UiState::BOOT:      bg = TFT_DARKGREY;  label = "起動中...";     break;
    case UiState::ONLINE:    bg = TFT_DARKGREEN; label = "オンライン";    break;
    case UiState::CALLING:   bg = TFT_ORANGE;    label = "呼出中";  sub = "職員を呼んでいます"; break;
    case UiState::IN_CALL:   bg = TFT_GREEN;     label = "通話中";  sub = "長押しで終了";       break;
    case UiState::WIFI_DOWN: bg = TFT_RED;       label = "Wi-Fi切断";     break;
    case UiState::SEND_FAIL: bg = TFT_RED;       label = "送信失敗";sub = "職員に届いていません"; break;
  }
  d.fillScreen(bg);
  d.setTextColor(TFT_WHITE, bg);
  d.setTextSize(2);
  d.setCursor(6, 30);
  d.println(label);
  d.setTextSize(1);
  d.setCursor(6, 70);
  d.println(sub);
  // フッター: 位置 / SIP / 電池
  d.setCursor(6, 105);
  d.printf("%s  SIP:%s  %d%%",
           beacons.currentBeaconId.length() ? beacons.currentBeaconId.c_str() : "位置不明",
           sip.registered() ? "OK" : "--",
           M5.Power.getBatteryLevel());
}

void setUi(UiState s) { if (ui != s) { ui = s; drawStatus(); } }

// ============ REST ============
String apiBase() {
  return "http://" + prov.cfg.serverHost + ":" + String(prov.cfg.apiPort) + "/api/v1";
}

// 呼出送信 (仕様書§4-2: 3回リトライ、失敗で赤表示)
bool sendCallRequest() {
  for (int attempt = 0; attempt < 3; attempt++) {
    HTTPClient http;
    http.setTimeout(4000);
    http.begin(apiBase() + "/calls/request");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", prov.cfg.apiKey);
    String body = "{\"caller_id\":" + String(prov.cfg.userId);
    if (beacons.currentBeaconId.length()) {
      body += ",\"beacon_id\":\"" + beacons.currentBeaconId + "\",\"rssi\":" + String(beacons.currentRssi);
    }
    body += "}";
    int code = http.POST(body);
    http.end();
    if (code == 201 || code == 200) return true;
    delay(300 * (attempt + 1));
  }
  return false;
}

// ハートビート (仕様書§4-1)
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(4000);
  http.begin(apiBase() + "/locations/heartbeat");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", prov.cfg.apiKey);
  String body = "{\"user_id\":" + String(prov.cfg.userId);
  if (beacons.currentBeaconId.length()) {
    body += ",\"beacon_id\":\"" + beacons.currentBeaconId + "\",\"rssi\":" + String(beacons.currentRssi);
  } else {
    body += ",\"beacon_id\":null,\"rssi\":null";
  }
  body += ",\"battery_level\":" + String(M5.Power.getBatteryLevel()) + "}";
  http.POST(body);   // 失敗しても次周期で再送 (90秒でサーバー側がオフライン検知)
  http.end();
}

// ============ 通話音声タスク (core 1) ============
// I2S読み取り(20msブロック)がRTP送信のペースメーカーになる
void audioTask(void*) {
  int16_t txPcm[RTP_SAMPLES];
  int16_t rxPcm[RTP_SAMPLES];
  while (callActive) {
    size_t n = audio.readFrame(txPcm);          // 20ms待ち = ペーシング
    if (n > 0) rtp.sendFrame(txPcm, n);
    // 受信キューを掃き出し再生 (最大3パケット/周期で追いつく)
    for (int k = 0; k < 3; k++) {
      size_t r = rtp.receiveFrame(rxPcm, RTP_SAMPLES);
      if (r == 0) break;
      audio.writeFrame(rxPcm, r);
    }
  }
  vTaskDelete(nullptr);
}

// ============ SIPコールバック ============
void onCallStart() {
  callActive = true;
  audio.flush();
  audio.ampOn();
  rtp.begin(sip.rtpRemoteIp, sip.rtpRemotePort);
  audio.beep(1400, 100);   // 応答通知
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, nullptr, 10, &audioTaskHandle, 1);
  setUi(UiState::IN_CALL);
}

void onCallEnd() {
  callActive = false;
  delay(50);               // audioTask 終了待ち
  rtp.end();
  audio.beep(600, 150);
  audio.ampOff();
  audio.flush();
  setUi(UiState::ONLINE);
}

// ============ セットアップ ============
void setup() {
  auto mcfg = M5.config();
  M5.begin(mcfg);
  M5.Display.setRotation(1);
  M5.Display.setFont(&fonts::lgfxJapanGothic_16);
  drawStatus();

  // 設定読み込み。未設定 or BtnB押しながら起動 → セットアップポータル
  M5.update();
  if (!prov.load() || M5.BtnB.isPressed()) {
    prov.runSetupPortal();   // 保存後に再起動 (戻らない)
  }

  // Wi-Fi接続
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);       // modem sleep (仕様書§5)
  WiFi.begin(prov.cfg.wifiSsid.c_str(), prov.cfg.wifiPass.c_str());
  M5.Display.fillScreen(TFT_DARKGREY);
  M5.Display.setCursor(6, 40);
  M5.Display.setTextSize(1);
  M5.Display.printf("Wi-Fi接続中: %s", prov.cfg.wifiSsid.c_str());
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000) delay(200);

  if (WiFi.status() != WL_CONNECTED) {
    setUi(UiState::WIFI_DOWN);
  } else {
    setUi(UiState::ONLINE);
  }

  // オーディオ初期化 (I2S全二重 + ES8311)
  audio.begin();

  // BLEスキャナ
  beacons.begin(prov.cfg.beaconUuid);

  // SIP登録 (SIPサーバー = APIと同じ施設PC)
  sip.onCallStart = onCallStart;
  sip.onCallEnd   = onCallEnd;
  sip.begin(prov.cfg.serverHost, 5060, prov.cfg.sipUser, prov.cfg.sipPass, prov.cfg.sipDomain);

  // 初回ハートビート
  sendHeartbeat();
  lastHeartbeat = millis();
  lastScan = millis();
}

// ============ メインループ ============
void loop() {
  M5.update();
  sip.poll();
  uint32_t now = millis();

  // --- Wi-Fi監視 ---
  if (WiFi.status() != WL_CONNECTED) {
    if (ui != UiState::WIFI_DOWN) setUi(UiState::WIFI_DOWN);
    WiFi.reconnect();
    delay(500);
    return;
  }
  if (ui == UiState::WIFI_DOWN) setUi(UiState::ONLINE);

  bool inCall = (sip.state == SipState::IN_CALL || sip.state == SipState::RINGING);

  // --- ボタンA: 呼出 / 通話中は長押しで切断 ---
  if (inCall) {
    if (M5.BtnA.pressedFor(HANGUP_HOLD_MS)) {
      sip.hangup();   // → onCallEnd
    }
  } else if (M5.BtnA.wasClicked()) {
    setUi(UiState::CALLING);
    callingSince = now;
    audio.ampOn();
    if (sendCallRequest()) {
      audio.beep(1800, 80);           // 送信成功ビープ
      audio.ampOff();
    } else {
      audio.beep(400, 400);           // 失敗音
      audio.ampOff();
      setUi(UiState::SEND_FAIL);      // 不達の可視化 (仕様書§4-2)
      callingSince = now;
    }
  }

  // 呼出中/失敗表示は20秒で通常復帰 (着信が来ればIN_CALLに遷移)
  if ((ui == UiState::CALLING || ui == UiState::SEND_FAIL) && !inCall &&
      now - callingSince > 20000) {
    setUi(UiState::ONLINE);
  }

  // --- ハートビート (30秒) ---
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = now;
    sendHeartbeat();
    if (ui == UiState::ONLINE) drawStatus();   // フッター更新
  }

  // --- BLEスキャン (15秒ごと・通話中は停止) ---
  if (!inCall && now - lastScan >= BLE_SCAN_INTERVAL_MS) {
    lastScan = now;
    String before = beacons.currentBeaconId;
    beacons.scanOnce();   // 3秒ブロック (通話中でないので許容)
    if (beacons.currentBeaconId != before && ui == UiState::ONLINE) drawStatus();
  }

  delay(inCall ? 2 : 10);
}
