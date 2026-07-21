#!/usr/bin/env bash
# ============================================================
#  ナースコールシステム - デモ用公開URL発行スクリプト (macOS/Linux)
#  使い方:  ./scripts/start-demo-tunnel.sh
# ============================================================
set -e
cd "$(dirname "$0")/.."

echo "[1/3] Docker サービスを起動しています..."
docker compose up -d

echo "[2/3] Cloudflare トンネルを起動しています..."
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile quick up -d tunnel-quick

echo "[3/3] 公開URLを取得しています（最大30秒）..."
URL=""
for i in $(seq 1 15); do
  sleep 2
  URL=$(docker logs nursecall-tunnel-quick 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true)
  [ -n "$URL" ] && break
done

echo
echo "============================================================"
if [ -n "$URL" ]; then
  echo "  公開URL: $URL"
  echo
  echo "  デモ相手に送るURL:"
  echo "    利用者画面:   $URL/"
  echo "    職員画面:     $URL/staff/"
  echo "    管理センター: $URL/admin/"
else
  echo "  URLの自動取得に失敗しました。以下で確認してください:"
  echo "    docker logs nursecall-tunnel-quick 2>&1 | grep trycloudflare"
fi
echo "============================================================"
echo
echo "  停止: docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile quick rm -sf tunnel-quick"
