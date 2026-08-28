# Plan: Harden MCP Connectors — FMP and Bigdata

## Overview

Both MCP servers are already registered in `.bob/mcp.json` as stdio/npx entries.
This plan hardens that configuration:
- Move the FMP API key out of the CLI args (where it is visible in the file) into an `env` block
- Add the Bigdata API key via an `env` block (currently missing — server runs without auth)
- Add `alwaysAllow` to both entries so the daily agent run doesn't prompt for each tool call
- Create `.env.example` to document the two required env var names

**Out of scope:** Changes to `src/dash/70_connector.js`, `assemble_dashboard.py`, or any pipeline scripts.
The `mcp__uuid__` prefix constants in `70_connector.js` are a Cursor-only concern (injected via
`window.liveMcp`); Bob's agent calls MCP tools by bare name directly.

---

## Sub-Task 1 — Harden `.bob/mcp.json`

**Status:** [x] done

**Intent:**
Move credentials out of CLI args into `env` blocks (credentials in args are visible in logs
and process listings). Add `alwaysAllow` arrays so the daily agent run doesn't prompt for
approval on every tool call.

**Expected Outcomes:**
- FMP API key passed via env var `FMP_API_KEY`, not `--fmp-token=...` in args
- Bigdata API key passed via env var `BIGDATA_API_KEY`
- Both servers have `alwaysAllow` listing every tool the daily pipeline and browser connector use
- The JSON file remains valid and both server names (`financial-modeling-prep`, `bigdata-search`) are unchanged

**Todo List:**
1. Read current `.bob/mcp.json` (already read — see context below)
2. Rewrite the `financial-modeling-prep` entry: keep `command`/`args` (minus the `--fmp-token` arg), add `env: { "FMP_API_KEY": "..." }`, add `alwaysAllow`
3. Rewrite the `bigdata-search` entry: keep `command`/`args`, add `env: { "BIGDATA_API_KEY": "..." }`, add `alwaysAllow`
4. Verify JSON is valid (no trailing commas, balanced braces)

**alwaysAllow for `financial-modeling-prep`:**
`["quote", "batch-quote", "analyst", "statements", "discountedCashFlow", "dividends-company", "historical-price-eod-light", "chart", "commodity", "forex", "economics"]`

**alwaysAllow for `bigdata-search`:**
`["find_securities", "bigdata_company_tearsheet", "bigdata_etf_tearsheet", "bigdata_sentiment_tearsheet"]`

**Relevant Context:**
- Current `.bob/mcp.json` content (confirmed by read):
  ```json
  {
    "mcpServers": {
      "financial-modeling-prep": {
        "command": "npx",
        "args": ["financial-modeling-prep-mcp-server", "--fmp-token=TeUklNWwHqqbhuHHOXv5QlxI88MRb7sX"]
      },
      "bigdata-search": {
        "command": "npx",
        "args": ["-y", "@bigdata/mcp-server"]
      }
    }
  ```
- FMP npm package passes key via `--fmp-token=<KEY>` CLI arg today; we need to confirm if it also accepts an env var — check the package's env var name (`FMP_API_KEY` or `FMP_TOKEN`)
- Bigdata npm package likely uses `BIGDATA_API_KEY` env var — confirm from package docs/source if possible
- Real key values must be read from `.env` (gitignored) and written into the `env` block

---

## Sub-Task 2 — Create `.env.example`

**Status:** [x] done

**Intent:**
`.env` is gitignored and `.env.example` does not yet exist. Document the two MCP-related
env var names so any new machine setup knows exactly what to provide.

**Expected Outcomes:**
- `.env.example` exists at project root with `FMP_API_KEY` and `BIGDATA_API_KEY` as placeholder entries
- Existing `TDD_BASE` usage (set by `run_daily.ps1`) is also documented
- File has explanatory comments

**Todo List:**
1. Create `.env.example` at project root with the three documented variables
2. Update `AGENTS.md` — add a short "Environment variables" section noting `FMP_API_KEY`, `BIGDATA_API_KEY`, and `TDD_BASE`

**Relevant Context:**
- `TDD_BASE` set in `scripts/run_daily.ps1` line 24: `$env:TDD_BASE = $Root`
- `FMP_API_KEY` and `BIGDATA_API_KEY` are the env var names to pass into the `env` blocks in `.bob/mcp.json`
- `.env.example` should NOT contain real keys — placeholders only

---

## Sub-Task 3 — Verify and update AGENTS.md

**Status:** [x] done

**Intent:**
Ensure the daily agent instructions (`daily_refresh.md`) and `AGENTS.md` reflect the
updated MCP config so future agents know the servers are pre-registered and `alwaysAllow`
is set.

**Expected Outcomes:**
- `AGENTS.md` has a concise "MCP servers" or "Environment variables" section
- `daily_refresh.md` preamble no longer says "Connect FMP and Bigdata in Cursor Settings → MCP" (they are now auto-registered via `.bob/mcp.json`)
- `bash tests/run_all.sh` still passes (no code changes, just config)

**Todo List:**
1. Update `daily_refresh.md` lines 4–6: replace Cursor MCP setup instruction with note that servers are registered in `.bob/mcp.json`
2. Add "MCP / Environment" section to `AGENTS.md`
3. Run `bash tests/run_all.sh` to confirm nothing broken
