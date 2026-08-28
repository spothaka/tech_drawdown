# Optional Windows Task Scheduler wrapper.
# MCP fetches (FMP batch-quote, Bigdata tearsheets) must run in a local Bob agent
# following scripts/daily_refresh.md — they write JSON under scripts/tmp/.
#
# Example (once, as Administrator):
#   schtasks /Create /TN TechDrawdownDaily /TR "powershell -File C:\Users\pmoor\bob\tech_drawdown\scripts\run_daily.ps1" /SC DAILY /ST 09:00

$ErrorActionPreference = 'Stop'
$Scripts = $PSScriptRoot
$Root = Split-Path $Scripts -Parent
$Tmp = Join-Path $Scripts 'tmp'
$Fmp = Join-Path $Tmp 'fmp_universe.json'
$Playbook = Join-Path $Scripts 'daily_refresh.md'

function Test-Hydrated([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item $Path
    # OneDrive placeholder: tiny file with reparse / cloud attributes, or 0 bytes
    if ($item.Length -lt 64) { return $false }
    return $true
}

Set-Location $Root
$env:TDD_BASE = $Root

$ira = Join-Path $Root 'data\IRA.xlsx'
$brk = Join-Path $Root 'data\Brokerage.xlsx'
if (-not (Test-Hydrated $ira) -or -not (Test-Hydrated $brk)) {
    Write-Warning "Holdings file missing or looks like a OneDrive placeholder. Skip import; keep prior holdings."
}

if (-not (Test-Path $Fmp)) {
    Write-Host "No FMP snapshot at $Fmp."
    Write-Host "Open this repo in Bob and run the playbook:"
    Write-Host "  $Playbook"
    Write-Host "That agent run writes scripts/tmp JSON, then the Python/Node pipeline, then both HTML copies."
    exit 2
}

Write-Host "Found $Fmp — running script-only universe build."
python (Join-Path $Scripts 'build_market_data.py') $Fmp ALL --write --emit-data (Join-Path $Tmp 'universe_data.json')
if ($LASTEXITCODE -ne 0) {
    Write-Warning "build_market_data.py failed; keeping prior market_data.xlsx. Continue via daily_refresh.md in Bob."
    exit $LASTEXITCODE
}

Write-Host "Universe build wrote data/market_data.xlsx."
Write-Host "Finish remaining rungs (holdings, derived feeds, assemble, inject both HTML copies) in Bob:"
Write-Host "  $Playbook"
exit 0
