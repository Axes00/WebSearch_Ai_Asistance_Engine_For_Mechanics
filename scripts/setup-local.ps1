param(
  [string] $ArchiveRoot = "",
  [string] $ArchiveSourceType = "local",
  [switch] $SkipInstall,
  [switch] $SkipMigrate,
  [switch] $SkipIndex,
  [switch] $SkipAiIndex,
  [switch] $SkipArchiveVerify,
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

function Find-ArchiveRoot {
  param([string] $RequestedPath)

  if ($RequestedPath -and (Test-Path -LiteralPath $RequestedPath)) {
    return (Resolve-Path -LiteralPath $RequestedPath).Path
  }

  $parent = Split-Path -Parent $ProjectRoot
  $candidates = @(
    (Join-Path $ProjectRoot "TechnicalLibrary"),
    (Join-Path $ProjectRoot "MecahnicaArchive"),
    (Join-Path $ProjectRoot "MechanicaArchive"),
    (Join-Path $parent "TechnicalLibrary"),
    (Join-Path $parent "MecahnicaArchive"),
    (Join-Path $parent "MechanicaArchive")
  )

  foreach ($drive in Get-PSDrive -PSProvider FileSystem) {
    $candidates += (Join-Path $drive.Root "TechnicalLibrary")
    $candidates += (Join-Path $drive.Root "MecahnicaArchive")
    $candidates += (Join-Path $drive.Root "MechanicaArchive")
    $candidates += (Join-Path $drive.Root "My Drive\MecahnicaArchive")
    $candidates += (Join-Path $drive.Root "My Drive\MechanicaArchive")
    $candidates += (Join-Path $drive.Root "Other computers\USB and External Devices\EMTEC B250\1.1Θ  ΤΕΧΝΙΚΟΣ  Η-Μ   ΟΔΗΓΟΣ ................................. Κ400 - 2022")
  }

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
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
$requestedArchiveRoot = $ArchiveRoot
$resolvedArchiveRoot = Find-ArchiveRoot -RequestedPath $ArchiveRoot

if (-not $resolvedArchiveRoot) {
  Write-Host ""
  Write-Host "Archive folder was not found:" -ForegroundColor Yellow
  Write-Host "  $requestedArchiveRoot" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Create or copy the archive there first. Accepted easy names:" -ForegroundColor Yellow
  Write-Host "  G:\Other computers\USB and External Devices\EMTEC B250\1.1Θ  ΤΕΧΝΙΚΟΣ  Η-Μ   ΟΔΗΓΟΣ ................................. Κ400 - 2022" -ForegroundColor Yellow
  Write-Host "  D:\TechnicalLibrary" -ForegroundColor Yellow
  Write-Host "  TechnicalLibrary next to this project folder" -ForegroundColor Yellow
  Write-Host "  MecahnicaArchive next to this project folder" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Junction example:" -ForegroundColor Yellow
  Write-Host '  cmd /c mklink /J "D:\TechnicalLibrary" "E:\1.1...archive folder..."' -ForegroundColor Yellow
  Write-Host ""
  throw "Missing archive folder."
}

$ArchiveRoot = $resolvedArchiveRoot
if (-not $requestedArchiveRoot -or $ArchiveRoot -ne $requestedArchiveRoot) {
  Write-Note "Auto-detected archive path: $ArchiveRoot"
}

$topLevelCount = (Get-ChildItem -LiteralPath $ArchiveRoot -Force -ErrorAction Stop | Measure-Object).Count
Write-Note "Archive path exists with $topLevelCount top-level item(s)."

Write-Step "Writing local environment files"
$preservedEnvLines = @()
if (Test-Path -LiteralPath $EnvLocalPath) {
  $preservedNames = @(
    "ACCESS_SESSION_SECRET",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD_HASH"
  )
  foreach ($name in $preservedNames) {
    $line = Get-Content -LiteralPath $EnvLocalPath | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if ($line) {
      $preservedEnvLines += $line
    }
  }
}

$envLocal = @"
ARCHIVE_ROOT="$ArchiveRoot"
ARCHIVE_SOURCE_TYPE=$ArchiveSourceType
DATABASE_URL="file:./dev.db"
DEFAULT_LOCALE=el
"@
if ($preservedEnvLines.Count -gt 0) {
  $envLocal += "`r`n" + ($preservedEnvLines -join "`r`n")
}

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

if (-not $SkipArchiveVerify) {
  $blueprintPath = Join-Path $ProjectRoot "archive-blueprint-usb.json"
  if (Test-Path -LiteralPath $blueprintPath) {
    Write-Step "Verifying archive structure"
    npm run archive:verify -- --blueprint archive-blueprint-usb.json --source "$ArchiveRoot"
  } else {
    Write-Note "archive-blueprint-usb.json was not found; skipping archive verification."
  }
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

  $adminShortcutPath = Join-Path $desktop "Mechanica Admin.lnk"
  $adminLauncherPath = Join-Path $ProjectRoot "scripts\open-mechanica-admin.ps1"
  $adminShortcut = $shell.CreateShortcut($adminShortcutPath)
  $adminShortcut.TargetPath = "powershell.exe"
  $adminShortcut.Arguments = "-ExecutionPolicy Bypass -File `"$adminLauncherPath`""
  $adminShortcut.WorkingDirectory = $ProjectRoot
  if (Test-Path -LiteralPath $iconPath) {
    $adminShortcut.IconLocation = $iconPath
  }
  $adminShortcut.Save()

  Write-Note "Created $adminShortcutPath"
}

Write-Step "Setup complete"
Write-Host "Open Mechanica from the desktop shortcut, or run: npm run dev" -ForegroundColor Green

if ($StartDevServer) {
  Write-Step "Starting Mechanica"
  & (Join-Path $ProjectRoot "scripts\open-mechanica.ps1")
}
