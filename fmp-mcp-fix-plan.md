# Plan: Fix FMP MCP Startup Script

## Overview

`scripts/start-fmp-mcp.ps1` has three independent bugs that together prevent the FMP MCP
server from starting reliably with the API token. The goal is a script that:

1. Kills any existing process on port 8080 without crashing.
2. Starts `node npx-cli.js financial-modeling-prep-mcp-server` with `FMP_ACCESS_TOKEN` and
   `PORT` in its environment, inheriting the full current environment (so Node can resolve its
   own modules via `PATH`).
3. Waits up to 20 s for the `/healthcheck` endpoint to confirm the server is up *and* the
   token is accepted (not "dummy server").
4. Exits non-zero on failure so callers can detect a bad start.

Non-goals: changing `.bob/mcp.json`, changing the server package, or altering the daily
pipeline steps — those are correct as-is once the server runs with the token.

---

## Bug Inventory

### Bug A — `$pid` is a read-only automatic variable in PowerShell 5

**Location:** [`scripts/start-fmp-mcp.ps1`](scripts/start-fmp-mcp.ps1) line 25  
`foreach ($pid in $existing)` — `$pid` is a built-in automatic variable (current process ID).
PowerShell 5 refuses to overwrite it and throws `Cannot overwrite variable PID` at runtime,
aborting the script before it kills the old server or starts the new one.

**Fix:** rename loop variable to `$proc_id`.

---

### Bug B — `ProcessStartInfo` launches node with an empty environment

**Location:** [`scripts/start-fmp-mcp.ps1`](scripts/start-fmp-mcp.ps1) lines 73-100  
`[System.Diagnostics.ProcessStartInfo]::new()` on PS5/Windows initialises
`psi.Environment` as an **empty** `StringDictionary`. The loop on lines 83-87 fills it from
`[System.Environment]::GetEnvironmentVariables()`, but this approach is fragile: the dict must
be fully populated *before* `.Start()`, and if `PATH` is absent node cannot resolve
`require()` paths and crashes immediately with a module-not-found error before even reaching
the port-bind call.

The crash manifests as `EADDRINUSE` in the log because the previous node process was killed
but the OS briefly holds the port in `TIME_WAIT`; by the time the *new* node process crashes
(not due to the port), the log shows the port error from the previous process's exit.

**Fix:** replace the `ProcessStartInfo` block with `Start-Process` using `-Environment` hash
built cleanly in PowerShell, which is the PS5-idiomatic approach and avoids the empty-dict
pitfall entirely.

**PS5 note:** `Start-Process -Environment` is only available in PS 7+. The PS5-compatible
approach is to write a small `.cmd` launcher to `scripts/tmp/` that sets the two env vars and
calls `node`, then `Start-Process` that `.cmd` with `-RedirectStandardOutput` /
`-RedirectStandardError` and `-NoNewWindow`. The `.cmd` file inherits the full parent env
automatically, so `PATH` is always present.

---

### Bug C — token lands in an empty-dict environment, node runs as "dummy server"

**Location:** same `ProcessStartInfo` block  
Even on a clean path where node starts, `FMP_ACCESS_TOKEN` was set on the empty dict before
the inheritance loop ran. If the loop's `ContainsKey` check finds the key already set, it
won't overwrite — correct. But because node crashed first (Bug B), we never saw proof the
token was actually propagated. The `.cmd` wrapper approach (Bug B fix) makes token injection
trivial and verifiable.

**Fix:** included in the Bug B fix — the `.cmd` file sets `FMP_ACCESS_TOKEN` and `PORT`
before invoking `node`, with no environment manipulation needed in PowerShell.

---

## Sub-Tasks

---

### Sub-Task 1 — Replace the kill loop variable

**Intent:** Fix Bug A so the script does not abort before reaching the kill logic.

**Expected Outcomes:**
- `foreach ($proc_id in $existing)` compiles and runs without error.
- Any existing node process on port 8080 is stopped before the new one starts.

**Todo List:**
1. In [`scripts/start-fmp-mcp.ps1`](scripts/start-fmp-mcp.ps1), rename every occurrence of
   `$pid` in the kill block (lines 25-27) to `$proc_id`.
2. Parse-check the file: `[Parser]::ParseFile(...)` returns zero errors.

**Relevant Context:**
- `$PID` is documented as a PowerShell automatic variable. Any loop variable named `pid`
  (case-insensitive) collides with it.

**Status:** `[ ] pending`

---

### Sub-Task 2 — Replace ProcessStartInfo with a .cmd-file launcher

**Intent:** Fix Bugs B and C: ensure node inherits the full environment (including `PATH`) and
receives `FMP_ACCESS_TOKEN` and `PORT`, without any manual environment-dictionary assembly.

