// G.711 u-law コーデック (ITU-T G.711 準拠)
#pragma once
#include <stdint.h>

static inline uint8_t ulaw_encode(int16_t pcm) {
  const int16_t BIAS = 0x84;
  const int16_t CLIP = 32635;
  uint8_t sign = (pcm >> 8) & 0x80;
  if (sign) pcm = -pcm;
  if (pcm > CLIP) pcm = CLIP;
  pcm += BIAS;
  uint8_t exponent = 7;
  for (int16_t mask = 0x4000; (pcm & mask) == 0 && exponent > 0; mask >>= 1) exponent--;
  uint8_t mantissa = (pcm >> (exponent + 3)) & 0x0F;
  return ~(sign | (exponent << 4) | mantissa);
}

static inline int16_t ulaw_decode(uint8_t u) {
  u = ~u;
  uint8_t sign = u & 0x80;
  uint8_t exponent = (u >> 4) & 0x07;
  uint8_t mantissa = u & 0x0F;
  int16_t sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}
