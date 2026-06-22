#!/bin/bash
# ============================================================
# テスト1: 通知テスト（100回連続通知）
# 成功率を計測する
# ============================================================

API_URL="${API_URL:-http://localhost:3001/api/v1}"
API_KEY="${API_KEY:-nursecall_api_key_dev}"
TOTAL=100
SUCCESS=0
FAIL=0
ERRORS=()

echo "============================================="
echo "  通知テスト: ${TOTAL}回連続送信"
echo "  API: ${API_URL}"
echo "  開始: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

for i in $(seq 1 $TOTAL); do
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST "${API_URL}/calls/request" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
        -d "{\"caller_id\": 1, \"message\": \"テスト呼出 #${i}\"}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "201" ]; then
        SUCCESS=$((SUCCESS + 1))
    else
        FAIL=$((FAIL + 1))
        ERRORS+=("${i}: HTTP ${HTTP_CODE}")
    fi

    # 進捗表示（10回ごと）
    if [ $((i % 10)) -eq 0 ]; then
        echo "  進捗: ${i}/${TOTAL} (成功: ${SUCCESS}, 失敗: ${FAIL})"
    fi

    # 100ms 間隔
    sleep 0.1
done

echo ""
echo "============================================="
echo "  テスト結果"
echo "============================================="
echo "  合計:     ${TOTAL}"
echo "  成功:     ${SUCCESS}"
echo "  失敗:     ${FAIL}"
echo "  成功率:   $(echo "scale=1; ${SUCCESS} * 100 / ${TOTAL}" | bc)%"
echo "  終了:     $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "  エラー詳細:"
    for err in "${ERRORS[@]}"; do
        echo "    - ${err}"
    done
fi

# 終了コード: 成功率95%未満なら失敗
if [ $SUCCESS -lt 95 ]; then
    echo ""
    echo "  ⚠️  成功率が95%未満です"
    exit 1
else
    echo ""
    echo "  ✅ テスト成功"
    exit 0
fi
