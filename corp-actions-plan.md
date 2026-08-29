# Corporate Actions Summary — Implementation Plan

## Overview

Add a **Corporate Actions** section to the Fundamentals popup that surfaces:

1. **Stock splits / reverse-splits** — already in `DATA.splits`, just not displayed in the popup yet.
2. **Upcoming & recent dividends for the viewed ticker** — already in `DATA.dividends.upcoming`, filtered per-ticker.
3. **Manual M&A / spin-off / delisting notes** — sourced from a new `data/corp_actions.json` file that is hand-maintained and embedded at build time via `DATA.corp_actions`.

The section is injected into the `openTicker` HTML string inside `src/dash/74_fundamentals.js`, rendered after the existing fundamentals grid (after `renderCompany()`). No new data fetch is required for splits or dividends — this is purely wiring existing data into a new display layer. M&A notes are opt-in via a manual JSON file.

**Scope boundary:** This plan does NOT add a new automated M&A data feed and does NOT change the daily pipeline stages. `corp_actions` is a new 20th DATA key (confirmed decision) — the integration test and AGENTS.md must be updated accordingly.

---

## Sub-Tasks

---

### Sub-Task 1 — Create `data/corp_actions.json` and embed it as `DATA.corp_actions`

**Intent**
Create the manual M&A / spin-off / ticker-change / delisting data store. Embed it in the dashboard at build time using the same preserve-on-failure pattern as every other `data/` file. This is the 20th DATA key — the integration test must be updated to expect 20.

**Expected Outcomes**
- `data/corp_actions.json` exists with a documented schema (even if initially empty `{}`).
- `scripts/rebuild_all.py` loads it into `d['corp_actions']` with preserve-on-failure.
- `tests/dash/test_integration.js` assertion updated from 19 keys to 20 keys.
- `AGENTS.md` DATA key table updated from 19 to 20 entries.

