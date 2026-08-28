# Project Documentation Context (Non-Obvious Only)

- **`.bob/mcp.json`** has both MCP servers pre-registered as stdio/npx entries (`financial-modeling-prep`, `bigdata-search`). No manual IDE setup needed. Keys come from `.env` (`FMP_API_KEY`, `BIGDATA_API_KEY`). `.env.example` documents these.

- **`scripts/dashboard_tpl.html`** is the *template* (DATA placeholder `__DATA__`), not the deployed artifact. The deployed artifact is `dashboard/tech_drawdown_dashboard.html` (DATA injected). `scripts/dashboard.html` is an identical local copy.
- **`scripts/rebuild_all.py`** looks like the build script but is actually a scratch shortcut for ad-hoc workbook rebuilds. The canonical pipeline is `scripts/daily_refresh.md`.
- **`src/dash/76_ranking_engine.js`** is machine-generated from `src/ranking/` — documentation and comments about the ranking engine live in `src/ranking/engine.js`, not in the assembled module.
- **Ranking tests in `tests/ranking/`** are not using Node's built-in test runner — they run directly via `node file.js` and use `process.exit(1)` on failure. The golden-master files embed the *verbatim original* scoring function to guard engine parity.
- **`tests/dash/_dom.js`** is the shared DOM stub harness — explains why `src/dash/*.js` modules work without a browser.
- **`data/` and `scripts/tmp/`** are gitignored — do not expect these to be present in a fresh clone. The daily pipeline creates them.
- **The `.bob/` directory is the agent configuration root** — `mcp.json` and `rules-ask/AGENTS.md` are the current sources of truth.
- **`scripts/docgen/`** contains manually-run document generators (`make_diagrams.py`, `build_architecture_docx.js`, `build_brd_docx.js`, etc.); these are NOT part of the daily pipeline and are run after features ship.
- **`reports/earnings/`** contains generated long-form memos from `scripts/gen_earnings_memo.py`.
- **`logs/`** is written by `scripts/log_util.py` and contains `run_<timestamp>.jsonl`, `latest_run.md`, and `runs.jsonl` (history).
