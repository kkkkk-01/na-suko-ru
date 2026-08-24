// BLEビーコンスキャン + 最寄り判定 (仕様書§3: 移動平均3 + ヒステリシス+6dB)
// iBeacon Major/Minor → "BCN-xxx" マッピング (サーバーbeaconsテーブルと一致)
#pragma once
#include <NimBLEDevice.h>
#include "config.h"

struct BeaconObs { String id; int rssi; };

class BeaconScanner {
public:
  String currentBeaconId = "";   // 現在地 ("" = 不明)
  int currentRssi = -127;

  void begin(const String& facilityUuid) {
    _uuid = facilityUuid;
    _uuid.toLowerCase();
    NimBLEDevice::init("");
    _scan = NimBLEDevice::getScan();
    _scan->setActiveScan(false);   // パッシブ
    _scan->setInterval(160);       // 100ms
    _scan->setWindow(80);          // 50ms
  }

  // 3秒間ブロッキングスキャン → 最寄り判定を更新 (15秒ごとに呼ぶ)
  void scanOnce() {
    NimBLEScanResults results = _scan->start(BLE_SCAN_DURATION_SEC, false);
    // このスキャンでの各ビーコン最強RSSI
    struct Entry { String id; int rssi; };
    Entry found[16]; int nFound = 0;
    for (int i = 0; i < results.getCount(); i++) {
      NimBLEAdvertisedDevice d = results.getDevice(i);
      String id; int rssi = d.getRSSI();
      if (rssi < BLE_RSSI_FLOOR) continue;
      if (!parseIBeacon(d, id)) continue;
      bool merged = false;
      for (int k = 0; k < nFound; k++) {
        if (found[k].id == id) { if (rssi > found[k].rssi) found[k].rssi = rssi; merged = true; break; }
      }
      if (!merged && nFound < 16) { found[nFound].id = id; found[nFound].rssi = rssi; nFound++; }
    }
    _scan->clearResults();

    // 移動平均バッファ更新 (直近 BLE_AVG_WINDOW スキャン)
    for (int k = 0; k < nFound; k++) pushHistory(found[k].id, found[k].rssi);
    ageHistory();

    // 平均最大のビーコン
    String bestId = ""; float bestAvg = -999;
    for (int i = 0; i < _nHist; i++) {
      float avg = historyAvg(i);
      if (avg > bestAvg) { bestAvg = avg; bestId = _hist[i].id; }
    }
    if (bestId == "") return;  // 何も見えない → 現在地維持

    // ヒステリシス: 現在地と異なる場合は +6dB 以上強い時のみ変更
    if (currentBeaconId == "" || bestId == currentBeaconId) {
      currentBeaconId = bestId;
      currentRssi = (int)bestAvg;
    } else {
      float curAvg = -999;
      for (int i = 0; i < _nHist; i++)
        if (_hist[i].id == currentBeaconId) { curAvg = historyAvg(i); break; }
      if (curAvg < -900 || bestAvg >= curAvg + BLE_HYSTERESIS_DB) {
        currentBeaconId = bestId;
        currentRssi = (int)bestAvg;
      } else {
        currentRssi = (int)curAvg;
      }
    }
  }

private:
  NimBLEScan* _scan = nullptr;
  String _uuid;

  struct Hist { String id; int rssi[BLE_AVG_WINDOW]; int n; int missed; };
  Hist _hist[16]; int _nHist = 0;

  void pushHistory(const String& id, int rssi) {
    for (int i = 0; i < _nHist; i++) {
      if (_hist[i].id == id) {
        if (_hist[i].n < BLE_AVG_WINDOW) _hist[i].rssi[_hist[i].n++] = rssi;
        else {
          for (int k = 1; k < BLE_AVG_WINDOW; k++) _hist[i].rssi[k - 1] = _hist[i].rssi[k];
          _hist[i].rssi[BLE_AVG_WINDOW - 1] = rssi;
        }
        _hist[i].missed = 0;
        return;
      }
    }
    if (_nHist < 16) {
      _hist[_nHist].id = id;
      _hist[_nHist].rssi[0] = rssi;
      _hist[_nHist].n = 1;
      _hist[_nHist].missed = 0;
      _nHist++;
    }
  }

  // 3スキャン連続で見えないビーコンは履歴から除去
  void ageHistory() {
    for (int i = 0; i < _nHist;) {
      _hist[i].missed++;
      if (_hist[i].missed > BLE_AVG_WINDOW + 1) {
        for (int k = i + 1; k < _nHist; k++) _hist[k - 1] = _hist[k];
        _nHist--;
      } else i++;
    }
  }

  float historyAvg(int i) {
    if (_hist[i].n == 0) return -999;
    int sum = 0;
    for (int k = 0; k < _hist[i].n; k++) sum += _hist[i].rssi[k];
    return (float)sum / _hist[i].n;
  }

  // iBeacon (Apple 0x004C, type 0x02, len 0x15) 解析。施設UUID一致のみ採用
  bool parseIBeacon(NimBLEAdvertisedDevice& d, String& outId) {
    if (!d.haveManufacturerData()) return false;
    std::string md = d.getManufacturerData(uint8_t(0));
    if (md.length() < 25) return false;
    const uint8_t* p = (const uint8_t*)md.data();
    if (p[0] != 0x4C || p[1] != 0x00 || p[2] != 0x02 || p[3] != 0x15) return false;
    // UUID照合
    char uuidStr[37];
    sprintf(uuidStr, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
            p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11],
            p[12], p[13], p[14], p[15], p[16], p[17], p[18], p[19]);
    if (_uuid.length() > 0 && _uuid != uuidStr) return false;
    uint16_t major = (p[20] << 8) | p[21];
    uint16_t minor = (p[22] << 8) | p[23];
    outId = mapToBeaconId(major, minor);
    return outId.length() > 0;
  }

  // Major/Minor → beacons.beacon_id 変換
  // 規約: Major=1(居室) → "BCN-<minor>" (例: minor=101 → BCN-101)
  //       Major=2(共用) → minor 1:TOILET 2:BATH 3:DINING 4:COMMON 5:ENT
  static String mapToBeaconId(uint16_t major, uint16_t minor) {
    if (major == 1) return "BCN-" + String(minor);
    if (major == 2) {
      switch (minor) {
        case 1: return "BCN-TOILET";
        case 2: return "BCN-BATH";
        case 3: return "BCN-DINING";
        case 4: return "BCN-COMMON";
        case 5: return "BCN-ENT";
      }
    }
    return "";
  }
};
