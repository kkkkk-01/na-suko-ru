// ES8311 全二重オーディオ (8kHz/16bit, VoIP用)
// M5Unified の実証済みレジスタ値を ADC+DAC 同時有効に統合
#pragma once
#include <M5Unified.h>
#include <driver/i2s.h>
#include <math.h>
#include "config.h"

class AudioHW {
public:
  bool begin() {
    // I2S 全二重 (16bit ステレオ 8kHz → BCLK=256kHz, ES8311内部MCLK=BCLK*8=2.048MHz)
    i2s_config_t cfg = {};
    cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX);
    cfg.sample_rate = AUDIO_RATE;
    cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
    cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
    cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
    cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
    cfg.dma_buf_count = 6;
    cfg.dma_buf_len = RTP_SAMPLES;   // 20ms/バッファ → 計120msの吸収余裕
    cfg.use_apll = false;
    cfg.tx_desc_auto_clear = true;
    if (i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr) != ESP_OK) return false;

    i2s_pin_config_t pins = {};
    pins.mck_io_num = I2S_PIN_NO_CHANGE;   // ES8311はBCLKを内部MCLK化するため不要
    pins.bck_io_num = PIN_I2S_BCLK;
    pins.ws_io_num  = PIN_I2S_LRCK;
    pins.data_out_num = PIN_I2S_DOUT;
    pins.data_in_num  = PIN_I2S_DIN;
    if (i2s_set_pin(I2S_NUM_0, &pins) != ESP_OK) return false;
    i2s_zero_dma_buffer(I2S_NUM_0);
    return codecInit();
  }

  // ES8311 を ADC+DAC 同時有効で初期化 (M5Unified spk/mic コールバックの合成)
  bool codecInit() {
    static const uint8_t seq[][2] = {
      {0x00, 0x80},  // RESET: CSM power on
      {0x01, 0xBF},  // CLK: MCLK=BCLK選択 + 全クロック有効 (ADC+DAC)
      {0x02, 0x18},  // CLK: MULT_PRE=x8 (BCLK 256kHz → 内部MCLK 2.048MHz = 256*fs)
      {0x09, 0x0C},  // SDP-IN : I2S 16bit
      {0x0A, 0x0C},  // SDP-OUT: I2S 16bit
      {0x0D, 0x01},  // SYSTEM: アナログ回路 power up
      {0x0E, 0x02},  // SYSTEM: PGA/ADCモジュレータ有効
      {0x12, 0x00},  // SYSTEM: DAC power up
      {0x13, 0x10},  // SYSTEM: HPドライブ出力有効
      {0x14, 0x10},  // ADC: Mic1p-1n選択, PGA最小 (歪み防止。感度不足なら+6dB刻みで上げる)
      {0x17, 0xFF},  // ADC: デジタル音量最大 (M5Unified実証値)
      {0x1C, 0x6A},  // ADC: EQバイパス + DCオフセット除去
      {0x32, 0xBF},  // DAC: 音量 0dB
      {0x37, 0x08},  // DAC: EQバイパス
    };
    for (auto& rv : seq) {
      if (!M5.In_I2C.writeRegister8(ES8311_ADDR, rv[0], rv[1], 400000)) return false;
    }
    return true;
  }

  // スピーカーアンプ (AW8737) - M5PM1 GPIO3 で制御
  void ampOn() {
    M5.In_I2C.bitOn(M5PM1_ADDR, PM1_REG_GPIO_DIR, PM1_SPK_BIT, 400000);
    M5.In_I2C.bitOn(M5PM1_ADDR, PM1_REG_GPIO_OUT, PM1_SPK_BIT, 400000);
    delay(20);
  }
  void ampOff() {
    M5.In_I2C.bitOff(M5PM1_ADDR, PM1_REG_GPIO_OUT, PM1_SPK_BIT, 400000);
  }

  // モノラル160サンプル読み取り (20msブロッキング = RTP送信ペースメーカー)
  size_t readFrame(int16_t* mono) {
    int16_t st[RTP_SAMPLES * 2];
    size_t got = 0;
    i2s_read(I2S_NUM_0, st, sizeof(st), &got, portMAX_DELAY);
    size_t n = got / 4;
    for (size_t i = 0; i < n; i++) mono[i] = st[i * 2];  // L ch
    return n;
  }

  // モノラル→ステレオ複製して再生
  void writeFrame(const int16_t* mono, size_t n) {
    int16_t st[RTP_SAMPLES * 2];
    if (n > RTP_SAMPLES) n = RTP_SAMPLES;
    for (size_t i = 0; i < n; i++) { st[i * 2] = mono[i]; st[i * 2 + 1] = mono[i]; }
    size_t w = 0;
    i2s_write(I2S_NUM_0, st, n * 4, &w, pdMS_TO_TICKS(60));
  }

  void flush() { i2s_zero_dma_buffer(I2S_NUM_0); }

  // 通知ビープ (アンプON前提)
  void beep(int freqHz = 1400, int ms = 120, float vol = 0.35f) {
    const int total = AUDIO_RATE * ms / 1000;
    int16_t buf[RTP_SAMPLES];
    int done = 0;
    while (done < total) {
      int n = min((int)RTP_SAMPLES, total - done);
      for (int i = 0; i < n; i++) {
        float t = (float)(done + i) / AUDIO_RATE;
        // 立上り/立下りフェードでクリック防止
        float env = min(1.0f, min((done + i) / 80.0f, (total - done - i) / 80.0f));
        buf[i] = (int16_t)(sinf(2 * PI * freqHz * t) * 32767 * vol * env);
      }
      writeFrame(buf, n);
      done += n;
    }
  }
};
