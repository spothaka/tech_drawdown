# Daily refresh playbook (local agent)

Run this prompt in a **local** agent on this machine at ~9am. Do not use a cloud agent: holdings files (`data/IRA.xlsx`, `data/Brokerage.xlsx`) are private, gitignored, and must stay on disk.

Both **FMP** (`financial-modeling-prep`) and **Bigdata** (`bigdata-search`) MCP servers are pre-registered in `.bob/mcp.json` as remote HTTP servers.
- **Bigdata** connects automatically (`https://mcp.bigdata.com/`).
- **FMP requires the local HTTP server to be running first** — start it with `.\scripts\start-fmp-mcp.ps1` before opening the agent. Without it, FMP tool calls will fail with "server not connected".

Correct tool names: `getQuote`/`getBatchQuotes`/`getAnalystEstimates`/`getIncomeStatement`/`getDCFValuation` (FMP); `find_securities`/`bigdata_company_tearsheet`/`bigdata_etf_tearsheet`/`bigdata_sentiment_tearsheet` (Bigdata).

Scratch goes in `scripts/tmp/` (gitignored). Never blank a prior good value. Preserve-on-failure at every rung. This is rules-based analytics, not financial advice.

## Steps

1. **Hydration gate.** Confirm `data/IRA.xlsx` and `data/Brokerage.xlsx` are real files (not OneDrive placeholders). If unreadable, skip the import and keep prior `ira` / `brokerage` in DATA; flag `IMPORT SKIPPED` in the report.

2. **Workbook integrity.** The universe workbook `data/tech100_drawdown_SP_NAS.xlsx` must be a well-formed zip with all six sheets. If not, **abort** and keep the last-good HTML.

3. **FMP universe fetch.** Collect unique universe tickers (normalize `.` → `-`). Call the FMP `quote` / batch-quote tool in chunks of ≤450. On failure write `[]` (safety valve). Save `scripts/tmp/fmp_universe.json`.

4. **Build universe.**  
   `python scripts/build_market_data.py scripts/tmp/fmp_universe.json ALL --write --emit-data scripts/tmp/universe_data.json`  
   Chain: FMP → STOCKHISTORY tail (guard-validated) → carry-forward. If the build errors or empties, fall back to the prior `data/market_data.xlsx` / last DATA universe arrays.

5. **Holdings.** Re-import IRA/Brokerage (gated). Reprice off-index names via the Bigdata tearsheet (resolve → quote). Keep last-known price on fetch failure — never blank.

6. **Growth-core.** `node scripts/recompute_core.js` — preserve prior `coreRank` on failure.

7. **Derived feeds** (each preserve-on-failure): `build_index_history.py`, `build_macro_history.py`, `build_history.py`, `build_alerts.py`, `build_dividends.py`, `build_dcf.py` (cap ~6 new symbols), look-through (`build_lookthrough.py`, cap ~4 new funds / weekly refresh), `build_earnings.py`, `refresh_dcf_prices.py`, `node scripts/dcf_monitor.js`. Call FMP `analyst` / `statements` and Bigdata tearsheets **sequentially** in small batches (quota + throttle).

8. **Integrity guard** on the final DATA (`integrity_guard.py`). Carry `data/splits.json` badges.

9. **Assemble and inject.** `python scripts/assemble_dashboard.py --write`. Golden-master must MATCH. Inject the **full** 19-key DATA (start from the freshest deployed `const DATA`, fold in changed keys). Write **both** `scripts/dashboard.html` and `dashboard/tech_drawdown_dashboard.html` byte-identically. Validate: `</html>` terminator, two `</script>`, node parse. There is no republish API.

10. **Report.** Use `python scripts/log_util.py` (`start` / `event` / `finalize`). Include UNIVERSE SOURCE (FMP / STOCKHISTORY-tail / carry-forward), import skips, alerts, DCF/look-through coverage, and any preserve-on-failure skips.

Do not move or rename the pipeline scripts listed above — this playbook hardcodes those paths.
