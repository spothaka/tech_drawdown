# IBM Hackathon - Tech Drawdown

A self-updating market-drawdown dashboard, private portfolio tracker, household retirement planner, and equity-valuation workbench — delivered as a single, shareable HTML page and kept current by a local daily refresh. **Baseline v1.0 (August 2026).**

## 🚀 Quick Start

1. **Use this template to create your project:**
   - Click "Use this template" button above and select "Create a new repository"
   - Name your repository
   - Click "Create repository"

2. **Clone your new repository:**

   ```bash
   git clone https://github.com/HACKATHON-ORG/your-repo-name.git
   cd your-repo-name
   ```

3. **Set up environment variables:**

   ```bash
   # Copy the example file
   cp .env.example .env

   # Edit .env with your actual credentials
   # Use your preferred editor (nano, vim, code, etc.)
   nano .env
   ```

4. **Verify .gitignore is working:**

   ```bash
   # This should NOT show .env file
   git status

   # This should confirm .env is ignored
   git check-ignore -v .env
   ```

5. **Start developing!**

## 🔒 Security Features

This template includes:

- **`.gitignore`** - Prevents committing credentials and live session files
- **`.bobignore`** - Prevents AI assistants from logging credentials
- **`.env.example`** - Template for your environment variables

## 📋 Before Every Commit

Always run this checklist:

- [ ] Reviewed `git diff` for sensitive data
- [ ] No hardcoded API keys or passwords
- [ ] `.env` file is NOT in staged changes
- [ ] No files with "credential" or "secret" in name
- [ ] Used environment variables for all credentials

## 🆘 Need Help?

- Read [SECURITY.md](SECURITY.MD) for detailed guidelines
- Contact hackathon support through mentor channel
- Ask in the hackathon Slack workspace

---

**Remember:** Security is everyone's responsibility. When in doubt, ask for help!

## Project structure

