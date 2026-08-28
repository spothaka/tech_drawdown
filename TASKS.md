# Tech Drawdown — Roadmap

**Baseline v1.0** (2026-08-28) is the starting point. Everything currently shipped is in this baseline. Open work lives in the backlog below — move items as priorities shift.

---

## Baseline v1.0 — shipped

- **9-tab dashboard** as a self-contained HTML page. Six market-universe tabs (S&P 500, Nasdaq-100, Dow, Top-100 ETFs, Thematic ETFs, Mutual Funds) plus private IRA & Brokerage tabs and a Retirement & Income planner.
- **FMP-primary universe** (chain FMP → STOCKHISTORY tail → carry-forward) with a 52-week band integrity guard + ⚠ badge.
- **Market-context Overview** — de-duplicated health spectrum (best / in-correction / worst-drawdown), 1-year index charts, and a macro & commodities panel.
- **Modular template** — `src/dash/` modules assembled by `assemble_dashboard.py` (golden-master) with a full-script stubbed-DOM harness.
- **Fundamentals factsheet** — plain-English summary, vitals, data-derived fun fact, advisor scorecard, risk sections.
- **Rules-based ranking engine** — adjustable weights, thresholds, IF/THEN conditions, per-row explanations, presets, daily growth-core recompute.
- **Logging & debug** — structured per-run logs (`logs/`) and an opt-in in-page debug panel (`?debug=1` / Shift+D).
- **History & benchmark** — rolling household value vs Dow / Nasdaq / S&P, indexed to 100 from the switch-on date (no fabricated back-cast).
- **Drawdown timeline** — underwater vs each series' own running peak, with Normal / −10% / −20% bands.
- **Change alerts** — bear, death-cross, new 52-wk low, recovery (dq-guarded daily diff).
- **Dividend income calendar** — declared stock payments plus yield-based ETF/fund estimates, labelled *declared* or *estimated*.
- **Monte Carlo retirement projection** — seeded 10,000-path simulation; vol from the Parkinson 52-wk high/low estimator.
- **DCF valuation** — 3-stage (consensus → fade → rebuilt steady state), reverse-solve, calibrate-to-anchor, probabilistic range, drift monitor, normalized-margin lever, Trefis-style segment sum-of-the-parts.
- **Consensus-EBIT reconstruction** — corrupt `ebitAvg` (below net income) rebuilt at ingest and disclosed (`ebitRecon`).
- **Portfolio look-through** — true single-name exposure through funds; reconciliation gate; unmapped funds make every % a floor.
- **Earnings memos** — badge + popup for 30 days after a report; long-form memo under `reports/earnings/`.
- **Daily refresh** — `scripts/daily_refresh.md`; preserve-on-failure at every rung; both HTML copies written identically.

Everything is *rules-based analytics — not financial advice*.

### Data-provider invariants (do not re-litigate)

- **Never use FMP's `discountedCashFlow`.** Build DCFs from `analyst → financial-estimates` + filed `statements`. Compute `netDebt = totalDebt − cashAndShortTermInvestments`.
- Consensus `ebitAvg` can sit below consensus net income — reconstruct `EBIT = netIncome / (1 − tax)` at the aggregate gate (`ebitRecon`).
- Plan-gated: `quote-change`, `^NDX`/`QQQ` history (use `^IXIC`), per-symbol ETF dividend dates. `analyst` / `statements` / tearsheets throttle — sequential small batches.
- The live valuation anchor is **analyst target consensus** (`data/dcf_anchor.json`), a 12-month price target — not Morningstar Fair Value (no connector). Paste FVEs with `source: "Morningstar Fair Value"` to calibrate to them.
- Honesty gates **flag or refuse** when data does not reconcile — never force a number. External benchmark, not internal parity, is the acceptance test for a valuation.

---

## Backlog

Effort: **S** ≈ hours, **M** ≈ a day, **L** ≈ multi-day.

- [ ] **Saved side-by-side retirement scenarios** — **M**
  Adjustable assumptions (return, contribution, retirement age, withdrawal, inflation) with 2–3 saved scenarios rendered together. Client-side; localStorage to persist. Open: which levers; Monte Carlo vs deterministic overlay.

- [ ] **Tax-lot / cost-basis detail & realized-gain tracking** — **L**
  Needs a richer per-lot broker export (acquire date, qty, cost) plus a sell log. FIFO / specific-lot; lots drill-down. Official 1099-B stays authoritative for wash-sale.

- [ ] **Export to PDF / email digest** — **M** _(email needs a connector)_
  Portfolio summary, alerts, top rankings — on demand or after the 9am run. PDF-to-folder is deliverable without mail; emailing private holdings is a privacy decision.

- [ ] **Corporate Actions summary in the Fundamentals popup** — **M**
  Splits (already in `DATA.splits`), dividends, M&A where the tearsheet covers them. Spin-offs / ticker changes / delistings need a feed or a manual `data/corp_actions.json`.

- [ ] **Security hardening — authentication & access control**
  Before any live brokerage link. Single-owner local file today; holdings stay on disk.

- [ ] **GitHub source control & CI**
  Private remote, CI running `tests/run_all.sh`. Do not publish the HTML (it embeds private holdings).

- [ ] **Morningstar Fair Value as the live anchor**
  No connector exists. Until one does, paste FVEs into `data/dcf_anchor.json`. Do not treat analyst price targets as intrinsic value.

- [ ] **Capex glide + maintenance-capex vs acquisition amortization**
  Found during the DCF work; deferred until each has its own external benchmark. Do not ship a valuation change validated only internally.

- [ ] **Non-English glossary (i18n)**
  Drop-in `data/glossary/<lang>.json` + a language selector (`?lang=` / dropdown / `navigator.language`, English fallback). Number/date/currency localization is a separate stretch.

- [ ] **Measured vol / covariance for Monte Carlo**
  Store per-ticker daily closes for held names (batch-quote is already fetched daily) so the simulation uses measured risk instead of the 52-wk-range estimator.
