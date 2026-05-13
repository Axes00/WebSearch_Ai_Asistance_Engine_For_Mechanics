$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Url = "http://localhost:3000/el"

function Test-LocalPort {
  param([int] $Port)

  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(300)
    if ($connected) {
      $client.EndConnect($async)
    }
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

if (-not (Test-LocalPort -Port 3000)) {
  $quotedRoot = $ProjectRoot.Replace("'", "''")
  $command = "Set-Location -LiteralPath '$quotedRoot'; npm run dev"
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $command) `
    -WindowStyle Minimized

  for ($i = 0; $i -lt 60; $i++) {
    if (Test-LocalPort -Port 3000) {
      break
    }
    Start-Sleep -Seconds 1
  }
}

Start-Process $Url
