// 最小SIPユーザーエージェント (UAS専用: REGISTER + 着信自動応答 + BYE)
// ナースコール実機用 - 音声呼は常に「職員→実機」方向のため発信機能は持たない
#pragma once
#include <WiFi.h>
#include <WiFiUdp.h>
#include <mbedtls/md5.h>
#include "config.h"

enum class SipState { IDLE, REGISTERING, REGISTERED, RINGING, IN_CALL };

class SipClient {
public:
  SipState state = SipState::IDLE;
  IPAddress rtpRemoteIp;      // 相手(Asterisk)のRTPアドレス
  uint16_t  rtpRemotePort = 0;

  void begin(const String& server, uint16_t port, const String& user,
             const String& pass, const String& domain) {
    _server = server; _port = port; _user = user; _pass = pass; _domain = domain;
    _serverIp.fromString(server);
    _udp.begin(SIP_LOCAL_PORT);
    _callIdSeed = String(esp_random(), HEX) + String(esp_random(), HEX);
    sendRegister();
  }

  // メインループから毎回呼ぶ
  void poll() {
    // 受信処理
    int sz = _udp.parsePacket();
    if (sz > 0) {
      static char buf[2048];
      int got = _udp.read(buf, sizeof(buf) - 1);
      if (got > 0) { buf[got] = 0; handleMessage(String(buf)); }
    }
    uint32_t now = millis();
    // 再REGISTER (有効期間の半分で)
    if (state != SipState::IDLE && now - _lastRegister > (uint32_t)SIP_EXPIRES * 500) {
      sendRegister();
    }
    // 200 OK(INVITE応答) の再送 (ACK未着時)
    if (_awaitingAck && now - _okSentAt > 500 && _okRetries < 6) {
      _udp.beginPacket(_inviteSrcIp, _inviteSrcPort);
      _udp.print(_lastOk);
      _udp.endPacket();
      _okSentAt = now; _okRetries++;
    }
  }

  // 通話中にユーザー操作で切断
  void hangup() {
    if (state != SipState::IN_CALL && state != SipState::RINGING) return;
    _cseq++;
    String m;
    m  = "BYE " + _remoteContact + " SIP/2.0\r\n";
    m += "Via: SIP/2.0/UDP " + localAddr() + ";branch=z9hG4bK" + String(esp_random(), HEX) + "\r\n";
    m += "Max-Forwards: 70\r\n";
    // UAS発の in-dialog リクエストは From/To を反転
    m += "From: " + _dlgLocal + "\r\n";
    m += "To: " + _dlgRemote + "\r\n";
    m += "Call-ID: " + _dlgCallId + "\r\n";
    m += "CSeq: " + String(_cseq) + " BYE\r\n";
    m += "Content-Length: 0\r\n\r\n";
    _udp.beginPacket(_inviteSrcIp, _inviteSrcPort);
    _udp.print(m);
    _udp.endPacket();
    endDialog();
  }

  bool registered() const {
    return state == SipState::REGISTERED || state == SipState::RINGING || state == SipState::IN_CALL;
  }

  // コールバック (main側で設定)
  void (*onCallStart)() = nullptr;
  void (*onCallEnd)() = nullptr;

private:
  WiFiUDP _udp;
  String _server, _user, _pass, _domain, _callIdSeed;
  IPAddress _serverIp;
  uint16_t _port = 5060;
  uint32_t _cseq = 1, _regCseq = 0, _lastRegister = 0;
  String _regCallId, _authNonce, _authRealm;
  // ダイアログ状態
  String _dlgCallId, _dlgLocal, _dlgRemote, _remoteContact, _lastOk;
  IPAddress _inviteSrcIp;
  uint16_t _inviteSrcPort = 0;
  bool _awaitingAck = false;
  uint32_t _okSentAt = 0;
  uint8_t _okRetries = 0;

  String localAddr() { return WiFi.localIP().toString() + ":" + String(SIP_LOCAL_PORT); }

  static String md5hex(const String& s) {
    unsigned char d[16];
    mbedtls_md5((const unsigned char*)s.c_str(), s.length(), d);
    char out[33];
    for (int i = 0; i < 16; i++) sprintf(out + i * 2, "%02x", d[i]);
    return String(out);
  }

  String digestResponse(const String& method, const String& uri) {
    String ha1 = md5hex(_user + ":" + _authRealm + ":" + _pass);
    String ha2 = md5hex(method + ":" + uri);
    return md5hex(ha1 + ":" + _authNonce + ":" + ha2);
  }

