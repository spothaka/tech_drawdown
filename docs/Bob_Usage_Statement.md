# How IBM Bob Was Used to Build Tech Drawdown

## Summary

IBM Bob was the agentic engineering environment used to extend, validate, operate and
document the Tech Drawdown codebase. Bob was not used to generate throwaway snippets — it
worked directly against the live repository across five distinct, logged workstreams
(28–29 August 2026), each captured as a Bob task transcript. Across those sessions Bob
executed **262 shell commands, 139 file reads, 37 greps, 32 targeted diffs, 20 file writes,
21 globs, 5 spreadsheet reads and 2 symbol lookups**, coordinated by **46 todo-list updates**,
**13 clarifying questions back to the human**, **6 spawned sub-agents**, **4 skill invocations**
(`create-plan` ×3, `configure-mcp` ×1) and **3 explicit Ask → Agent mode switches**.

## 1. Codebase onboarding — `/init`

Bob analysed the repository and generated the agent-facing rulebook: a root `AGENTS.md` plus
three mode-scoped files (`.bob/rules-agent/`, `.bob/rules-ask/`, `.bob/rules-plan/`). Rather
than restating generic practice, Bob was directed to record only what it had to *discover by
reading files*. It captured the invariants that are genuinely expensive to rediscover: the
19-key `DATA` contract enforced by `test_integration.js`, the MANIFEST load-order dependencies
between dashboard modules, the requirement that anything reached during the eager panel build
be a hoisted `function` declaration, the template-versus-deployed-file distinction, the
preserve-on-failure contract on every pipeline stage, and the exact single-test command for
each of the four test runners. The `.bob/rules-plan` file additionally encodes the
architectural constraint that the deliverable must remain one self-contained HTML file
assembled by concatenation only.

## 2. MCP connector integration and hardening

Bob reviewed `.bob/mcp.json`, flagged that the Financial Modeling Prep API key was hardcoded
in plaintext in the `args` array, and proposed migrating it to an environment block. It then
verified the assumption instead of trusting it: `npx financial-modeling-prep-mcp-server --help`
established the package reads `FMP_ACCESS_TOKEN`, and inspection of `.env` revealed that
*neither* provider key was present — meaning the Bigdata server had been silently broken,
resolving `${BIGDATA_API_KEY}` to an empty string. Bob used `search_bob_docs` to confirm that
Bob does not perform shell-style `${VAR}` interpolation inside JSON, corrected the approach,
authored `.env.example`, and updated `AGENTS.md` and `scripts/daily_refresh.md` accordingly.
Notably, Bob's own `.bobignore` guardrail prevented it from reading the secret — so it stopped
and asked, rather than working around its own restriction.

## 3. Backlog triage and feature delivery — Corporate Actions

Asked to recommend the next feature, Bob read `TASKS.md` and produced an effort-versus-blocker
matrix across ten backlog items, then recommended **Corporate Actions in the Fundamentals
popup** with an explicit rationale: the data (`DATA.splits`, `DATA.dividends.upcoming`) was
already being collected daily but never displayed, so the change required no new feed. Bob
invoked its `create-plan` skill, spawned an `explore` sub-agent to research the codebase, and
wrote `corp-actions-plan.md` with a Mermaid data-flow diagram and four sub-tasks — pausing to
ask the human two design questions before implementing.

It then executed the plan end to end: new `data/corp_actions.json` (21 seeded entries), new
module `src/dash/46_corp_actions.js`, four injection points in `74_fundamentals.js` covering
the live-company, live-ETF, cached-company and cached-ETF paths, a MANIFEST entry in
`assemble_dashboard.py`, a `rebuild_all.py` loader with preserve-on-failure, 11 new unit tests,
and the `DATA` contract raised from 19 to 20 keys. Verification: golden-master byte-identical,
three ranking-parity suites clean, 30 of 31 dashboard tests green. `TASKS.md` was marked
shipped.

## 4. Regression forensics

The one remaining red test (`dividends.annual drives .kpidiv`) was investigated in a separate
session. Bob's most valuable behaviour here was refusing to over-claim: using `git diff HEAD`,
`git show HEAD:` and `git stash`, it **proved** the failure pre-dated its own changes and was a
stale-data-snapshot issue rather than a code defect, fixed only the failure it was responsible
for, and reported the other honestly as pre-existing.

## 5. Operating the daily pipeline end to end

Bob was finally used as an operator, not just an author: run the daily refresh with a
connectivity gate first. It logged a run ID, confirmed the Bigdata MCP server responded to a
live query, found the local FMP server at `:8080` unreachable, logged a WARN and fell back to
the prior universe snapshot exactly as the playbook prescribes. It then diagnosed and repaired
the PowerShell launcher, identifying three concrete defects: `$pid` used as a `foreach`
variable (a read-only automatic variable in PowerShell 5.1, aborting the script before it could
kill the stale process), `ProcessStartInfo.Environment` starting empty on PS5 and needing to be
seeded from the current environment, and `FMP_ACCESS_TOKEN` never being loaded from `.env`. Bob
verified the repair with the PowerShell AST parser plus scans for non-ASCII characters and
residual `$pid` references — static proof before execution.

## What Bob contributed

Bob's role was repository-grounded engineering on a real, non-trivial codebase: onboarding and
documenting it for future agents, triaging a backlog with reasoning, shipping a full feature
with tests behind a byte-level golden master, performing git-based regression forensics, fixing
MCP and platform infrastructure, and running the production pipeline with logging and
fallbacks. Its plan/ask/agent mode separation, todo-list tracking and follow-up questions kept
a long multi-stage run auditable and kept the human in the loop at every decision point.
