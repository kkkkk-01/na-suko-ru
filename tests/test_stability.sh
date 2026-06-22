#!/bin/bash
# ============================================================
# テスト3: 安定性テスト（24時間連続稼働 / メモリリーク確認）
# 一定間隔でヘルスチェック + メモリ計測を実行
# ============================================================

API_URL="${API_URL:-http://localhost:3001/api/v1}"
API_KEY="${API_KEY:-nursecall_api_key_dev}"
DURATION_HOURS="${DURATION_HOURS:-24}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-60}"
LOG_FILE="stability_test_$(date '+%Y%m%d_%H%M%S').log"

TOTAL_CHECKS=0
HEALTH_OK=0
HEALTH_FAIL=0
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION_HOURS * 3600))

echo "=============================================" | tee "$LOG_FILE"
echo "  安定性テスト: ${DURATION_HOURS}時間連続稼働" | tee -a "$LOG_FILE"
echo "  チェック間隔: ${INTERVAL_SECONDS}秒" | tee -a "$LOG_FILE"
echo "  API: ${API_URL}" | tee -a "$LOG_FILE"
echo "  開始: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "  ログ: ${LOG_FILE}" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"

while [ $(date +%s) -lt $END_TIME ]; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # ヘルスチェック
    HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" \
        "${API_URL}/health" 2>/dev/null)
    HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)

    # システムステータス取得（メモリ情報含む）
    STATUS_RESPONSE=$(curl -s \
        -H "X-API-Key: ${API_KEY}" \
        "${API_URL}/dashboard/status" 2>/dev/null)

    # メモリ使用量をパース
    RSS_MB=$(echo "$STATUS_RESPONSE" | grep -o '"rss_mb":[0-9]*' | grep -o '[0-9]*' || echo "0")
    HEAP_USED=$(echo "$STATUS_RESPONSE" | grep -o '"heap_used_mb":[0-9]*' | grep -o '[0-9]*' || echo "0")
    HEAP_TOTAL=$(echo "$STATUS_RESPONSE" | grep -o '"heap_total_mb":[0-9]*' | grep -o '[0-9]*' || echo "0")
    UPTIME=$(echo "$STATUS_RESPONSE" | grep -o '"uptime_seconds":[0-9]*' | grep -o '[0-9]*' || echo "0")

    if [ "$HEALTH_CODE" = "200" ]; then
        HEALTH_OK=$((HEALTH_OK + 1))
        STATUS_STR="OK"
    else
        HEALTH_FAIL=$((HEALTH_FAIL + 1))
        STATUS_STR="FAIL(${HEALTH_CODE})"
    fi

    # ログ出力
    ELAPSED_HOURS=$(echo "scale=1; ($(date +%s) - $START_TIME) / 3600" | bc)
    LOG_LINE="${TIMESTAMP} | ${STATUS_STR} | RSS:${RSS_MB}MB | Heap:${HEAP_USED}/${HEAP_TOTAL}MB | Uptime:${UPTIME}s | Elapsed:${ELAPSED_HOURS}h | Checks:${TOTAL_CHECKS}(OK:${HEALTH_OK},FAIL:${HEALTH_FAIL})"
    echo "$LOG_LINE" | tee -a "$LOG_FILE"

    # 通知テスト（10回ごとに1回実行）
    if [ $((TOTAL_CHECKS % 10)) -eq 0 ]; then
        CALL_RESPONSE=$(curl -s -w "\n%{http_code}" \
            -X POST "${API_URL}/calls/request" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: ${API_KEY}" \
            -d '{"caller_id": 1, "message": "安定性テスト呼出"}')
        CALL_CODE=$(echo "$CALL_RESPONSE" | tail -1)
        echo "  -> 通知テスト: HTTP ${CALL_CODE}" | tee -a "$LOG_FILE"
    fi

    # メモリリーク検出（RSS 512MB超過で警告）
    if [ "${RSS_MB}" -gt 512 ] 2>/dev/null; then
        echo "  ⚠️  メモリ警告: RSS ${RSS_MB}MB (>512MB)" | tee -a "$LOG_FILE"
    fi

    sleep $INTERVAL_SECONDS
done

echo "" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"
echo "  テスト完了" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"
echo "  期間:       ${DURATION_HOURS}時間" | tee -a "$LOG_FILE"
echo "  チェック数:  ${TOTAL_CHECKS}" | tee -a "$LOG_FILE"
echo "  正常:       ${HEALTH_OK}" | tee -a "$LOG_FILE"
echo "  異常:       ${HEALTH_FAIL}" | tee -a "$LOG_FILE"
echo "  可用率:     $(echo "scale=1; ${HEALTH_OK} * 100 / ${TOTAL_CHECKS}" | bc)%" | tee -a "$LOG_FILE"
echo "  終了:       $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "=============================================" | tee -a "$LOG_FILE"