```
tech_drawdown/
├── README.md                     This file — overview & layout
├── AGENTS.md                     Project rules for AI agents — invariants, deploy pipeline, data-provider rules
├── TASKS.md                      Baseline v1.0 shipped scope + future backlog
├── .gitignore                    Ignores scratch (scripts/tmp/), logs, node_modules, caches, private data snapshots
├── src/                          Application/source code — src/ranking (rules engine) + src/dash (27 dashboard modules → assemble_dashboard.py)
├── tests/                        QA / test scripts (e.g. tests/ranking/golden_master.js)
├── dashboard/                    The deliverable
│   └── tech_drawdown_dashboard.html   Deployed dashboard (open locally; embeds private holdings)
├── data/                         Private source inputs + accumulated state (do not share)
│   ├── tech100_drawdown_SP_NAS.xlsx   Universe workbook — membership + static columns + STOCKHISTORY fallback (6 tabs)
│   ├── market_data.xlsx              Machine-written live-data workbook (FMP-sourced; regenerated each run)
│   ├── IRA.xlsx / Brokerage.xlsx     Flat holdings exports (Symbol, Quantity, Price Paid, Value)
│   ├── history.json                  Rolling household value {date,total,ira,brokerage} (benchmark + drawdown cards)
│   ├── alerts.json                   Held-name status/cross transitions (change alerts)
│   ├── dividend_schedule.json        ETF/fund registry — Tier-2 yield-based dividend estimates + the look-through target set
│   ├── dcf.json / dcf_wacc.json      Precomputed DCF bases (consensus + filed statements, EBIT-reconstructed) and beta/price/kd inputs
│   ├── dcf_anchor.json               External fair-value anchors (analyst target consensus) for calibration + drift monitor
│   ├── dcf_segments.json             Bigdata-sourced segment overrides (e.g. AMZN) merged into the base — sum-of-the-parts
│   ├── dcf_monitor.json              Daily DCF drift monitor artifact (model-vs-anchor gap, reconcilable, flag) → DATA.dcfMonitor
│   ├── earnings.json                 Per-ticker latest-earnings records (beat/miss, trend, forward) → DATA.earnings
│   ├── fund_holdings.json            Fund look-through map (top-50 per fund + residual/cash weights)
│   ├── splits.json                   Split / reverse-split facts → badges
│   └── glossary/                     Column glossary source (en.json) → src/dash/12_glossary_data.js
├── portfolio/                    Generated live-formula Excel views + guides
├── docs/                         Documentation
│   ├── Tech_Drawdown_Architecture.html / .docx   Technical deep-dive + diagrams
│   ├── Tech_Drawdown_BRD.html / .docx             Business Requirements Document
│   ├── Dashboard_Prompt_Playbook.docx             How the dashboard was built (internal)
│   ├── Dashboard_Prompt_Playbook_Public.docx      Shareable version
│   ├── Tech_Drawdown_Executive_Showcase.pptx      Executive deck (scripts/docgen/build_showcase_pptx.py)
│   ├── deck_assets/                                Deck icons
│   └── diagrams/                                   (regenerated by scripts/docgen/make_diagrams.py)
├── logs/                         Pipeline run logs (run_*.jsonl + latest_run.md + runs.jsonl; auto-pruned to 30 runs)
└── scripts/                      Build & automation helpers
    ├── dashboard_tpl.html        HTML template (assembled from src/dash/ by assemble_dashboard.py; holds `const DATA = __DATA__;`)
    ├── dash_data_live.json       19-key data snapshot (6 universe tabs + ira/brokerage/coreRank/splits/indexHistory/macroHistory/history/alerts/dividends/dcf/lookthrough/earnings/dcfMonitor)
    ├── assemble_dashboard.py     Concatenate src/dash/ modules → dashboard_tpl.html (byte-for-byte golden-master)
    ├── build_market_data.py      FMP-primary universe build (chain FMP→STOCKHISTORY tail rung→carry-forward) → data/market_data.xlsx + DATA
    ├── integrity_guard.py        Data-quality guard (52-wk band / ratio) — sanitizes corrupt/#N/A rows, tags dq (⚠ badge)
    ├── build_index_history.py    Pure transform: FMP light arrays → weekly 1-yr indexHistory (4 US indices)
    ├── build_macro_history.py    Pure transform: FMP commodity/forex/economics → macroHistory (oil/metals/USD-FX/sentiment)
    ├── build_history.py          Pure transform: appends {date,total,ira,brokerage} → data/history.json → DATA.history
    ├── build_alerts.py           Pure transform: prior-vs-today diff of held names → data/alerts.json + DATA.alerts (dq-guarded)
    ├── build_dividends.py        Pure transform: Tier-1 declared stock dividends + Tier-2 yield-based fund estimates → DATA.dividends
    ├── build_dcf.py              Pure transform: analyst consensus + filed statements → data/dcf.json → DATA.dcf (never FMP's DCF endpoint)
    ├── build_lookthrough.py      Pure transform: fund holdings → data/fund_holdings.json → DATA.lookthrough (top-50 + residual + cash)
    ├── build_earnings.py         Pure transform: latest-earnings tearsheet slice → data/earnings.json → DATA.earnings (memo badge + popup)
    ├── gen_earnings_memo.py      Render the long-form per-ticker earnings memo (Markdown/PDF) into reports/earnings/
    ├── dcf_monitor.js            Loop 5: re-runs the real DCF fns vs the anchors → data/dcf_monitor.json (drift gap + honesty flag)
    ├── refresh_dcf_prices.py     Pure transform: refresh DCF base prices + recompute capital weights from data/market_data.xlsx
    ├── build_glossary.py         data/glossary/en.json → src/dash/12_glossary_data.js
    ├── rebuild_all.py            Regenerate universe tabs + preserve app data + reassemble + redeploy
    ├── build_ira.py / build_brokerage.py   Build the live-formula portfolio workbooks
    ├── validate_all.py           Reconcile dashboard DATA vs the workbook
    ├── sync_engine.js            Regenerate the template's inline ranking engine from src/ranking (single source of truth)
    ├── recompute_core.js         Rebuild the growth-core coreRank via the growth_core engine (used by the daily refresh)
    ├── log_util.py               Pipeline run logging — leveled JSONL events → logs/ (RunLogger + CLI)
    ├── daily_refresh.md          Local agent playbook for the 9am pipeline (MCP fetch + transforms + inject)
    ├── run_daily.ps1             Optional Windows Task Scheduler wrapper (script-only rungs after tmp JSON exists)
    ├── refresh_stockhistory.ps1  Refresh Excel STOCKHISTORY columns
    ├── docgen/                   Manually-run document generators (not part of the daily pipeline):
    │   ├── make_diagrams.py           architecture/workflow diagrams → docs/diagrams/
    │   ├── build_architecture_docx.js / build_brd_docx.js   Architecture + BRD (Node) → docs/
    │   ├── make_playbooks.js          internal + public prompt playbooks (Node) → docs/
    │   └── build_showcase_pptx.py     executive deck → docs/Tech_Drawdown_Executive_Showcase.pptx
    └── tmp/                      Scratch / run intermediates (gitignored — the daily refresh writes here)

Note: the ranking engine is app code — it lives in `src/ranking/` (engine, registry, rulesets) with tests in `tests/ranking/`, per the project standard; `scripts/sync_engine.js` materializes it into the template.
```

