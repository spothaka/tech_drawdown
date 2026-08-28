# Project Architecture Rules (Non-Obvious Only)

## Critical constraints
- **Single-file delivery** — the entire dashboard (HTML + CSS + JS + data) must be one self-contained file. No runtime ES modules, no external fetches for core rendering, no CDN links for critical path. Chart.js is the one runtime external (loaded from a `<script>` tag in `00_head.html`).
- **Precompute-then-embed** — all analytics run server-side (Python/Node scripts) and the results are embedded as a JSON blob (`const DATA = {...}`) at deploy time. The browser never fetches or computes the universe data.
- **Assembly is concatenation only** — `assemble_dashboard.py` literally byte-concatenates the `src/dash/*.js` files in MANIFEST order. There is no bundler (no Webpack/Rollup/esbuild). Load order = file order = concatenation order.
- **DATA 19-key contract** — the integration test asserts all 19 keys are present. Adding a new data feed requires adding a new DATA key and updating the deploy step that injects DATA.
- **`src/dash/76_ranking_engine.js` is the inline copy** of `src/ranking/` — the two must stay in sync via `node scripts/sync_engine.js`. The ranking engine is therefore testable in Node independently of the dashboard.

## The two test boundaries
1. `tests/ranking/` — tests the **ranking engine in isolation** (pure JS, no DOM). These run with plain `node file.js`.
2. `tests/dash/` — tests **dashboard modules with a stubbed DOM** (`vm.runInThisContext` + `_dom.js`). `test_integration.js` tests the *assembled deployed file* end-to-end.
3. `tests/scripts/` — tests **Python build transforms** with pytest; `conftest.py` inserts `scripts/` into `sys.path` so modules import directly.

## Pipeline stages and their outputs
| Stage | Script | Output |
|---|---|---|
| Universe fetch | `build_market_data.py` | `data/market_data.xlsx` + `scripts/tmp/universe_data.json` |
| Growth-core ranking | `node scripts/recompute_core.js` | `coreRank` array (stdout → DATA) |
| Template assembly | `assemble_dashboard.py --write` | `scripts/dashboard_tpl.html` |
| DATA injection | inline Python in `rebuild_all.py` | `scripts/dashboard.html` + `dashboard/tech_drawdown_dashboard.html` |
| Logging | `log_util.py` | `logs/run_<ts>.jsonl`, `logs/latest_run.md` |

## Architectural coupling to be aware of
- `49_montecarlo.js` and `52_lookthrough.js` define functions (`mcMedian()`, `ltTopHidden()`) that feed KPI tiles in `60_portfolio.js` — they must load before `60_portfolio.js`.
- `48_alerts.js` and `47_dividends.js` depend on `ov`/`mTitle`/`mBody` global modal elements set up by `74_fundamentals.js` — they load after it.
- `scripts/pipeline scripts` (`build_*.py`, `recompute_core.js`, etc.) paths are **hardcoded in `scripts/daily_refresh.md`** — renaming or moving them breaks the daily agent playbook.
- `src/ranking/engine.js` must remain **stateless and dependency-free** — the caching layer in `src/ranking/store.js` is separate. The engine is used both in Node (tests + `recompute_core.js`) and inline in the browser.
