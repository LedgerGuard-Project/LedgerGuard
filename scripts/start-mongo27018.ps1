# Starts LedgerGuard's dedicated single-node MongoDB replica set on port 27018.
#
# WHY 27018: Phase 2 ACID transactions require a replica set. The Windows
# MongoDB *service* on 27017 runs as a STANDALONE and is shared with other
# projects (fleetdash, fleetpulse), so LedgerGuard uses its own replica set
# instance instead. Do NOT point MONGO_URI at 27017 - payments/ledger writes
# would fail with TRANSACTIONS_UNSUPPORTED.
#
# diagnosticDataCollectionEnabled=false mitigates a recurring native crash in
# mongod 8.3.4 on this machine (tcmalloc sampler exception inside FTDC).
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\start-mongo27018.ps1

$ErrorActionPreference = 'Stop'

$repo   = Split-Path -Parent $PSScriptRoot
$bin    = 'C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe'
$dbpath = Join-Path $repo '.mongo\db27018'
$log    = Join-Path $repo '.mongo\mongod27018.log'

if (-not (Test-Path $bin)) { throw "mongod.exe not found at $bin" }

# Already listening?
$client = New-Object Net.Sockets.TcpClient
try {
    if ($client.ConnectAsync('127.0.0.1', 27018).Wait(800)) {
        Write-Host 'MongoDB is already listening on 127.0.0.1:27018 - nothing to do.'
        exit 0
    }
} finally { $client.Dispose() }

Start-Process -FilePath $bin -ArgumentList @(
    '--bind_ip', '127.0.0.1',
    '--port', '27018',
    '--replSet', 'rs0',
    '--dbpath', $dbpath,
    '--logpath', $log,
    '--setParameter', 'diagnosticDataCollectionEnabled=false'
) -WindowStyle Hidden

# Wait until the port accepts connections (max ~30s).
$deadline = (Get-Date).AddSeconds(30)
do {
    Start-Sleep -Milliseconds 500
    $probe = New-Object Net.Sockets.TcpClient
    try { $up = $probe.ConnectAsync('127.0.0.1', 27018).Wait(500) } finally { $probe.Dispose() }
} while (-not $up -and (Get-Date) -lt $deadline)

if ($up) {
    Write-Host 'MongoDB replica set rs0 is UP on 127.0.0.1:27018.'
    exit 0
} else {
    Write-Host "MongoDB failed to start within 30s. Check log: $log"
    exit 1
}