**Expected Outcomes:**
- The server starts, `fmp-mcp.log` shows `MCP Server started successfully on port 8080`, and
  does **not** show `Server access token is required`.
- `/healthcheck` returns `status: ok`.
- The `.cmd` file is written to `scripts/tmp/` (gitignored) and cleaned up after the server
  confirms healthy, or left for debug on failure.

**Todo List:**
1. Remove the entire `ProcessStartInfo` / `$proc` block (lines 73-103).
2. Before the `Start-Process` call, write a file `scripts/tmp/start-fmp-mcp.cmd` with:
   ```
   @echo off
   set FMP_ACCESS_TOKEN=<token>
   set PORT=<port>
   node "<absolute-path-to-npx-cli.js>" financial-modeling-prep-mcp-server
   ```
   Use `$fmpKey`, `$Port`, and the resolved `$npxCli` path already computed by the script.
3. Launch the `.cmd` with:
   ```powershell
   $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$cmdFile`"" `
       -RedirectStandardOutput $logFile -RedirectStandardError $logFile `
       -NoNewWindow -PassThru
   ```
4. Keep the existing 20 s health-check poll loop unchanged.
5. After successful health check, add a check that the log does **not** contain
   `access token is required` — if it does, exit with a non-zero code and print a clear
   message.

**Relevant Context:**
- `$npxCli` is already resolved correctly to the WinGet node layout at
  `...\node-v24.18.0-win-x64\node_modules\npm\bin\npx-cli.js`.
- `scripts/tmp/` is gitignored per `AGENTS.md` — safe scratch location.
- `Start-Process -RedirectStandardOutput` on PS5 requires an **absolute path** for the
  redirect file, not a relative one. Use `Resolve-Path` after `New-Item`.
- `-RedirectStandardError` and `-RedirectStandardOutput` cannot both point to the same file
  in PS5 `Start-Process` — write stderr to `fmp-mcp-err.log` and merge them after, or use
  the `.cmd` file's own `>>` redirect (`>> logfile 2>&1`) instead of PS-level redirects.

**Status:** `[ ] pending`

---

### Sub-Task 3 — Add a token-accepted verification step

**Intent:** Make the script fail loudly (non-zero exit) if the server starts in "dummy" mode
without a valid token, so the daily pipeline can abort early rather than getting
`FMP_ACCESS_TOKEN is required` errors per-tool-call.

**Expected Outcomes:**
- If the log contains `access token is required`, the script prints a clear error and exits 1.
- If the health check never responds, the script exits 2.
- If both pass, the script exits 0.

**Todo List:**
1. After the health-check poll loop, read `$logFile` content.
2. If it contains the string `access token is required`, write an error message and `exit 1`.
3. Replace the existing `if (-not $healthy)` warning with `exit 2` so callers can distinguish
   "server not responding" from "server running but tokenless".
4. Add a success line: `Write-Host "FMP MCP ready with token on http://localhost:$Port/mcp"`.

**Relevant Context:**
- The "dummy server" log message is emitted by the npm package itself:
  `Server access token is required for operations - running dummy server`.
- The daily pipeline's `daily_refresh.md` Step 3 calls FMP tools directly — it will fail
  per-call without a clear upfront signal unless this check exists.

**Status:** `[ ] pending`

---

### Sub-Task 4 — Smoke-test the fixed script end-to-end

**Intent:** Verify all three bugs are gone and the server starts correctly with the token.

**Expected Outcomes:**
- Running `.\scripts\start-fmp-mcp.ps1` from the project root exits 0.
- `logs/fmp-mcp.log` contains `MCP Server started successfully on port 8080`.
- `logs/fmp-mcp.log` does **not** contain `access token is required`.
- `Invoke-RestMethod http://localhost:8080/healthcheck` returns `status: ok`.
- An FMP tool call (e.g. `getQuoteShort` for `AAPL`) returns a real price, not an auth error.

**Todo List:**
1. Kill any running node process on 8080.
2. Run `.\scripts\start-fmp-mcp.ps1`.
3. Check exit code, log content, and health endpoint.
4. Make one FMP MCP tool call (`getQuote` for `AAPL`) and confirm a valid response.
5. Update `daily_refresh.md` comments if the startup instructions need updating.

**Relevant Context:**
- The `.bob/mcp.json` `url` points to `http://localhost:8080/mcp` — correct, no change needed.
- `AGENTS.md` states: FMP requires the local HTTP server to be running first. The startup
  instructions reference `.\scripts\start-fmp-mcp.ps1` — those stay valid after this fix.

**Status:** `[ ] pending`
