@echo off
REM Kipina Basket - esittelytila. Tuplaklikkaa tata tiedostoa Windowsissa.
cd /d "%~dp0"
title Kipina Basket - esittelytila
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js puuttuu tasta koneesta.
  echo Asenna LTS-versio sivulta, joka aukeaa nyt selaimeen, ja tuplaklikkaa tata tiedostoa uudelleen.
  start "" https://nodejs.org
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Asennetaan tarvittavat osat. Tama tehdaan vain ensimmaisella kerralla ja kestaa noin minuutin...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo.
    echo Asennus epaonnistui. Tarkista internetyhteys ja yrita uudelleen.
    pause
    exit /b 1
  )
)
call npm run demo
echo.
pause
