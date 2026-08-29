# start-fmp-mcp.ps1
# Starts the Financial Modeling Prep MCP server on localhost:8080.
# Run once per session before opening Bob, or register as a Windows startup task.
#
# Usage:
#   .\scripts\start-fmp-mcp.ps1
#
# FMP_ACCESS_TOKEN is loaded from scripts\set-fmp-token.cmd (gitignored).
# Regenerate that file via: .\scripts\start-fmp-mcp.ps1 (it reads .env automatically).

param(
    [int]$Port = 8080
)

# --- Fix C: load FMP_ACCESS_TOKEN from .env into the current session ---
$root    = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env"
$fmpKey  = $null
if (Test-Path $envFile) {
    $fmpKey = (Get-Content $envFile |
        Select-String '^FMP_ACCESS_TOKEN=(.+)' |
        ForEach-Object { $_.Matches.Groups[1].Value }) |
        Select-Object -First 1
}
if (-not $fmpKey) {
    Write-Error "FMP_ACCESS_TOKEN not found in .env - cannot start FMP MCP server."
    exit 1
}
$env:FMP_ACCESS_TOKEN = $fmpKey

# --- Also write/refresh scripts\set-fmp-token.cmd (gitignored convenience helper) ---
$cmdFile = Join-Path $PSScriptRoot "set-fmp-token.cmd"
[System.IO.File]::WriteAllText($cmdFile, "@echo off`r`nset FMP_ACCESS_TOKEN=$fmpKey`r`n",
    [System.Text.Encoding]::ASCII)

# --- Kill any existing process on the target port (Fix A: use $existingPid, not $pid) ---
# Use netstat for reliable IPv4+IPv6 cross-family detection
$rawPids = (netstat -ano 2>$null | Select-String ":$Port\s") |
    ForEach-Object { ($_ -split '\s+')[-1] } |
    Where-Object  { $_ -match '^\d+$' } |
    Select-Object -Unique
if ($rawPids) {
    Write-Host "Stopping existing process(es) on port $Port (PIDs: $($rawPids -join ', '))..."
    foreach ($existingPid in $rawPids) {
        Stop-Process -Id ([int]$existingPid) -Force -ErrorAction SilentlyContinue
    }
    # Poll until port is actually free (up to 10 s)
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (-not (netstat -ano 2>$null | Select-String ":$Port\s")) { break }
    }
}

# --- Resolve node and npx-cli.js ---
$nodeBin = (Get-Command node -ErrorAction Stop).Source
$nodeDir = Split-Path $nodeBin -Parent
$npxCli  = Join-Path $nodeDir "node_modules\npm\bin\npx-cli.js"
if (-not (Test-Path $npxCli)) {
    $npxCli = Join-Path (Split-Path $nodeDir -Parent) "node_modules\npm\bin\npx-cli.js"
}
if (-not (Test-Path $npxCli)) {
    Write-Error "Cannot locate npx-cli.js relative to node.exe ($nodeBin)"
    exit 1
}
Write-Host "node   : $nodeBin"
Write-Host "npxCli : $npxCli"

# --- Prepare log file (single merged stdout+stderr, append mode) ---
$logDir  = Join-Path $root "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = (New-Item -ItemType File -Path (Join-Path $logDir "fmp-mcp.log") -Force).FullName

# --- Fix B: build ProcessStartInfo with the FULL current environment seeded first,
#     then overlay FMP_ACCESS_TOKEN and PORT so node inherits PATH and all other vars ---
$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName               = $nodeBin
$psi.Arguments              = "`"$npxCli`" financial-modeling-prep-mcp-server"
$psi.UseShellExecute        = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.CreateNoWindow         = $true

# Seed with full current environment FIRST so PATH and all system vars are present
foreach ($entry in [System.Environment]::GetEnvironmentVariables().GetEnumerator()) {
    $psi.Environment[$entry.Key] = $entry.Value
}
# Then overlay the two server-specific variables
$psi.Environment["FMP_ACCESS_TOKEN"] = $fmpKey
$psi.Environment["PORT"]             = "$Port"

$proc = [System.Diagnostics.Process]::new()
$proc.StartInfo = $psi

# Pipe stdout and stderr into the single merged log file
$logStream            = [System.IO.StreamWriter]::new($logFile, $true, [System.Text.Encoding]::UTF8)
$logStream.AutoFlush  = $true
$proc.add_OutputDataReceived({ param($s,$e); if ($null -ne $e.Data) { $logStream.WriteLine($e.Data) } })
$proc.add_ErrorDataReceived({  param($s,$e); if ($null -ne $e.Data) { $logStream.WriteLine($e.Data) } })

$proc.Start()               | Out-Null
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

Write-Host "FMP MCP server starting (PID $($proc.Id)) on http://localhost:$Port/mcp"
Write-Host "Log : $logFile"

# --- Poll health endpoint (up to 20 s) ---
$deadline = (Get-Date).AddSeconds(20)
$healthy  = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    try {
        $health  = Invoke-RestMethod "http://localhost:$Port/healthcheck" -TimeoutSec 3
        $healthy = $true
        Write-Host "Health OK - status=$($health.status) uptime=$([math]::Round($health.uptime,1))s"
        break
    } catch { <# still starting #> }
}
if (-not $healthy) {
    Write-Warning "Health check did not respond within 20 s - check $logFile"
    exit 2
}

# --- Verify token is accepted (not dummy-server mode) ---
Start-Sleep -Milliseconds 500
$logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
if ($logContent -match 'access token is required') {
    Write-Error "Server started but FMP_ACCESS_TOKEN was not accepted (dummy-server mode). Check $logFile"
    exit 1
}

Write-Host "FMP MCP ready with valid token on http://localhost:$Port/mcp"
exit 0