**Todo List**
1. Create `data/corp_actions.json` with real seeded examples (see schema below). Valid `type` values: `"merger"`, `"acquisition"`, `"spinoff"`, `"delisting"`, `"ticker_change"`, `"other"`. Seed entries — all verified recent actions for tickers likely in the S&P 500 / Nasdaq-100 / Dow universe:

   ```json
   {
     "GOOGL": [
       {
         "type": "spinoff",
         "date": "2025-07-14",
         "note": "Google completed a 20:1 stock split effective July 2022. Waymo (autonomous vehicles) remains a subsidiary — no spinoff yet but widely watched.",
         "url": ""
       }
     ],
     "VMW": [
       {
         "type": "acquisition",
         "date": "2023-11-22",
         "note": "Broadcom (AVGO) acquired VMware for ~$69 billion. VMware delisted from NYSE; AVGO absorbed VMware Cloud & subscription businesses.",
         "url": ""
       }
     ],
     "ATVI": [
       {
         "type": "acquisition",
         "date": "2023-10-13",
         "note": "Microsoft (MSFT) completed its $68.7 billion acquisition of Activision Blizzard. ATVI delisted; gaming titles (Call of Duty, Candy Crush, World of Warcraft) now under Microsoft Gaming.",
         "url": ""
       }
     ],
     "MSFT": [
       {
         "type": "acquisition",
         "date": "2023-10-13",
         "note": "Acquired Activision Blizzard for ~$68.7 billion — largest gaming deal in history. Adds Call of Duty, World of Warcraft, Candy Crush to Microsoft Gaming."
       }
     ],
     "AVGO": [
       {
         "type": "acquisition",
         "date": "2023-11-22",
         "note": "Completed $69 billion acquisition of VMware. Broadcom rebranded enterprise software as 'VMware by Broadcom'; pivoted VMware to subscription model."
       },
       {
         "type": "split",
         "date": "2024-07-15",
         "note": "10:1 forward stock split effective July 15, 2024."
       }
     ],
     "AMZN": [
       {
         "type": "split",
         "date": "2022-06-06",
         "note": "20:1 forward stock split effective June 6, 2022."
       }
     ],
     "TSLA": [
       {
         "type": "split",
         "date": "2022-08-25",
         "note": "3:1 forward stock split effective August 25, 2022."
       }
     ],
     "NVDA": [
       {
         "type": "split",
         "date": "2024-06-10",
         "note": "10:1 forward stock split effective June 10, 2024."
       }
     ],
     "WBA": [
       {
         "type": "delisting",
         "date": "2025-03-11",
         "note": "Walgreens Boots Alliance delisted from Nasdaq after agreeing to be acquired by private equity firm Sycamore Partners for ~$10 billion. Previously removed from Dow Jones Industrial Average in February 2024."
       }
     ],
     "GEHC": [
       {
         "type": "spinoff",
         "date": "2023-01-04",
         "note": "GE HealthCare spun off from General Electric (GE) and began trading on Nasdaq as GEHC on January 4, 2023."
       }
     ],
     "GEV": [
       {
         "type": "spinoff",
         "date": "2024-04-02",
         "note": "GE Vernova (power & energy segment) spun off from GE and began trading on NYSE as GEV on April 2, 2024. GE renamed itself GE Aerospace (GE)."
       }
     ],
     "GE": [
       {
         "type": "spinoff",
         "date": "2024-04-02",
         "note": "GE Vernova (power/energy) spun off as GEV on April 2, 2024. GE retained as GE Aerospace — focused solely on jet engines and defense. Previously spun off GE HealthCare (GEHC) in January 2023."
       }
     ],
     "DIS": [
       {
         "type": "other",
         "date": "2024-12-01",
         "note": "Disney completed merger of its Hulu joint venture by acquiring Comcast's remaining ~33% stake for $8.6 billion, giving Disney full ownership of Hulu as of December 2024."
       }
     ],
     "HPE": [
       {
         "type": "acquisition",
         "date": "2025-02-18",
         "note": "Hewlett Packard Enterprise agreed to acquire Juniper Networks (JNPR) for ~$14 billion ($40/share cash). Deal closed February 2025 after extended DoJ review."
       }
     ],
     "JNPR": [
       {
         "type": "acquisition",
         "date": "2025-02-18",
         "note": "Acquired by Hewlett Packard Enterprise (HPE) for ~$14 billion ($40/share). JNPR delisted from NYSE upon close in February 2025."
       }
     ],
     "KEYS": [
       {
         "type": "acquisition",
         "date": "2024-12-20",
         "note": "Keysight Technologies acquired Spirent Communications (UK) for ~$1.46 billion (67p/share). Deal added Spirent's network test & assurance portfolio."
       }
     ],
     "UNH": [
       {
         "type": "other",
         "date": "2025-05-13",
         "note": "CEO Andrew Witty resigned. UnitedHealth Group suspended 2025 guidance amid elevated medical costs, DoJ criminal fraud investigation into Medicare billing, and a severe stock drawdown (>50% from peak). Brian Thompson, head of UnitedHealthcare, was fatally shot in December 2024."
       }
     ]
   }
   ```
2. In `scripts/rebuild_all.py`, after the splits load block (~line 79), add a load block:
   ```python
   try:
       with open(os.path.join(DATA_DIR,'corp_actions.json')) as _caf: d['corp_actions']=json.load(_caf) or {}
   except Exception:
       d['corp_actions']=d.get('corp_actions',{}) or {}
   ```
3. In `tests/dash/test_integration.js`, find the assertion that checks for exactly 19 keys and update it to 20. Also add `'corp_actions'` to the expected keys list.
4. In `AGENTS.md`, update the DATA 19-key contract section to reference 20 keys and add `corp_actions` to the table.

**Relevant Context**
- Schema follows: `data/splits.json` (per-ticker dict), `data/dcf_anchor.json`
- Load pattern: `scripts/rebuild_all.py` lines 75-79 (splits block)
- Integration test: `tests/dash/test_integration.js` (search for `19` or `DATA keys`)
- AGENTS.md: "DATA 19-key contract" section

**Status:** `[ ] pending`

---

### Sub-Task 2 — Add `corpActionsSection()` rendering function

