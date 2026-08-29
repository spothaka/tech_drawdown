# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## What this is
A self-updating market-drawdown dashboard + private portfolio tracker + retirement planner +
equity-valuation workbench, delivered as **one self-contained HTML page**
(`dashboard/tech_drawdown_dashboard.html`) and refreshed by the local daily playbook
(`scripts/daily_refresh.md`). **Current baseline: v1.0.**
Everything is *rules-based analytics — not financial advice*; keep that framing in any output.

## Test commands
```bash
bash tests/run_all.sh                              # full suite (all 4 runners)

# Individual runners:
python scripts/assemble_dashboard.py               # Step 1: golden-master byte check
node tests/ranking/golden_master.js                # Step 2a: ranking parity
node tests/ranking/golden_master_fund.js           # Step 2b
node tests/ranking/golden_master_sector.js         # Step 2c
node --test tests/dash/test_features.js            # Step 3: single dash test (node built-in runner)
python -m pytest tests/scripts/test_log_util.py   # Step 4: single pytest test
```
`pytest` uses `testpaths = ["tests/scripts"]` and `pythonpath = ["scripts"]` (pyproject.toml).
`node --test` is the Node built-in runner used for all `tests/dash/test_*.js` files.
Ranking tests (`tests/ranking/*.js`) use plain `console.assert` / manual fail counters, not `node --test`.

## Build pipeline (the only correct way to ship a change)
1. Edit source modules in `src/dash/*.js` (never `scripts/dashboard_tpl.html` or the deployed monolith).
2. If the ranking engine or rulesets changed: `node scripts/sync_engine.js` (regenerates `src/dash/76_ranking_engine.js`).
3. If glossary changed: `python scripts/build_glossary.py` (regenerates `src/dash/12_glossary_data.js`).
4. `python scripts/assemble_dashboard.py --write` — rebuilds `scripts/dashboard_tpl.html` from `src/dash/` MANIFEST.
5. Inject full 20-key DATA and write **both** `scripts/dashboard.html` **and** `dashboard/tech_drawdown_dashboard.html` byte-identically.
6. Validate: `</html>` terminator, exactly two `</script>`, no `__DATA__` placeholder. Then `bash tests/run_all.sh`.

**There is no republish API.** Writing both HTML copies is the deploy step.

## Architecture invariants (do NOT violate)
- Edit `src/dash/*.js` modules — **never** the assembled `scripts/dashboard_tpl.html` directly.
- `src/dash/76_ranking_engine.js` is **generated** by `node scripts/sync_engine.js` from `src/ranking/`; edits inside it will be overwritten.
- `src/dash/12_glossary_data.js` is **generated** by `python scripts/build_glossary.py` from `data/glossary/`; same warning.
- `DATA` must carry exactly **20 keys**: `sp`, `nasdaq`, `dow`, `etfs`, `thematic`, `mutualfunds`, `ira`, `brokerage`, `coreRank`, `splits`, `indexHistory`, `macroHistory`, `history`, `alerts`, `dividends`, `dcf`, `lookthrough`, `earnings`, `dcfMonitor`, `corp_actions`. The integration test enforces this.
- MANIFEST order in `assemble_dashboard.py` is the JS load order — helpers must be declared before the load-time IIFEs that call them. `12_glossary_data.js` must precede `10_helpers.js`. `49_montecarlo.js` and `52_lookthrough.js` must precede `60_portfolio.js`.
- Use `function` declarations (hoisted) for anything called during panel build — `const`/`let` arrow functions will not be visible to earlier load-time IIFEs.
- The deployed file is one inline `<script>` block with no ES modules (`import`/`export`). All shared state is `var`/`function` on `globalThis`.

