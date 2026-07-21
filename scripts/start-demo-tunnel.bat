@echo off
rem ============================================================
rem  ナースコールシステム - デモ用公開URL発行スクリプト (Windows)
rem
rem  ダブルクリックするだけで:
rem   1. Docker一式を起動（未起動の場合）
rem   2. Cloudflareクイックトンネルを起動
rem   3. 公開URL (https://xxxx.trycloudflare.com) を表示
rem
rem  ※ クイックトンネルはアカウント不要ですがURLは毎回変わります。
rem     固定URLが必要な場合は docs/CLOUDFLARE_TUNNEL_SETUP.md 参照。
rem ============================================================
cd /d "%~dp0.."

echo [1/3] Docker サービスを起動しています...
docker compose up -d
if errorlevel 1 (
  echo Docker の起動に失敗しました。Docker Desktop が起動しているか確認してください。
  pause
  exit /b 1
)

echo [2/3] Cloudflare トンネルを起動しています...
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile quick up -d tunnel-quick

echo [3/3] 公開URLを取得しています（最大30秒）...
setlocal enabledelayedexpansion
set URL=
for /l %%i in (1,1,15) do (
  timeout /t 2 /nobreak >nul
  for /f "tokens=*" %%a in ('docker logs nursecall-tunnel-quick 2^>^&1 ^| findstr /r "https://.*\.trycloudflare\.com" ^| findstr /v "api\." ') do (
    for %%b in (%%a) do (
      echo %%b | findstr "trycloudflare.com" >nul && set URL=%%b
    )
  )
  if defined URL goto :found
)

:found
echo.
echo ============================================================
if defined URL (
  echo   公開URL: !URL!
  echo.
  echo   デモ相手に送るURL:
  echo     利用者画面:   !URL!/
  echo     職員画面:     !URL!/staff/
  echo     管理センター: !URL!/admin/
) else (
  echo   URLの自動取得に失敗しました。以下のコマンドで確認してください:
  echo     docker logs nursecall-tunnel-quick 2^>^&1 ^| findstr trycloudflare
)
echo ============================================================
echo.
echo  停止する場合: scripts\stop-demo-tunnel.bat を実行
echo.
pause
