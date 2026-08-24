// RTP (G.711 PCMU) 送受信
#pragma once
#include <WiFiUdp.h>
#include "config.h"
#include "g711.h"

class RtpSession {
public:
  bool active = false;

  bool begin(IPAddress remoteIp, uint16_t remotePort) {
    _remoteIp = remoteIp;
    _remotePort = remotePort;
    _ssrc = esp_random();
    _seq = esp_random() & 0xFFFF;
    _ts = esp_random();
    if (!_udp.begin(RTP_LOCAL_PORT)) return false;
    active = true;
    return true;
  }

  void end() {
    if (active) _udp.stop();
    active = false;
  }

  // 20ms モノラルPCMフレームを ulaw RTP で送信
  void sendFrame(const int16_t* pcm, size_t n) {
    if (!active || n == 0) return;
    uint8_t pkt[12 + RTP_SAMPLES];
    pkt[0] = 0x80;                       // V=2
    pkt[1] = RTP_PAYLOAD_PCMU;           // PT=0, M=0
    pkt[2] = _seq >> 8;  pkt[3] = _seq & 0xFF;
    pkt[4] = _ts >> 24;  pkt[5] = _ts >> 16; pkt[6] = _ts >> 8; pkt[7] = _ts;
    pkt[8] = _ssrc >> 24; pkt[9] = _ssrc >> 16; pkt[10] = _ssrc >> 8; pkt[11] = _ssrc;
    if (n > RTP_SAMPLES) n = RTP_SAMPLES;
    for (size_t i = 0; i < n; i++) pkt[12 + i] = ulaw_encode(pcm[i]);
    _udp.beginPacket(_remoteIp, _remotePort);
    _udp.write(pkt, 12 + n);
    _udp.endPacket();
    _seq++;
    _ts += n;
  }

  // 受信パケットを1つ取り出しPCMへ (無ければ0)
  size_t receiveFrame(int16_t* pcm, size_t maxN) {
    if (!active) return 0;
    int sz = _udp.parsePacket();
    if (sz < 13) { if (sz > 0) _udp.flush(); return 0; }
    uint8_t buf[12 + RTP_SAMPLES * 2];
    int got = _udp.read(buf, min((size_t)sz, sizeof(buf)));
    if (got < 13) return 0;
    if ((buf[1] & 0x7F) != RTP_PAYLOAD_PCMU) return 0;  // PCMU以外は無視
    size_t hdr = 12 + (buf[0] & 0x0F) * 4;              // CSRC考慮
    if ((size_t)got <= hdr) return 0;
    size_t n = min((size_t)got - hdr, maxN);
    for (size_t i = 0; i < n; i++) pcm[i] = ulaw_decode(buf[hdr + i]);
    return n;
  }

private:
  WiFiUDP _udp;
  IPAddress _remoteIp;
  uint16_t _remotePort = 0;
  uint32_t _ssrc = 0, _ts = 0;
  uint16_t _seq = 0;
};
