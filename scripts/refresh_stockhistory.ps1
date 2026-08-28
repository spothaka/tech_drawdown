# refresh_stockhistory.ps1
# Opens the drawdown workbook headless, forces STOCKHISTORY to repull live prices,
# recalculates, saves, and closes. Designed to be run by Windows Task Scheduler.

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$workbook = Join-Path $Root "data\tech100_drawdown_SP_NAS.xlsx"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AskToUpdateLinks = $false

try {
    $wb = $excel.Workbooks.Open($workbook, 0, $false)

    # Refresh any data connections, then force a full recalc so STOCKHISTORY refetches.
    try { $wb.RefreshAll() | Out-Null } catch {}
    $excel.CalculateFullRebuild()

    # STOCKHISTORY pulls over the web and can resolve asynchronously.
    # Wait until Excel reports calculation is fully done (xlDone = 0), max ~90s.
    $deadline = (Get-Date).AddSeconds(90)
    while ($excel.CalculationState -ne 0 -and (Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
    }
    Start-Sleep -Seconds 5  # small buffer for late-arriving web results

    $wb.Save()
    $wb.Close($true)
    Write-Host ("Refreshed and saved at {0}" -f (Get-Date))
}
finally {
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