## How it works (in brief)

1. **Sources** (`data/`) — the universe workbook (ticker membership, company, sector/category, and the manual snapshots: Analyst Consensus, Forward P/E, Dividend Yield) and the flat holdings exports. **Live market data (price, 52-wk high/low, 50/200-day SMA) comes from the FMP connector**, not the workbook.
2. **Build** (`scripts/`) — the daily refresh fetches FMP quotes for the universe and runs `build_market_data.py`, which applies the provider chain **FMP → STOCKHISTORY workbook tail rung (guard-validated) → carry-forward**, writes `data/market_data.xlsx`, and assembles the live+static universe. `integrity_guard.py` validates every row (52-week [low, high] band check when a low is present, a max/min ratio heuristic otherwise) and suppresses corrupt/#N/A values — tagging `dq`, surfaced as a ⚠ badge. Further **pure transforms** (history, alerts, dividends, DCF, look-through, index history, macro history, splits, glossary) fold their own JSON state into the same DATA object, which is injected into `dashboard_tpl.html` → `dashboard/tech_drawdown_dashboard.html`.
3. **Architecture invariant — precompute, then embed.** The published HTML **cannot call the FMP connector** (that call never settles — no error, no timeout), so every FMP-derived analytic is computed by the daily refresh and **embedded in `DATA`**. Live Bigdata (factsheet / fundamentals / live-price via `BDX`) only runs if a `window.liveMcp` shim is present; opening the file in a browser is otherwise snapshot-only. This is why each analytic ships as a *pure local transform* plus a *dumb renderer*.
4. **Runtime** — the dashboard renders its embedded snapshot. The **Overview** is a de-duplicated health spectrum (best / in-correction / worst-drawdown) with 1-year charts for the major US indices and a macro & commodities panel. The three rankings (sector company, fund/category, growth-core) run on a declarative **rules engine** (`src/ranking/`) you can customize live — weights, thresholds, IF/THEN conditions — with a per-row score-breakdown popover. Clicking any ticker opens a **factsheet** (plain-English summary, vitals grid, "Did you know?" fun fact) above the advisor scorecard, the **DCF fair-value strip** (which opens the full valuation popup — 3-stage model, reverse-solve, calibrate-to-anchor, probabilistic range, and a Trefis-style segment sum-of-the-parts tab), and the risk sections. A small **earnings memo badge** sits next to a ticker for 30 days after it reports. The **Retirement** tab carries the household KPI row, the benchmark and drawdown cards, and three clickable KPI tiles that open popups: **dividend income**, **Monte Carlo median @ yr N**, and **hidden exposure** (fund look-through).
5. **Automation** — follow `scripts/daily_refresh.md` in a local Bob agent (optional `scripts/run_daily.ps1` for Windows Task Scheduler). Both MCP servers are pre-registered in `.bob/mcp.json`: **Bigdata** connects automatically (remote HTTP at `mcp.bigdata.com`); **FMP** requires the local HTTP server to be running first — start it with `.\\scripts\\start-fmp-mcp.ps1`. The run fetches FMP, builds the universe (STOCKHISTORY fallback if FMP fails), re-imports holdings, reprices off-index names, recomputes growth-core (`recompute_core.js`, preserve-on-failure), refreshes index/macro history, appends portfolio history, diffs change alerts, builds the dividend calendar, extends the DCF set (~6 new symbols/run — the statement/estimate quota is finite), refreshes the external fair-value anchors, extends the fund look-through (~4 new funds/run, refreshed weekly), refreshes earnings memos for recently-reporting names, runs the **DCF drift monitor**, runs the integrity guard, regenerates, and writes both HTML copies — with a status report and **preserve-on-failure** at every rung. Nothing silently blanks.

