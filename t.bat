@echo off
setlocal EnableDelayedExpansion
title Corsair RGB Controller
color 0B

cls
echo.
echo  ============================================
echo   CORSAIR RGB CONTROLLER
echo  ============================================
echo.

echo  [1/5] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found.
    start https://nodejs.org/en/download
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo  [OK] Node.js %%v
echo.

echo  [2/5] Looking for iCUE...
set "ICUE_EXE="

if exist "%ProgramFiles%\Corsair\Corsair iCUE5 Software\iCUE.exe" (
    set "ICUE_EXE=%ProgramFiles%\Corsair\Corsair iCUE5 Software\iCUE.exe"
    goto :found_icue
)
if exist "%ProgramFiles%\Corsair\CORSAIR iCUE 5 Software\iCUE.exe" (
    set "ICUE_EXE=%ProgramFiles%\Corsair\CORSAIR iCUE 5 Software\iCUE.exe"
    goto :found_icue
)
if exist "%ProgramFiles%\Corsair\CORSAIR iCUE 4 Software\iCUE.exe" (
    set "ICUE_EXE=%ProgramFiles%\Corsair\CORSAIR iCUE 4 Software\iCUE.exe"
    goto :found_icue
)
if exist "%ProgramFiles(x86)%\Corsair\CORSAIR iCUE Software\iCUE.exe" (
    set "ICUE_EXE=%ProgramFiles(x86)%\Corsair\CORSAIR iCUE Software\iCUE.exe"
    goto :found_icue
)

echo  [WARN] iCUE not found. Trying winget...
where winget >nul 2>&1
if %errorlevel% neq 0 goto :open_download
winget install --id Corsair.iCUE.5 --accept-package-agreements --accept-source-agreements
if %errorlevel% neq 0 goto :open_download
echo  [OK] iCUE installed.
if exist "%ProgramFiles%\Corsair\Corsair iCUE5 Software\iCUE.exe" (
    set "ICUE_EXE=%ProgramFiles%\Corsair\Corsair iCUE5 Software\iCUE.exe"
)
goto :check_process

:open_download
echo  [INFO] Opening Corsair downloads page...
start https://www.corsair.com/us/en/s/downloads
echo  Install iCUE then re-run this script.
pause
exit /b 0

:found_icue
echo  [OK] iCUE found at:
echo       %ICUE_EXE%
echo.

:check_process
echo  [3/5] Checking iCUE is running...
tasklist /FI "IMAGENAME eq iCUE.exe" 2>nul | find /I "iCUE.exe" >nul
if %errorlevel%==0 (
    echo  [OK] iCUE is already running.
    goto :sdk_note
)
if "%ICUE_EXE%"=="" (
    echo  [WARN] Cannot find iCUE.exe - start iCUE manually.
    goto :sdk_note
)
echo  [INFO] Starting iCUE...
start "" "%ICUE_EXE%"
timeout /t 5 /nobreak >nul
tasklist /FI "IMAGENAME eq iCUE.exe" 2>nul | find /I "iCUE.exe" >nul
if %errorlevel%==0 (
    echo  [OK] iCUE is running.
) else (
    echo  [WARN] iCUE may still be loading, continuing...
)

:sdk_note
echo.
echo  [4/5] SDK check...
echo.
echo  ============================================
echo   IMPORTANT (one-time):
echo   iCUE - Settings - SDK - Enable iCUE SDK
echo  ============================================
echo.
timeout /t 3 /nobreak >nul

echo  [5/5] Starting server...

:: Kill any previous instance on port 3000
echo  [INFO] Clearing port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

if not exist "node_modules\" (
    echo  [INFO] Running npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"
echo.
echo  [OK] Server starting at http://localhost:3000
echo  Press Ctrl+C to stop.
echo.
node server.js

echo.
echo  Server stopped.
pause