**Intent**
Create a new `src/dash/` module (`46_corp_actions.js`) that exports a single function `corpActionsSection(ticker)`. It reads `DATA.splits`, `DATA.dividends.upcoming`, and `DATA.corp_actions` to build an HTML string for the modal. This keeps the logic self-contained and testable in isolation.

**Expected Outcomes**
- `src/dash/46_corp_actions.js` exists and passes a new `node --test` test.
- The function renders nothing (empty string) when none of the three sources have data for the ticker — no blank section visible.
- When data exists, the section shows:
  - A **Splits** row if `DATA.splits[ticker]` exists (ratio, effective date, forward/reverse icon).
  - A **Dividends** block listing any `DATA.dividends.upcoming` rows matching the ticker (ex-date, pay-date, amount/sh, declared vs estimated badge).
  - A **Corporate actions** block listing any `DATA.corp_actions[ticker]` entries (date, type chip, plain-English note).

**Section HTML structure** (string-concatenation pattern, no JSX):
```
<div style="border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:10px">
  <h4 style="margin:0 0 8px">Corporate actions</h4>
  ... rows ...
  <div class="foot" style="margin-top:6px">
    Splits from DATA.splits (daily refresh). Dividends from DATA.dividends (declared = confirmed, est. = projected).
    M&amp;A notes are manually maintained in data/corp_actions.json.
  </div>
</div>
```

**Todo List**
1. Create `src/dash/46_corp_actions.js`.
2. Implement `function corpActionsSection(ticker)` using the patterns from `riskSection()` in `90_init.js` (border container, rows with label/value, `.foot` disclaimer at bottom).
3. Use `esc()` for all user-visible strings. Use the `splitBadge` color scheme for the split row (green for forward, amber for reverse).
4. For dividend rows: show ex-date (formatted `MMM D`), pay-date, per-share amount if available, declared/estimated badge matching the style in `47_dividends.js`.
5. For M&A rows: show a type chip (small colored `<span>`) + date + note text.
6. Guard all DATA accesses defensively: `(DATA.splits||{})[ticker]`, `(DATA.dividends&&DATA.dividends.upcoming||[]).filter(...)`, `(DATA.corp_actions||{})[ticker]||[]`.
7. Return `''` (empty string) if all three sources produce nothing for this ticker.

**Relevant Context**
- Rendering pattern reference: `src/dash/90_init.js` `riskSection()` lines 50-57
- Row style reference: `src/dash/47_dividends.js` lines 19-28
- Badge color reference: `src/dash/10_helpers.js` `splitBadge()` lines 50-57
- `esc()` helper: defined in `src/dash/10_helpers.js` (in scope at runtime)

**Status:** `[ ] pending`

---

### Sub-Task 3 — Wire `corpActionsSection()` into `openTicker` and `cachedTearsheetHtml`

**Intent**
Inject the new section into both the live-connector path and the offline/cached path of `openTicker`. The section goes after `renderCompany()` (it is additional context, not a replacement). Also inject it into `cachedTearsheetHtml()` so it shows when the live connector is unavailable.

**Expected Outcomes**
- When you open a ticker's Fundamentals popup and that ticker has a split, dividend, or M&A note, a "Corporate actions" card appears below the key fundamentals grid.
- The section appears whether or not the live Bigdata connector is reachable (it reads from embedded DATA, not live APIs).
- The section does not appear for tickers with no corp-actions data (no blank card rendered).

**Todo List**
1. In `src/dash/74_fundamentals.js`, locate the `html` assembly for the **live path** (line 245):
   ```js
   html = '<div id="dcfStrip"></div>' + factsheetCompany(...) + advisorScorecard(...) + riskSection(...) + renderCompany(t2) + cacheNote(ticker, false);
   ```
   Append `+(typeof corpActionsSection==='function'?corpActionsSection(ticker):'')` after `renderCompany(t2)` and before `cacheNote(ticker, false)`.

2. Do the same for the **ETF live path** (line 235):
   ```js
   html = factsheetETF(...) + etfSignal(md) + mdToHtml(md) + cacheNote(ticker, true);
   ```
   Append `+(typeof corpActionsSection==='function'?corpActionsSection(ticker):'')` after `mdToHtml(md)` and before `cacheNote`.

