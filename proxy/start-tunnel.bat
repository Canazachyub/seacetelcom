@echo off
REM Levanta el proxy OCDS local + cloudflared quick tunnel en 2 ventanas.
REM Deja ambas ventanas abiertas mientras uses la app.

cd /d "%~dp0.."

echo ===============================================
echo   SEACE OCDS - Iniciando proxy y tunnel
echo ===============================================
echo.

REM Ventana 1: proxy local Node.js
start "SEACE Proxy" cmd /k node proxy/server.cjs

REM Esperar 2 segundos para que el proxy arranque
timeout /t 2 /nobreak > nul

REM Ventana 2: cloudflared tunnel
set CLOUDFLARED="%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
start "SEACE Tunnel" cmd /k %CLOUDFLARED% tunnel --url http://localhost:3101 --no-autoupdate

echo.
echo Se abrieron 2 ventanas:
echo   1) SEACE Proxy (Node.js en puerto 3101)
echo   2) SEACE Tunnel (cloudflared)
echo.
echo La URL publica del tunnel aparece en la ventana "SEACE Tunnel".
echo Busca la linea con "trycloudflare.com" (tarda unos 5 segundos).
echo.
echo Cierra esas ventanas para detener el proxy.
echo.
pause
