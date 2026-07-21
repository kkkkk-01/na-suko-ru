@echo off
rem デモ用トンネルのみ停止（システム本体は稼働継続）
cd /d "%~dp0.."
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile quick stop tunnel-quick
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile quick rm -f tunnel-quick
echo デモ用公開URLを停止しました。（施設内LANでの利用は継続できます）
pause
