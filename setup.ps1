# IPL 2026 Win Predictor — Full Setup Script
# Runs all 5 setup steps automatically
# Run from PowerShell: .\setup.ps1

$ProjectRoot = "c:\Users\sandy\OneDrive\Desktop\Antigravety\ipl betting"
$APIDir = "$ProjectRoot\apps\api"
$MLDir  = "$ProjectRoot\services\ml"
$DataDir = "$ProjectRoot\data\cricsheet"

Write-Host "`n===========================================`n  IPL 2026 Win Predictor — Full Setup`n===========================================" -ForegroundColor Cyan

# ─── STEP 1: Download Cricsheet data ────────────────────────
Write-Host "`n[STEP 1/5] Downloading Cricsheet IPL data..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$ZipPath = "$DataDir\ipl_json.zip"

if ((Test-Path $ZipPath) -and (Get-Item $ZipPath).Length -gt 5MB) {
    Write-Host "  ✅ Already downloaded ($([Math]::Round((Get-Item $ZipPath).Length / 1MB, 1)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ⬇️  Downloading from cricsheet.org (this takes 1-2 min)..."
    try {
        Invoke-WebRequest -Uri "https://cricsheet.org/downloads/ipl_json.zip" `
            -OutFile $ZipPath -UseBasicParsing
        Write-Host "  ✅ Download complete ($([Math]::Round((Get-Item $ZipPath).Length / 1MB, 1)) MB)" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Download failed: $_" -ForegroundColor Red
    }
}

# Unzip
$JsonFiles = Get-ChildItem $DataDir -Filter "*.json" | Measure-Object
if ($JsonFiles.Count -lt 100 -and (Test-Path $ZipPath)) {
    Write-Host "  📦 Extracting JSON files..."
    Expand-Archive -Path $ZipPath -DestinationPath $DataDir -Force
    $count = (Get-ChildItem $DataDir -Filter "*.json").Count
    Write-Host "  ✅ Extracted $count match JSON files" -ForegroundColor Green
} else {
    Write-Host "  ✅ Already extracted: $($JsonFiles.Count) JSON files" -ForegroundColor Green
}

# ─── STEP 2: Install Node API dependencies ───────────────────
Write-Host "`n[STEP 2/5] Installing Node API dependencies..." -ForegroundColor Yellow
if (Test-Path "$APIDir\node_modules") {
    Write-Host "  ✅ node_modules already exists, skipping install" -ForegroundColor Green
} else {
    Write-Host "  📦 Running npm install in apps/api..."
    Push-Location $APIDir
    npm install
    Pop-Location
    Write-Host "  ✅ API npm install complete" -ForegroundColor Green
}

# ─── STEP 3: Start PostgreSQL via Docker ─────────────────────
Write-Host "`n[STEP 3/5] Starting PostgreSQL database..." -ForegroundColor Yellow
$dockerVersion = docker --version 2>$null
if ($dockerVersion) {
    Write-Host "  🐳 Docker found: $dockerVersion"
    Push-Location "$ProjectRoot\infra"
    docker-compose up -d db redis
    Start-Sleep -Seconds 5

    # Copy .env if not exists
    if (-not (Test-Path "$ProjectRoot\.env")) {
        Copy-Item "$ProjectRoot\.env.example" "$ProjectRoot\.env"
        Write-Host "  📄 Created .env from .env.example" -ForegroundColor Green
    }

    # Run DB migration
    Write-Host "  🗄️  Running database schema migration..."
    $env:PGPASSWORD = "ipl_pass_2026"
    $sqlFile = "$APIDir\src\db\migrations\001_initial_schema.sql"
    docker exec ipl_postgres psql -U ipl_user -d ipl_predictor -f /docker-entrypoint-initdb.d/001_initial_schema.sql 2>&1
    Write-Host "  ✅ Database ready" -ForegroundColor Green
    Pop-Location
} else {
    Write-Host "  ⚠️  Docker not found. PostgreSQL won't start." -ForegroundColor Yellow
    Write-Host "  → Install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host "  → Then re-run this script" -ForegroundColor Cyan
}

# ─── STEP 4: Check Python and install ML deps ────────────────
Write-Host "`n[STEP 4/5] Setting up Python ML service..." -ForegroundColor Yellow
$pyVersion = python --version 2>$null
if ($pyVersion) {
    Write-Host "  🐍 Python found: $pyVersion"
    Push-Location $MLDir
    Write-Host "  📦 Installing ML dependencies (fastapi, xgboost, sklearn, pandas)..."
    pip install -r requirements.txt -q
    Write-Host "  ✅ Python ML dependencies installed" -ForegroundColor Green
    Pop-Location
} else {
    Write-Host "  ⚠️  Python not found." -ForegroundColor Yellow
    Write-Host "  → Install Python 3.11+ from: https://www.python.org/downloads/" -ForegroundColor Cyan
}

# ─── STEP 5: Start the Node API in background ────────────────
Write-Host "`n[STEP 5/5] Starting Node API server..." -ForegroundColor Yellow
if (Test-Path "$APIDir\node_modules") {
    Write-Host "  🚀 Starting API server on http://localhost:3001 ..."
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", `
        "cd '$APIDir'; npm run dev" -WindowStyle Normal
    Start-Sleep -Seconds 3
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 5
        Write-Host "  ✅ API is live: $($response.Content)" -ForegroundColor Green
    } catch {
        Write-Host "  ⏳ API starting up — check the new terminal window" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  node_modules missing, API cannot start yet" -ForegroundColor Yellow
}

# ─── Summary ─────────────────────────────────────────────────
Write-Host "`n===========================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE — Summary" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
$jsonCount = (Get-ChildItem $DataDir -Filter "*.json" -ErrorAction SilentlyContinue).Count
Write-Host "  📂 Cricsheet JSON files: $jsonCount"
Write-Host "  🌐 React UI:   http://localhost:5173  (already running)"
Write-Host "  ⚙️  Node API:  http://localhost:3001"
Write-Host "  🤖 ML Service: http://localhost:8000  (start manually)"
Write-Host ""
Write-Host "  NEXT → Run the data importer:" -ForegroundColor Yellow
Write-Host "  cd 'apps\api'" -ForegroundColor White
Write-Host "  npx ts-node ..\scripts\import_cricsheet.ts ..\data\cricsheet" -ForegroundColor White
Write-Host ""
Write-Host "  THEN → Train the ML model:" -ForegroundColor Yellow
Write-Host "  cd 'services\ml'" -ForegroundColor White
Write-Host "  python -m src.training.train_pre_match" -ForegroundColor White
Write-Host "===========================================" -ForegroundColor Cyan