  static String getHeader(const String& msg, const String& name) {
    // ヘッダ名で行頭検索 (大文字小文字無視)
    int pos = 0;
    String lower = msg; lower.toLowerCase();
    String key = name; key.toLowerCase(); key = "\n" + key + ":";
    int idx = lower.indexOf(key, pos);
    if (idx < 0) return "";
    int vs = idx + key.length();
    int ve = msg.indexOf("\r\n", vs);
    if (ve < 0) ve = msg.length();
    String v = msg.substring(vs, ve); v.trim();
    return v;
  }

  static String getParam(const String& header, const String& param) {
    // header内の param="value" または param=value を抽出
    int idx = header.indexOf(param + "=");
    if (idx < 0) return "";
    int vs = idx + param.length() + 1;
    if (header[vs] == '"') {
      int ve = header.indexOf('"', vs + 1);
      return header.substring(vs + 1, ve);
    }
    int ve = vs;
    while (ve < (int)header.length() && header[ve] != ',' && header[ve] != ';' && header[ve] != ' ') ve++;
    return header.substring(vs, ve);
  }

  void sendRegister(bool withAuth = false) {
    if (!withAuth) { _regCallId = _callIdSeed + "-reg"; }
    _regCseq++;
    _lastRegister = millis();
    String uri = "sip:" + _domain;
    String m;
    m  = "REGISTER " + uri + " SIP/2.0\r\n";
    m += "Via: SIP/2.0/UDP " + localAddr() + ";branch=z9hG4bK" + String(esp_random(), HEX) + ";rport\r\n";
    m += "Max-Forwards: 70\r\n";
    m += "From: <sip:" + _user + "@" + _domain + ">;tag=" + _callIdSeed + "\r\n";
    m += "To: <sip:" + _user + "@" + _domain + ">\r\n";
    m += "Call-ID: " + _regCallId + "\r\n";
    m += "CSeq: " + String(_regCseq) + " REGISTER\r\n";
    m += "Contact: <sip:" + _user + "@" + localAddr() + ">\r\n";
    m += "Expires: " + String(SIP_EXPIRES) + "\r\n";
    if (withAuth) {
      m += "Authorization: Digest username=\"" + _user + "\", realm=\"" + _authRealm +
           "\", nonce=\"" + _authNonce + "\", uri=\"" + uri +
           "\", response=\"" + digestResponse("REGISTER", uri) + "\", algorithm=MD5\r\n";
    }
    m += "Content-Length: 0\r\n\r\n";
    _udp.beginPacket(_serverIp, _port);
    _udp.print(m);
    _udp.endPacket();
    if (state == SipState::IDLE) state = SipState::REGISTERING;
  }

  void handleMessage(const String& msg) {
    if (msg.startsWith("SIP/2.0 ")) {
      int code = msg.substring(8, 11).toInt();
      String cseqH = getHeader(msg, "CSeq");
      if (cseqH.indexOf("REGISTER") >= 0) {
        if (code == 401) {
          String auth = getHeader(msg, "WWW-Authenticate");
          _authRealm = getParam(auth, "realm");
          _authNonce = getParam(auth, "nonce");
          sendRegister(true);
        } else if (code == 200) {
          if (state == SipState::REGISTERING) state = SipState::REGISTERED;
        }
      }
      return;
    }
    // リクエスト処理
    int sp = msg.indexOf(' ');
    if (sp < 0) return;
    String method = msg.substring(0, sp);
    if (method == "INVITE")      handleInvite(msg);
    else if (method == "ACK")    handleAck(msg);
    else if (method == "BYE")    handleBye(msg);
    else if (method == "OPTIONS") respondSimple(msg, "200 OK");
    else if (method == "CANCEL") { respondSimple(msg, "200 OK"); endDialog(); }
    else if (method != "ACK")    respondSimple(msg, "501 Not Implemented");
  }

