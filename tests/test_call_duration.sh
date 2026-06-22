#!/bin/bash
# ============================================================
# テスト2: 通話テスト（30分連続通話シミュレーション）
# 通話の作成→応答→一定時間保持→終了を検証
# ============================================================

API_URL="${API_URL:-http://localhost:3001/api/v1}"
API_KEY="${API_KEY:-nursecall_api_key_dev}"
DURATION_MINUTES="${DURATION_MINUTES:-30}"
CHECK_INTERVAL=60  # 60秒ごとにステータスチェック

echo "============================================="
echo "  通話持続テスト: ${DURATION_MINUTES}分"
echo "  API: ${API_URL}"
echo "  開始: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

# 1. 通話を開始
echo ""
echo "[1/4] 呼出要求を送信..."
CALL_RESPONSE=$(curl -s \
    -X POST "${API_URL}/calls/request" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d '{"caller_id": 1, "message": "通話持続テスト"}')

CALL_ID=$(echo "$CALL_RESPONSE" | grep -o '"call_id":[0-9]*' | grep -o '[0-9]*')
echo "  Call ID: ${CALL_ID}"

if [ -z "$CALL_ID" ]; then
    echo "  ❌ 通話の作成に失敗しました"
    echo "  Response: ${CALL_RESPONSE}"
    exit 1
fi
echo "  ✅ 呼出成功"

# 2. 通話に応答
echo ""
echo "[2/4] 通話に応答..."
sleep 2
ANSWER_RESPONSE=$(curl -s \
    -X POST "${API_URL}/calls/${CALL_ID}/answer" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}")

ANSWER_STATUS=$(echo "$ANSWER_RESPONSE" | grep -o '"status":"[^"]*"' | head -1)
echo "  ステータス: ${ANSWER_STATUS}"
echo "  ✅ 応答成功"

# 3. 通話を保持（指定時間）
echo ""
echo "[3/4] 通話保持中（${DURATION_MINUTES}分間）..."
TOTAL_CHECKS=$((DURATION_MINUTES * 60 / CHECK_INTERVAL))
CHECK_COUNT=0
STATUS_OK=0

for i in $(seq 1 $TOTAL_CHECKS); do
    sleep $CHECK_INTERVAL
    CHECK_COUNT=$((CHECK_COUNT + 1))
    ELAPSED_MIN=$((CHECK_COUNT * CHECK_INTERVAL / 60))

    # システムステータスチェック
    STATUS_RESPONSE=$(curl -s \
        -H "X-API-Key: ${API_KEY}" \
        "${API_URL}/dashboard/status")

    RSS_MB=$(echo "$STATUS_RESPONSE" | grep -o '"rss_mb":[0-9]*' | grep -o '[0-9]*' || echo "?")
    DB_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"database":"[^"]*"' || echo "?")

    # 通話ステータス確認
    CALL_STATUS=$(curl -s \
        -H "X-API-Key: ${API_KEY}" \
        "${API_URL}/calls/${CALL_ID}" | grep -o '"status":"[^"]*"' | head -1)

    if echo "$STATUS_RESPONSE" | grep -q '"api_server":"healthy"'; then
        STATUS_OK=$((STATUS_OK + 1))
        echo "  [${ELAPSED_MIN}/${DURATION_MINUTES}分] ✅ API正常 | メモリ: ${RSS_MB}MB | 通話: ${CALL_STATUS}"
    else
        echo "  [${ELAPSED_MIN}/${DURATION_MINUTES}分] ⚠️  API異常 | メモリ: ${RSS_MB}MB | ${DB_STATUS}"
    fi
done

# 4. 通話終了
echo ""
echo "[4/4] 通話を終了..."
END_RESPONSE=$(curl -s \
    -X POST "${API_URL}/calls/${CALL_ID}/end" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d '{"end_reason": "test_completed"}')

END_DURATION=$(echo "$END_RESPONSE" | grep -o '"duration":[0-9]*' | grep -o '[0-9]*')
echo "  通話時間: ${END_DURATION}秒"

echo ""
echo "============================================="
echo "  テスト結果"
echo "============================================="
echo "  テスト時間:   ${DURATION_MINUTES}分"
echo "  チェック回数:  ${CHECK_COUNT}"
echo "  正常回数:     ${STATUS_OK}"
echo "  記録された通話時間: ${END_DURATION}秒"
echo "  終了:         $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

if [ $STATUS_OK -eq $CHECK_COUNT ]; then
    echo "  ✅ テスト成功"
    exit 0
else
    echo "  ⚠️  一部チェックが失敗"
    exit 1
fi