See `docs/Tech_Drawdown_Architecture.*` for the full design and `docs/Tech_Drawdown_BRD.*` for business requirements.

## Analytics (Baseline v1.0)

| Feature | Where | How it stays honest |
|---|---|---|
| **Benchmark** — household vs Dow/Nasdaq/S&P, indexed to 100 | Retirement card | No fabricated back-cast (the trailing-return endpoint is plan-gated); the head-to-head accrues from switch-on |
| **Drawdown timeline** — underwater vs each series' own running peak | Retirement card | Normal / −10% / −20% bands shaded |
| **Change alerts** — bear, death-cross, new 52-wk low, recovery | Icon beside the ticker (portfolio tabs) | Pure daily diff; dq-guarded; no connector calls |
| **Dividend income calendar** — projected annual income, next 30 days | Retirement KPI tile | Every row marked *declared* (exact) or *estimated* (yield-based) |
| **Monte Carlo** — median household value @ yr N | Retirement KPI tile | Seeded RNG (reproducible); vol from Parkinson 52-wk H/L |
| **Earnings memo** — reported vs consensus beat/miss, EPS trend, forward read | Badge beside the ticker → popup | Badge auto-expires 30 days after the report (client-side); every figure traces to the embedded record |
| **DCF (3-stage)** — fair value + reverse DCF | Fundamentals strip → popup | Built from consensus + filed statements (never FMP's opinionated DCF endpoint); netDebt corrected; **corrupt consensus EBIT reconstructed** at ingest; every judgement input is a user control |
| **Normalized-margin lever** — editable long-run EBIT margin | DCF popup slider + reverse-solve | Fade glides toward it; defaults to consensus so default output is unchanged |
| **Reverse-solve** (Loop 1) — "what would you have to believe?" | DCF popup table | Bracketed monotone solver; returns *no solution* rather than a bogus root when the target is out of band |
| **Calibrate to anchor** (Loop 2) — reconcile to an external reference | DCF popup block | Tunes only within plausible bands; **flags** (never forces) when nothing reconciles |
| **Probabilistic DCF** (Loop 4) — P10/P50/P90 + P(undervalued) | DCF popup range bar | Seeded; shows the *width*, not a sharper centre |
| **Drift monitor** (Loop 5) — daily model-vs-anchor gap | `dcf_monitor.js` → popup flag + run report | Flags only when the gap exceeds tolerance AND no plausible lever reconciles |
| **Segment sum-of-the-parts** — Trefis-style, per-segment margins | DCF popup tab | Rejects (with an explanation) when segments don't reconcile to reported revenue within 2% |
| **Fund look-through** — true single-name exposure through funds | Retirement KPI tile | Reconciliation gate: named + remainder + cash + unmapped **must** equal the household total; while funds remain unmapped every % is a floor ("≥") |

> Note: the live external anchor is **analyst target consensus** (a 12-month price target), not an intrinsic fair value — there is no Morningstar connector. Paste Morningstar FVEs into `data/dcf_anchor.json` (`source: "Morningstar Fair Value"`) to calibrate against them instead.

## Data-provider constraints

- **FMP's `discountedCashFlow` endpoint is forbidden.** It is not data — it mean-reverts every projection ratio to a 5-year historical average, and its `netDebt` field ignores short-term investments. DCFs are built from `analyst → financial-estimates` plus the filed `statements`, computing `netDebt = totalDebt − cashAndShortTermInvestments`.
- **Plan-gated / unusable:** `quote-change` (per-symbol trailing returns), `^NDX`/`QQQ` index history (use `^IXIC`), per-symbol ETF dividend dates.
- **Finite daily quota + throttling:** `analyst` and `statements` — call sequentially in small batches; the daily refresh caps DCF at ~6 new symbols and look-through at ~4 new funds per run.
- **Feed defects to guard against:** overlapping segment lines that double-count revenue, and negative filed effective tax rates (clamped to 21%).
- **Consensus `ebitAvg` can be corrupt (understated below net income).** `build_dcf.py` detects it at the aggregate level (`sum(ebitAvg) < 0.85 × sum(netIncomeAvg)`) and reconstructs `EBIT = netIncome / (1 − tax)`, re-basing D&A to base-year intensity — flagged via `ebitRecon`. The gate is aggregate so a name with mild interest-income noise is not tripped. **No Morningstar connector exists** — the live valuation anchor is analyst *price targets*, not intrinsic fair value.

## Updating holdings

Edit the flat exports in `data/` (`IRA.xlsx`, `Brokerage.xlsx`) — keep columns Symbol, Quantity, Price Paid, Value. The next daily run re-imports them automatically and prices any new off-index names. If a source file isn't hydrated locally (OneDrive placeholder), the refresh safely skips the import and preserves prior holdings, flagging it in the run report.

## Debugging

Every daily run writes a structured log to `logs/` via `scripts/log_util.py`: a per-run `run_<timestamp>.jsonl` event stream, `latest_run.md` (the human report), and an append-only `runs.jsonl` history (auto-pruned to the last 30 runs). To review recent runs: `python scripts/log_util.py tail`. An **opt-in in-page debug panel** (`?debug=1` or **Shift+D**, off by default) shows connector calls (timed), data provenance, cache state, and errors — with a one-click **Copy report** button.

## Testing

Run the whole suite with `bash tests/run_all.sh`. It covers four layers:

- **Golden-master byte check** — the template assembled from `src/dash/` still equals the deployed template (`scripts/assemble_dashboard.py`).
- **Ranking engine parity** (`tests/ranking/`, Node) — the rules engine reproduces the original hand-written scoring exactly across 20k+ randomized cases.
- **Dashboard client modules + integration** (`tests/dash/`, Node's built-in `node --test`) — unit tests for Monte Carlo (determinism, percentile ordering, vol bounds), the fund look-through (the reconciliation gate, floor semantics, dupe detector), the DCF model (netDebt correction, WACC>tg guard, segment sum-of-the-parts reconciliation), and the dividend/alert popups; plus a **whole-artifact integration test** that evaluates the entire assembled `<script>` in a stubbed DOM and asserts no throw, all panels build, and Retirement KPI tiles render — the net that catches a silently truncated module or a stale/partial DATA snapshot (both of which pass `node --check` and the golden-master). `tests/dash/_dom.js` is the reusable DOM/Chart harness.
- **Build-script transforms** (`tests/scripts/`, pytest) — the pure Python transforms (market data, integrity guard, history, alerts, dividends, DCF, look-through, index/macro history, logging).

Node ≥ 18 and (optionally) `pip install pytest --break-system-packages` for the Python layer.

## Reproducing the build (scripts)

The scripts self-locate the project root (parent of `scripts/`). The dashboard is built from the `src/dash/` modules — `rebuild_all.py` runs `assemble_dashboard.py` to rebuild `dashboard_tpl.html` before injecting DATA (**edit a module, never the assembled monolith**). Two gates are mandatory before writing the HTML copies: the **golden-master byte check** (`assemble_dashboard.py`) and a **full-script stubbed-DOM harness** — `node --check` catches syntax only, and a silently truncated module can still assemble and golden-master cleanly while blanking every panel at runtime. To run from another environment, set `TDD_BASE`, e.g. `TDD_BASE=/path/to/tech_drawdown python scripts/rebuild_all.py`.

## Roadmap & status

**Baseline v1.0** is the starting point — everything currently in the dashboard is in this baseline. Remaining work is tracked in `TASKS.md`: tax-lot / realized gains, PDF & email digest, corporate actions in the Fundamentals popup, saved retirement scenarios, security/auth, GitHub/CI, a true intrinsic-value anchor (Morningstar FVE — no connector), and capex-glide refinements that need their own external benchmark.

_Rules-based analytics — not financial advice._