## Key non-obvious patterns
- `scripts/rebuild_all.py` is a **scratch** shortcut (reads the workbook, calls `assemble_dashboard.py`, injects DATA). The daily pipeline (`scripts/daily_refresh.md`) is the canonical multi-step sequence.
- All Python scripts auto-detect project root via `TDD_BASE` env or `os.path.dirname(os.path.dirname(__file__))`. Override with `TDD_BASE=/path/to/root` if running from a non-standard location.
- `scripts/tmp/` is gitignored scratch. Never leave intermediates loose in `scripts/`.
- `data/` holds private inputs (xlsx, json) — gitignored and never committed.
- Preserve-on-failure is mandatory: never blank a prior good value in DATA on a step error.
- `src/ranking/engine.js` uses a UMD wrapper so it runs both in Node (tests, `recompute_core.js`) and as an inline browser script (via `sync_engine.js`).
- Dashboard tests (`tests/dash/`) use `tests/dash/_dom.js` which stubs the DOM, `Chart.js`, and `localStorage` via Node `vm`. `loadModule(name)` evals a `src/dash/*.js` file into `globalThis`; `extractFn(module, fnName)` pulls a single function without triggering load-time IIFEs.
- `tests/dash/test_integration.js` reads `dashboard/tech_drawdown_dashboard.html` (the *deployed* file), so it will fail if DATA has not been injected — the template alone is not enough.

## Working rules
- **Ask before multi-step work.** For anything beyond a quick answer, confirm scope/format first, and keep a task list for any job with ≥3 steps. Include a **verification step** as the last task.
- **Verify, don't claim.** "Done" means the change is assembled, both HTML copies are written, and `bash tests/run_all.sh` is green.
- **Never expose internal agent paths** to the user. Refer to the selected folder by name.
- **Scratch goes in `scripts/tmp/`** (gitignored). Never leave intermediates loose in `scripts/`.
- `scripts/docgen/` — document generators (`make_diagrams.py`, `build_architecture_docx.js`, etc.) are **not** part of the daily pipeline; run manually after a feature ships.
- `TASKS.md` is maintained by the user — mirror its framing into generated docs; don't overwrite it.

## MCP servers and environment variables

Both MCP servers are registered in `.bob/mcp.json` as **remote HTTP servers** (not stdio/npx):

| Server | Transport | Endpoint | Auth |
|---|---|---|---|
| `financial-modeling-prep` | HTTP (`url`) | `http://localhost:8080/mcp` | `FMP_ACCESS_TOKEN` env var at server startup |
| `bigdata-search` | HTTP (`url`) | `https://mcp.bigdata.com/` | `x-api-key` header (hardcoded in `mcp.json`) |

**FMP requires a running local process.** The `financial-modeling-prep-mcp-server` npm package is an HTTP server (not stdio). Start it before opening Bob:
```powershell
.\scripts\start-fmp-mcp.ps1   # reads FMP_ACCESS_TOKEN from .env, binds :8080
```
Or register as a Windows logon task (see the script header). The server does **not** auto-start.

**Bigdata connects automatically** — it is a fully-managed remote server at `mcp.bigdata.com`.

**Correct tool names** (use these exactly in `alwaysAllow` and tool calls):
- `financial-modeling-prep` — `getQuote`, `getBatchQuotes`, `getAnalystEstimates`, `getIncomeStatement`, `getDCFValuation`, `getHistoricalDividends`, `getHistoricalPriceChart`, `getQuoteShort`, `getCommodityQuotes`, `getForexPairs`, `getEconomicCalendar`
- `bigdata-search` — `find_securities`, `bigdata_company_tearsheet`, `bigdata_etf_tearsheet`, `bigdata_sentiment_tearsheet`

Required env vars (set in `.env`):
- `FMP_ACCESS_TOKEN` — Financial Modeling Prep API key; read by `start-fmp-mcp.ps1` at server launch
- `BIGDATA_API_KEY` — Bigdata API key; stored directly in `.bob/mcp.json` headers (also keep in `.env` as backup)
- `TDD_BASE` — project root override (set automatically by `scripts/run_daily.ps1`; only needed if running scripts from a non-standard location)