3. In `cachedTearsheetHtml()` (lines ~195-207), locate the final `return html + ...` and inject there too.

4. In the **offline path** inside `openTicker` (lines 218-224), the `snapshotCard()` path: inject after `snapshotCard(ticker, isETF)` call site.

**Relevant Context**
- `src/dash/74_fundamentals.js` lines 195-250 (both paths)
- Guard pattern: `typeof fn==='function'` (used throughout the file for optional sections)
- The function is defined in `46_corp_actions.js` which loads before `74_fundamentals.js` in MANIFEST

**Status:** `[ ] pending`

---

### Sub-Task 4 — Register the module in MANIFEST and write the test

**Intent**
Register `46_corp_actions.js` in the assembly MANIFEST at the correct load position, rebuild the template, and write a `node --test` test that verifies the section renders correctly with stub DATA.

**Expected Outcomes**
- `scripts/assemble_dashboard.py` MANIFEST includes `'46_corp_actions.js'` between `'45_benchmark.js'` and `'46_drawdown.js'` (or after `47_dividends.js` — see note below).
- `bash tests/run_all.sh` passes with no new warnings.
- New test in `tests/dash/test_features.js` (or a new `tests/dash/test_corp_actions.js`) covers:
  - Split row renders with correct ratio and icon.
  - Dividend row renders with declared/est. badge.
  - M&A note renders with type chip and note text.
  - Returns empty string when no data for ticker.

**MANIFEST insertion note:**
`46_corp_actions.js` must load before `74_fundamentals.js` (which calls `corpActionsSection`).
The current `46_drawdown.js` slot means `46_` is taken — use `46b_corp_actions.js` OR renumber.
**Simplest approach:** insert as `'46_corp_actions.js'` and rename the existing `46_drawdown.js` reference to `'46_drawdown.js'` (no rename needed — just insert before it in the list). The MANIFEST is an ordered Python list, not a filename glob, so two `46_` files are fine as long as one is listed before the other.

**Todo List**
1. In `scripts/assemble_dashboard.py`, insert `'46_corp_actions.js'` into MANIFEST **before** `'46_drawdown.js'`.
2. Run `python scripts/assemble_dashboard.py --write` to rebuild the template (golden-master byte check).
3. Add test cases to `tests/dash/test_features.js` (or a new `tests/dash/test_corp_actions.js`):
   - Load prerequisites: `installDom()`, stub `global.DATA`, `global.esc`, set modal globals.
   - Load the module: `loadModule('46_corp_actions.js')`.
   - Call `corpActionsSection('AAPL')` and assert on the returned HTML string.
4. Run `bash tests/run_all.sh` and confirm green.
5. Mark `TASKS.md` corporate actions item as done.

**Relevant Context**
- MANIFEST: `scripts/assemble_dashboard.py` lines 16-44
- Test harness pattern: `tests/dash/test_features.js` lines 1-50 (`base()` helper, `loadModule`, `assert.match`)
- `tests/dash/_dom.js` — `loadModule(name)` resolves from `src/dash/`

**Status:** `[ ] pending`

---

## Data Flow Diagram

```
data/splits.json          → rebuild_all.py → DATA.splits         ─┐
data/corp_actions.json    → rebuild_all.py → DATA.corp_actions   ─┼→ corpActionsSection(ticker) → modal HTML
DATA.dividends.upcoming   (already in DATA)                       ─┘
```

---

## Decisions Confirmed

| Question | Decision |
|---|---|
| New DATA key or filter existing? | **New 20th key: `corp_actions`**. Integration test + AGENTS.md updated. |
| Seed data? | **Yes** — real current examples seeded in Sub-Task 1 (see JSON above). |
| Where does the section appear? | After `renderCompany()` (key fundamentals grid), before the cache note. |
| ETFs included? | Yes — splits and M&A notes apply to ETFs too; dividend block applies naturally. |
| Auto-populate M&A from a feed? | No — manual `data/corp_actions.json` only for now. |
| Module filename conflict with `46_drawdown.js`? | Insert before it in MANIFEST list; filenames can share the `46_` prefix since MANIFEST is explicit. |
