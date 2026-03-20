# AETHER STUDIO — One-command installer (Node.js agent)
# Run in PowerShell:
#   irm https://raw.githubusercontent.com/Santaslileper/aether-studio/main/install.ps1 | iex

$ErrorActionPreference = "Stop"
$AgentDir   = "$env:USERPROFILE\aether-studio"
$RepoZipUrl = "https://github.com/Santaslileper/aether-studio/archive/refs/heads/main.zip"
$TempZip    = "$env:TEMP\aether-studio.zip"

Write-Host ""
Write-Host "  AETHER STUDIO // INSTALLER" -ForegroundColor Yellow
Write-Host "  ===========================" -ForegroundColor Yellow
Write-Host ""

# ── 1. Check Node.js ───────────────────────────────────────────────────────────
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Cyan
try {
    $nodeVer = node --version 2>&1
    if ($nodeVer -match "v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -lt 18) { throw "Node $nodeVer found but v18+ required." }
        Write-Host "      Found: $nodeVer" -ForegroundColor Green
    } else { throw "Not found" }
} catch {
    Write-Host "      Node.js 18+ not found. Opening download page..." -ForegroundColor Red
    Start-Process "https://nodejs.org/en/download"
    Write-Host "      Install Node.js, then re-run this script." -ForegroundColor Red
    exit 1
}

# ── 2. Download repo ───────────────────────────────────────────────────────────
Write-Host "[2/5] Downloading Aether Studio..." -ForegroundColor Cyan
if (Test-Path $AgentDir) {
    Write-Host "      Existing install found — updating." -ForegroundColor Yellow
} else {
    New-Item -ItemType Directory -Path $AgentDir | Out-Null
}
Invoke-WebRequest -Uri $RepoZipUrl -OutFile $TempZip -UseBasicParsing
Expand-Archive -Path $TempZip -DestinationPath "$env:TEMP\aether-extract" -Force
$ExtractedDir = Get-ChildItem "$env:TEMP\aether-extract" | Select-Object -First 1
Copy-Item "$($ExtractedDir.FullName)\*" $AgentDir -Recurse -Force
Remove-Item $TempZip
Remove-Item "$env:TEMP\aether-extract" -Recurse -ErrorAction SilentlyContinue
Write-Host "      Downloaded to $AgentDir" -ForegroundColor Green

# ── 3. npm install ─────────────────────────────────────────────────────────────
Write-Host "[3/5] Installing Node dependencies..." -ForegroundColor Cyan
Set-Location $AgentDir
npm install --omit=dev --quiet
Write-Host "      Dependencies installed." -ForegroundColor Green

# ── 4. Install Playwright Chromium ────────────────────────────────────────────
Write-Host "[4/5] Installing Playwright Chromium (~150MB, for MIDI harvesting)..." -ForegroundColor Cyan
npx playwright install chromium 2>&1 | Out-Null
Write-Host "      Chromium ready." -ForegroundColor Green

# ── 5. Create startup script + desktop shortcut ────────────────────────────────
Write-Host "[5/5] Creating desktop shortcut..." -ForegroundColor Cyan

$StartScript = "$AgentDir\start-aether.ps1"
@"
Set-Location "$AgentDir"
Write-Host "Starting Aether Studio..." -ForegroundColor Yellow
Write-Host "Piano : http://localhost:3000/" -ForegroundColor Cyan
Write-Host "Vault : http://localhost:3000/vault/" -ForegroundColor Cyan
Write-Host ""
Start-Process "http://localhost:3000/"
node server.js
"@ | Set-Content $StartScript

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut  = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Aether Studio.lnk")
$Shortcut.TargetPath       = "powershell.exe"
$Shortcut.Arguments        = "-ExecutionPolicy Bypass -File `"$StartScript`""
$Shortcut.WorkingDirectory = $AgentDir
$Shortcut.Description      = "Start Aether Studio local agent"
$Shortcut.Save()

# ── 6. Register aether:// URL protocol ────────────────────────────────────────
try {
    $ProtocolPath = "HKCU:\Software\Classes\aether"
    if (!(Test-Path $ProtocolPath)) { New-Item $ProtocolPath -Force | Out-Null }
    Set-ItemProperty $ProtocolPath "(default)" "URL:Aether Protocol"
    Set-ItemProperty $ProtocolPath "URL Protocol" ""
    $CmdPath = "$ProtocolPath\shell\open\command"
    if (!(Test-Path $CmdPath)) { New-Item $CmdPath -Recursive -Force | Out-Null }
    Set-ItemProperty $CmdPath "(default)" "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
    Write-Host "      Protocol registered: aether://" -ForegroundColor Green
} catch {
    Write-Host "      Warning: Could not register aether:// protocol." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  INSTALLATION COMPLETE" -ForegroundColor Green
Write-Host "  ─────────────────────────────────────────────────" -ForegroundColor Green
Write-Host "  Agent folder : $AgentDir" -ForegroundColor White
Write-Host "  Desktop icon : Aether Studio (double-click to start)" -ForegroundColor White
Write-Host "  Hosted UI    : https://Santaslileper.github.io/aether-studio/" -ForegroundColor White
Write-Host "  Local UI     : http://localhost:3000/  (when agent running)" -ForegroundColor White
Write-Host ""
Write-Host "  Starting agent now..." -ForegroundColor Yellow
Write-Host ""

Start-Process "http://localhost:3000/"
node server.js
