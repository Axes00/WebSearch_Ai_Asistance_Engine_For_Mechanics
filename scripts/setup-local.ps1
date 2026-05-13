param(
  [string] $ArchiveRoot = "D:\TechnicalLibrary",
  [string] $ArchiveSourceType = "local",
  [switch] $SkipInstall,
  [switch] $SkipMigrate,
  [switch] $SkipIndex,
  [switch] $SkipAiIndex,
  [switch] $SkipShortcut,
  [switch] $StartDevServer
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvLocalPath = Join-Path $ProjectRoot ".env.local"
$EnvPath = Join-Path $ProjectRoot ".env"

function Write-Step {
  param([string] $Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Note {
  param([string] $Message)
  Write-Host "    $Message" -ForegroundColor DarkGray
}

function Require-Command {
  param(
    [string] $Name,
    [string] $InstallHint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. $InstallHint"
  }
}

Set-Location -LiteralPath $ProjectRoot

Write-Step "Checking local tools"
Require-Command "node" "Install Node.js 20.x or 22.x LTS, then run this setup again."
Require-Command "npm" "Install Node.js 20.x or 22.x LTS, then run this setup again."

$nodeVersion = (& node -v).Trim()
$npmVersion = (& npm -v).Trim()
Write-Note "Node: $nodeVersion"
Write-Note "npm:  $npmVersion"

Write-Step "Checking archive folder"
if (-not (Test-Path -LiteralPath $ArchiveRoot)) {
  Write-Host ""
  Write-Host "Archive folder was not found:" -ForegroundColor Yellow
  Write-Host "  $ArchiveRoot" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Create or copy the archive there first. Example:" -ForegroundColor Yellow
  Write-Host '  cmd /c mklink /J "D:\TechnicalLibrary" "E:\1.1...archive folder..."' -ForegroundColor Yellow
  Write-Host ""
  throw "Missing archive folder."
}

$topLevelCount = (Get-ChildItem -LiteralPath $ArchiveRoot -Force -ErrorAction Stop | Measure-Object).Count
Write-Note "Archive path exists with $topLevelCount top-level item(s)."

Write-Step "Writing local environment files"
$envLocal = @"
ARCHIVE_ROOT="$ArchiveRoot"
ARCHIVE_SOURCE_TYPE=$ArchiveSourceType
DATABASE_URL="file:./dev.db"
DEFAULT_LOCALE=el
"@

$envPrisma = @"
DATABASE_URL="file:./dev.db"
"@

Set-Content -LiteralPath $EnvLocalPath -Value $envLocal -Encoding UTF8
Set-Content -LiteralPath $EnvPath -Value $envPrisma -Encoding UTF8
Write-Note "Wrote .env.local"
Write-Note "Wrote .env"

if (-not $SkipInstall) {
  Write-Step "Installing npm packages"
  npm install
}

if (-not $SkipMigrate) {
  Write-Step "Applying database migrations"
  npx prisma migrate deploy
}

if (-not $SkipIndex) {
  Write-Step "Indexing archive metadata"
  npm run index
}

if (-not $SkipAiIndex) {
  Write-Step "Building AI search index"
  npm run index:ai
}

if (-not $SkipShortcut) {
  Write-Step "Creating desktop shortcut"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcutPath = Join-Path $desktop "Mechanica.lnk"
  $launcherPath = Join-Path $ProjectRoot "scripts\open-mechanica.ps1"
  $iconPath = Join-Path $ProjectRoot "public\mechanica.ico"

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$launcherPath`""
  $shortcut.WorkingDirectory = $ProjectRoot
  if (Test-Path -LiteralPath $iconPath) {
    $shortcut.IconLocation = $iconPath
  }
  $shortcut.Save()

  Write-Note "Created $shortcutPath"
}

Write-Step "Setup complete"
Write-Host "Open Mechanica from the desktop shortcut, or run: npm run dev" -ForegroundColor Green

if ($StartDevServer) {
  Write-Step "Starting Mechanica"
  & (Join-Path $ProjectRoot "scripts\open-mechanica.ps1")
}
