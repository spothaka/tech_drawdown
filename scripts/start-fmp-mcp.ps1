# start-fmp-mcp.ps1
# Starts the Financial Modeling Prep MCP server on localhost:8080.
# Run once per session before opening Bob, or register as a Windows startup task.
#
# Usage:
#   .\scripts\start-fmp-mcp.ps1
#
# To register as a Windows startup task (run once as admin):
#   $action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -File `"$PWD\scripts\start-fmp-mcp.ps1`""
#   $trigger = New-ScheduledTaskTrigger -AtLogon
#   Register-ScheduledTask -TaskName "FMP-MCP-Server" -Action $action -Trigger $trigger -RunLevel Highest

param(
    [int]$Port = 8080
)

# Kill any existing instance on the target port
$existing = (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
if ($existing) {
    Write-Host "Stopping existing process on port $Port (PID $existing)..."
    Stop-Process -Id $existing -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Load the API key from .env in the project root
$envFile = Join-Path $PSScriptRoot ".." ".env"
$fmpKey  = $null
if (Test-Path $envFile) {
    $fmpKey = (Get-Content $envFile | Select-String '^FMP_ACCESS_TOKEN=(.+)' | ForEach-Object { $_.Matches.Groups[1].Value }) | Select-Object -First 1
}
if (-not $fmpKey) {
    Write-Error "FMP_ACCESS_TOKEN not found in .env — cannot start FMP MCP server."
    exit 1
}

# Start the server as a detached background process
$logDir = Join-Path $PSScriptRoot ".." "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "fmp-mcp.log"

Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-WindowStyle", "Hidden", "-Command",
        "`$env:FMP_ACCESS_TOKEN='$fmpKey'; `$env:PORT='$Port'; npx financial-modeling-prep-mcp-server *>> '$logFile'" `
    -PassThru | ForEach-Object { Write-Host "FMP MCP server starting (PID $($_.Id)) on http://localhost:$Port/mcp" }

# Wait and verify
Start-Sleep -Seconds 5
try {
    $health = Invoke-RestMethod "http://localhost:$Port/healthcheck" -TimeoutSec 5
    Write-Host "Health check: $($health.status) — uptime $([math]::Round($health.uptime, 1))s"
} catch {
    Write-Warning "Health check failed — server may still be starting. Check logs\fmp-mcp.log"
}