  void handleInvite(const String& msg) {
    _inviteSrcIp = _udp.remoteIP();
    _inviteSrcPort = _udp.remotePort();
    // SDP解析: c= と m=audio
    parseSdp(msg);
    if (rtpRemotePort == 0) { respondSimple(msg, "488 Not Acceptable Here"); return; }

    // ダイアログ情報を保存 (From=相手, To=自分+生成tag)
    String from = getHeader(msg, "From");
    String to   = getHeader(msg, "To");
    _dlgCallId  = getHeader(msg, "Call-ID");
    String myTag = String(esp_random(), HEX);
    if (to.indexOf("tag=") < 0) to += ";tag=" + myTag;
    _dlgLocal  = to;     // 自分 (UAS)
    _dlgRemote = from;   // 相手
    String contact = getHeader(msg, "Contact");
    int lt = contact.indexOf('<'), gt = contact.indexOf('>');
    _remoteContact = (lt >= 0 && gt > lt) ? contact.substring(lt + 1, gt) : ("sip:" + _serverIp.toString());

    // SDPアンサー (PCMU固定)
    String sdp;
    sdp  = "v=0\r\n";
    sdp += "o=- " + String(esp_random()) + " 1 IN IP4 " + WiFi.localIP().toString() + "\r\n";
    sdp += "s=nursecall\r\n";
    sdp += "c=IN IP4 " + WiFi.localIP().toString() + "\r\n";
    sdp += "t=0 0\r\n";
    sdp += "m=audio " + String(RTP_LOCAL_PORT) + " RTP/AVP 0\r\n";
    sdp += "a=rtpmap:0 PCMU/8000\r\n";
    sdp += "a=ptime:20\r\n";
    sdp += "a=sendrecv\r\n";

    // 自動応答: 200 OK
    String ok;
    ok  = "SIP/2.0 200 OK\r\n";
    ok += "Via: " + getHeader(msg, "Via") + "\r\n";
    ok += "From: " + from + "\r\n";
    ok += "To: " + to + "\r\n";
    ok += "Call-ID: " + _dlgCallId + "\r\n";
    ok += "CSeq: " + getHeader(msg, "CSeq") + "\r\n";
    ok += "Contact: <sip:" + _user + "@" + localAddr() + ">\r\n";
    ok += "Content-Type: application/sdp\r\n";
    ok += "Content-Length: " + String(sdp.length()) + "\r\n\r\n" + sdp;
    _lastOk = ok;
    _udp.beginPacket(_inviteSrcIp, _inviteSrcPort);
    _udp.print(ok);
    _udp.endPacket();
    _awaitingAck = true;
    _okSentAt = millis();
    _okRetries = 0;
    state = SipState::RINGING;
  }

  void handleAck(const String& msg) {
    if (getHeader(msg, "Call-ID") != _dlgCallId) return;
    _awaitingAck = false;
    if (state == SipState::RINGING) {
      state = SipState::IN_CALL;
      if (onCallStart) onCallStart();
    }
  }

  void handleBye(const String& msg) {
    respondSimple(msg, "200 OK");
    if (getHeader(msg, "Call-ID") == _dlgCallId) endDialog();
  }

  void respondSimple(const String& req, const char* status) {
    String m;
    m  = String("SIP/2.0 ") + status + "\r\n";
    m += "Via: " + getHeader(req, "Via") + "\r\n";
    m += "From: " + getHeader(req, "From") + "\r\n";
    String to = getHeader(req, "To");
    m += "To: " + to + "\r\n";
    m += "Call-ID: " + getHeader(req, "Call-ID") + "\r\n";
    m += "CSeq: " + getHeader(req, "CSeq") + "\r\n";
    m += "Content-Length: 0\r\n\r\n";
    _udp.beginPacket(_udp.remoteIP(), _udp.remotePort());
    _udp.print(m);
    _udp.endPacket();
  }

  void parseSdp(const String& msg) {
    rtpRemotePort = 0;
    int body = msg.indexOf("\r\n\r\n");
    if (body < 0) return;
    String sdp = msg.substring(body + 4);
    int c = sdp.indexOf("c=IN IP4 ");
    if (c >= 0) {
      int e = sdp.indexOf('\r', c);
      String ip = sdp.substring(c + 9, e); ip.trim();
      rtpRemoteIp.fromString(ip);
    } else {
      rtpRemoteIp = _inviteSrcIp;  // c=無しならSIP送信元
    }
    int ma = sdp.indexOf("m=audio ");
    if (ma >= 0) {
      int ps = ma + 8;
      int pe = sdp.indexOf(' ', ps);
      rtpRemotePort = sdp.substring(ps, pe).toInt();
    }
  }

  void endDialog() {
    bool wasCall = (state == SipState::IN_CALL || state == SipState::RINGING);
    _awaitingAck = false;
    _dlgCallId = "";
    rtpRemotePort = 0;
    state = SipState::REGISTERED;
    if (wasCall && onCallEnd) onCallEnd();
  }
};
