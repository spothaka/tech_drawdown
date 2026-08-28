const fs=require('fs');
const path=require('path');
// self-locating: DOCS_DIR = <project root>/docs  (project root = parent of scripts/)
const TDD_BASE = process.env.TDD_BASE || path.dirname(path.dirname(__dirname));
const DOCS_DIR = path.join(TDD_BASE, 'docs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType,
        BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType, PageNumber, Footer } = require('docx');
const BLUE="1F4E79", ACCENT="2E75B6", GREY="595959", LIGHT="EAF1F8";
// output written to DOCS_DIR (see above)

// curated, relevant phases only (noise + infra-troubleshooting phase removed; revalidation merged; live-pricing/automation/docs/organize added)
const PHASES=[
 {t:"Phase 1 — Stand up a live dashboard from a spreadsheet",
  g:"Turn an existing workbook into a self-updating, interactive dashboard.",
  u:["Create a dashboard from the spreadsheet and keep the data updated in real time."],
  r:"Create an interactive dashboard from [WORKBOOK/DATA SOURCE]. It should refresh automatically — use [LIVE FORMULA / API / CONNECTOR] for the data. Deliver it as a standalone HTML page, and set up an unattended way to refresh the source on a [daily/weekday] schedule.",
  n:"Clarify first: live page vs. static export; keep the spreadsheet's live pulls vs. snapshot the data."},

 {t:"Phase 2 — Add decision columns",
  g:"Convert raw data into actionable buy/sell signals.",
  u:["As a financial advisor, add a buy/sell recommendation column to each tab based on current market and economic conditions.",
     "Add drawdown-signal, % to recover, and analyst-consensus / forward-P/E columns."],
  r:"Add decision columns to each tab: [SIGNAL 1], [SIGNAL 2], [SIGNAL 3]. Derive them from [INPUTS], state the rule behind each, and label them clearly as informational, not advice."},

 {t:"Phase 3 — Structure the instrument universe (tabs)",
  g:"Get the right universe of instruments onto the right tabs.",
  u:["Add a Top-100 ETFs tab with the same columns.",
     "Change the sector tab to the full index (all sectors) and add tabs for Thematic ETFs and Mutual Funds."],
  r:"Restructure the tabs: remove [TAB], add a [UNIVERSE] tab with the same columns as [REFERENCE TAB], and expand [TAB] to cover [FULL INDEX/LIST]. Keep every tab's column layout consistent so they're comparable."},

 {t:"Phase 4 — Add technical-trend indicators (SMA + cross)",
  g:"Layer in moving-average trend and crossover signals.",
  u:["Add 200-day and 50-day SMA columns plus the % above/below each, for all tabs.",
     "Add a Golden Cross / Death Cross column from the 50- and 200-day SMAs."],
  r:"Add trend columns to every tab: [N]-day and [M]-day moving averages, the % the price sits above/below each, and a crossover signal (Golden/Death Cross) from the two. Compute them from [DATA SOURCE] and explain any approximation."},

 {t:"Phase 5 — Interactive drill-down (click-to-popup fundamentals)",
  g:"Make each row open a detail view with live company data.",
  u:["Show me a plan: when I click a ticker, open a popup with the company's live fundamentals — then build it.",
     "Make the popup work in both a live session and a saved HTML copy."],
  r:"When I click a [ticker/row], open a popup showing live [fundamentals/details] from [CONNECTOR] — [FIELDS]. Show me the plan first. Make it work in both a live session and a saved copy, and degrade gracefully when the connector isn't reachable."},

 {t:"Phase 6 — Rankings within sectors & categories",
  g:"Rank instruments within sectors and categories.",
  u:["When I click a sector, rank the companies in it using fundamentals + 50/200-day SMA.",
     "Add a category ranking for the ETF, Thematic, and Mutual Fund tabs."],
  r:"Rank [items] within each [group] using a blend of [FACTOR A] and [FACTOR B]. When I click a [group], expand it to show the ranked members with their scores. Load detail progressively so the page stays responsive, and tell me the weighting you used."},

 {t:"Phase 7 — Multi-factor risk modeling",
  g:"Summarize multi-dimensional risk per instrument.",
  u:["Add a risk-summary column built from World-Events, Financial, and Market factors.",
     "Add Credit, Liquidity, Operational, Climate, ESG, and Supply-Chain factors to the risk summary."],
  r:"Add a risk summary for [universe] built from these factors: [LIST]. Score each Low/Med/High with a one-line rationale, roll them into an overall rating, and degrade gracefully when a factor's data is missing. Use [financial ratios / news signals / ESG scores] as inputs and keep it rules-based.",
  n:"News-driven factors (supply chain, world events) were scored from the sentiment feed already fetched — no extra data calls."},

 {t:"Phase 8 — Recommendation scorecard",
  g:"Combine every signal into one defensible call.",
  u:["As a financial advisor, how do you make stock recommendations from the available data? — then: build it into the dashboard."],
  r:"Synthesize the dashboard's signals — [quality/valuation], [trend], [risk], [sentiment] — into a single recommendation (Buy/Add/Hold/Trim/Avoid) with a conviction level, an explicit 'signals agree vs. conflict' flag, a per-factor breakdown, and a 'what would change my mind' line. Require broad agreement for the strongest call.",
  n:"Ask the agent to explain its methodology, then say 'build it into the dashboard' — a fast way to turn expert reasoning into a feature."},

 {t:"Phase 9 — Performance & caching",
  g:"Keep live data fast and within rate limits.",
  u:["Cache the fundamentals per name in the browser and refresh only weekly, with a manual refresh."],
  r:"Cache [live data] per [item] in the browser with a [7-day / 1-day] expiry so it only refreshes when stale, and give me a manual 'refresh' control. Lazy-load detail only when a [row] is opened."},

 {t:"Phase 10 — Validation & fixing missing data (make it routine)",
  g:"Prove the numbers are right and backfill blanks with live data.",
  u:["Revalidate [TICKER] across all tabs.",
     "Revalidate [TICKERS] and fix missing data in the popup.",
     "Revalidate all tickers on [TAB] and fix missing data."],
  r:"Revalidate [TICKERS] end-to-end: resolve each to the correct entity (prefer an exact stock-listing match; alias tricky tickers such as GOOG → Alphabet), confirm prices/indicators against the source, and embed the metrics on the row. For a whole tab of blanks, add a 'Load live prices' button that backfills on demand (concurrency-limited) and caches.",
  n:"Revalidation caught real bugs — GOOG resolving to the wrong company, and a disruption keyword ('port') matching the word 'Report' and inflating supply-chain risk — both fixed and re-verified."},

 {t:"Phase 11 — Private portfolio workbooks from a broker export",
  g:"Turn a brokerage positions export into a self-contained, live portfolio workbook.",
  u:["Use [ACCOUNT].xlsx to build a private [ACCOUNT]_Portfolio.xlsx with live metrics."],
  r:"From my broker positions export [FILE] (Symbol, Quantity, Price Paid, Value), build a private [ACCOUNT]_Portfolio.xlsx: keep the four broker columns editable, then compute asset type, cost basis, live Current Price / 52-wk High / % off high / Status / 200- and 50-day SMA / Cross, plus Market Value, Gain/Loss, Weight and a summary block. Self-contained; recalculate to zero formula errors and write a short refresh guide.",
  n:"Treat Price Paid as average cost per share; handle CDs as price-per-100 par. The .xlsx export synced more reliably than CSV."},

 {t:"Phase 12 — Portfolio tabs on the dashboard",
  g:"Add a holdings-and-strategy tab per account, joined to the live universe metrics.",
  u:["Add a '[ACCOUNT] Portfolio' tab, joined to the live universe metrics, with clickable tickers."],
  r:"Add a '[ACCOUNT] Portfolio' tab: summary KPIs, an allocation donut, a gain/loss chart, and a holdings table joined to the live drawdown / status / cross metrics where the ticker is covered. Make tickers clickable to the existing fundamentals + risk + scorecard popup."},

 {t:"Phase 13 — Live portfolio pricing",
  g:"Value holdings at the current market price, not the imported snapshot.",
  u:["The market value isn't using the current price — value each holding at Quantity × live price.",
     "Add a 'Load live prices' button to the portfolio tabs and auto-load once per day; price off-index holdings live from the connector."],
  r:"On the portfolio tabs, value each holding at Market Value = Quantity × current live price (fall back to the imported value only for cash/CDs or when no live price exists). Add a 'Load live prices' button plus a once-per-day auto-load; pull each price from [CONNECTOR], resolving the exact listing and handling ETFs vs companies; cache per day and show an 'as of' stamp. Price off-index holdings (not in any universe tab) individually.",
  n:"Off-index holdings had no live fallback and showed stale values — pricing them individually from the connector fixed it."},

 {t:"Phase 14 — Retirement & income planning (role-based, two accounts)",
  g:"Model the household to a retirement date with per-account roles and a rebalance plan.",
  u:["I need the IRA for income after [N] years — project monthly income and a rebalance to maximize dividend and growth.",
     "Add the taxable account too — one income-focused, one growth-focused."],
  r:"Build a Retirement & Income view: project [ACCOUNTS] to a [N]-year horizon with contributions and returns, show the projected balance and monthly [dividend / withdrawal] income, and a role-based rebalancing plan per account ([income tilt] vs [growth tilt]) with per-holding trim/add/hold actions. Respect real constraints — contribution limits, no transfers into a tax-sheltered account except via contributions, tax-aware moves in taxable accounts. Illustrative and rules-based, not advice.",
  n:"Asset location: hold income assets in the tax-sheltered account and growth in the taxable one; each account rebalances toward its role internally."},

 {t:"Phase 15 — Rearrange layout & compare scenarios",
  g:"Reorganize where components live and add a scenario comparison.",
  u:["Move [component] from [tab] to [tab] and reorder the nav.",
     "Update the projection to compare Current Plan vs Rebalance Plan."],
  r:"Move [component] from [tab] to [tab] and reorder the nav so [tab] is [position]. Update the [chart] to compare [scenario A] vs [scenario B] with the difference called out in the tooltip."},

 {t:"Phase 16 — Live scorecard ranking (research → ranked shortlist)",
  g:"Turn an advisor question into a data-backed, ranked shortlist on the tab.",
  u:["As an advisor, which growth-core names are recommended for [ACCOUNT]? — then: run it."],
  r:"Rank [candidate list] on a transparent composite — [quality] + [valuation] + [trend] + [analyst] — using live data from [CONNECTOR]. Add the ranked shortlist (heat-colored scores + a one-line sizing read) to the [tab], show the methodology, and mark which names I already own."},

 {t:"Phase 17 — Automate the daily refresh (re-import + write HTML)",
  g:"Keep the dashboard current unattended without losing in-app data.",
  u:["Schedule the dashboard to refresh daily at [TIME].",
     "Have the daily task also re-import holdings from the source files — and never wipe holdings if a file isn't readable."],
  r:"Schedule a daily job that regenerates the dashboard from the workbook and writes the HTML files at [TIME]. Re-import holdings from the source exports, refresh off-index prices from [CONNECTOR], and preserve the in-app [portfolio / scorecard] data. Gate every input with integrity checks — skip-and-preserve rather than fail — never blank a holding, and report each run's sync status.",
  n:"Any 'regenerate from the source' step must carry over app-only data or those tabs render blank — this bug happened once and is now baked into the task. Scheduled tasks run only while the app is open; click 'Run now' once to pre-approve the connector."},

 {t:"Phase 18 — Document the system",
  g:"Produce durable architecture and requirements documentation.",
  u:["Generate architecture & design docs with process and workflow diagrams (Word + HTML).",
     "Create a Business Requirements Document (BRD)."],
  r:"Produce [architecture / BRD / runbook] documentation as [Word + HTML]: [sections]. Ground it in the actual code and config (verify names, paths, and data shapes), include [diagrams], and provide both a technical deep-dive and an executive summary.",
  n:"Embed diagrams as images for a self-contained HTML that always renders, rather than relying on a client-side diagram library."},

 {t:"Phase 19 — Organize the project",
  g:"Move to a clean, self-documenting folder hierarchy.",
  u:["Update the project hierarchy to a clean structure with subfolders.",
     "Persist the build scripts into the project and update the automation's paths."],
  r:"Reorganize the project into concern-based subfolders ([data / dashboard / docs / scripts / …]) with a README. Move files, update any absolute paths referenced by automation so nothing breaks, and persist the build scripts with project-relative paths."},

 {t:"Phase 20 — Make the ranking a customizable rules engine",
  g:"Replace hard-coded scoring with a declarative, editable rules engine — without changing the numbers on day one.",
  u:["Show a plan to convert the live score ranking to a rules-based engine I can customize.",
     "Add an editor (weights, thresholds), then IF/THEN conditions, then let the daily task recompute the shortlist."],
  r:"Extract the current [ranking] scoring into a declarative ruleset (factors, weights, thresholds, dimensions) and a pure engine, proven to reproduce today's output exactly with a golden-master test. Then add, in phases: an in-artifact editor (weight sliders, editable thresholds) with live re-rank and per-row score explanations; IF/THEN conditions (exclude / bonus / penalty / cap / floor); presets and export/import; and a daily recompute — each phase inert-by-default so baselines never move and every change is test-guarded.",
  n:"Keep the engine pure and in one source folder; materialize it into the artifact from a single source of truth with a drift check, so the browser and the tests never diverge."},

 {t:"Phase 21 — Isolate the data provider behind an adapter",
  g:"Make a provider or response-shape change a one-place edit after repeated breakages.",
  u:["The connector's response shape changed and broke ticker resolution — fix it.",
     "Build a provider-agnostic adapter; evaluate alternatives to the current connector."],
  r:"Route every data-connector call and all response parsing through one adapter object: endpoints named once, and a normalized output per capability (resolve, quote, fundamentals, ETF metrics, sentiment). Call sites consume normalized objects only — no direct connector calls remain — so a provider swap or a response-shape change is a one-place edit. Cache misses briefly (retry soon), never long, so one transient failure can't poison a symbol for days.",
  n:"Evaluate alternative providers against your actual plan/tier before committing — gated endpoints can make a 'drop-in' replacement unusable."},

 {t:"Phase 22 — Market-context Overview (spectrum + 1-year charts)",
  g:"Turn a flat list into a scannable market-context view: where names sit, and how the wider market is moving.",
  u:["Replace the unified table with best / correction / worst columns, equities and ETFs, with an index-membership tag on each ticker.",
     "Add 1-year charts like the US indices for oil, gold, USD vs four currencies, metals, and consumer sentiment — show me a plan and a mockup first."],
  r:"Rebuild the overview as a [3-column health spectrum] (best-performing / in-correction / worst-drawdown), merging [equities and ETFs] with a per-row [index-membership] chip and a bar colored by bucket. Add own-scale 1-year sparkline tiles for [indices] and a [macro & commodities] card ([oil, gold, silver, copper, rare earths, USD vs major currencies, consumer sentiment]); build each series as a pure transform that downsamples to [weekly], embed it as a data key (no runtime calls), and preserve-and-carry-forward on any gated/failed feed so a tile never blanks.",
  n:"Plan-and-mockup each layout change before building; some market series (e.g., Nasdaq-100, single commodities, consumer sentiment) may be gated on your data plan — omit-and-hide gracefully, use a labeled ETF proxy where no direct series exists (rare earths → REMX), and orient FX consistently (invert pairs so 'up' always means a stronger dollar)."},

 {t:"Phase 23 — Split the monolith into maintainable modules",
  g:"Make a fragile single-file build safe to edit without touching a giant file.",
  u:["The template is too big and fragile to edit — split it by concern.",
     "Keep the deployed artifact a single self-contained file."],
  r:"Split the single-file [artifact] into concern-based source modules and add a build step that concatenates them back into one self-contained file, guarded by a byte-for-byte golden-master so the refactor changes nothing. Wire the assembler into the existing rebuild path; keep any generated block (e.g. a rules engine) regenerated from its own source. Do the extraction with scripting, not hand-edits, and verify each step.",
  n:"A pure re-slice is proven by the golden-master hash — reserve the DOM/runtime harness for real content changes. Watch for footguns when a tool scans its own arguments (a target filter that matched the script's own path once made it overwrite itself)."},

 {t:"Phase 24 — Factsheet + a fun fact in the fundamentals popup",
  g:"Open each security with a friendly, plain-English summary — not just ratios.",
  u:["Add a company/ETF factsheet summary to the fundamentals popup.",
     "Include a fun fact if possible."],
  r:"At the top of the [detail popup], add a factsheet: a short plain-English summary, a compact vitals grid, and a data-derived 'Did you know?' line built from fields you already fetch (founded-age, market-cap milestone, fee-per-$10k, holdings) with a safe fallback so it always renders. Probe the live response shapes first, then write the parser defensively around what you actually see.",
  n:"Prefer data-derived facts over an LLM call so the line never fails; the resolver and overview sections often already carry a description, sector, HQ, and founding year you can reuse."},

 {t:"Phase 25 — Logging & a debug view (make it diagnosable)",
  g:"Turn ephemeral run output and silent client errors into a persistent, inspectable trail.",
  u:["Add structured run logs to the daily task so I can see what happened after the fact.",
     "Add an opt-in debug panel to the app that shows connector calls, data provenance, and errors."],
  r:"Add two layers of observability. Pipeline: a small leveled logger that writes a per-run [JSONL] event stream + a human report + an append-only history under [logs/], wired into the scheduled task (with each caught fallback recorded), auto-pruned. Client: an opt-in in-app debug panel (enable via [?debug=1 or a key combo], off by default, near-zero cost) with a ring buffer + global error handlers, tabs for events / data provenance / cache / environment, and a one-click copy-report. Instrument the single connector chokepoint so every call is timed and logged.",
  n:"Keep the client logger cheap when off (buffer only, gate console/render); route all connector I/O through one function so a single wrap covers every call. Persist run logs outside the deployed artifact so a failed run is still diagnosable."},

 {t:"Phase 26 — Keep a history (the enabler for every time-based view)",
  g:"Escape the point-in-time trap: a snapshot dashboard cannot answer 'versus what?' or 'since when?'.",
  u:["My dashboard only knows today. Start recording a daily history so I can build trend views later.",
     "Append one record per day — total value and per-account — and embed it in the page."],
  r:"Before building any chart that needs time, build the time. Add a small pure transform that appends ONE record per day ([{date, total, per-account}]) to a JSON file on disk, and embed the accumulated list into the page as a data key. Make it IDEMPOTENT PER DATE — re-running the same day overwrites, never duplicates — so a manual re-run is always safe. Compute the values from data the pipeline has ALREADY merged (the holdings), not from a fresh call, so the history can never drift from what the portfolio tabs show.",
  n:"Start recording before you need it — a history you begin today is worth more than a perfect design you begin next month. Household-level totals are enough to unlock a benchmark; per-ticker history is a much bigger data commitment, so defer it until a view actually demands it. Never let this step fail the run: preserve the prior series and carry on."},

 {t:"Phase 27 — Benchmark the portfolio against the market",
  g:"Answer the only question that matters about performance: am I beating the index, or just riding it?",
  u:["Add a card that compares my portfolio against the Dow, Nasdaq and S&P over the last year.",
     "Index everything to 100 at the start so the lines are comparable, and show the alpha."],
  r:"Index the household value and each benchmark to 100 at a common start date and overlay them; show the gap (alpha) as a live readout. Handle the cold-start honestly: on day one there is only ONE point of portfolio history, so render a CONTEXT mode (the real index curves + trailing returns) and auto-switch to a rebased head-to-head once two or more points exist. Resist the temptation to back-cast the portfolio from today's holdings — that invents a past the owner never actually held, and it always flatters.",
  n:"The honest empty state beat the impressive fake one. A back-cast would have looked better on day one and been wrong forever; the accruing line was worth the wait. Also check what your data plan actually allows before designing — the per-holding trailing-return endpoint was gated, which forced (and improved) this decision."},

 {t:"Phase 28 — Drawdown timeline (an underwater chart)",
  g:"Show not just how far down a thing is, but how long it has been down — and how that compares to history.",
  u:["Add an underwater chart: how far below its own running peak is the portfolio, and each index, over the past year?",
     "Shade the Correction and Bear bands so I can see when it crossed the line."],
  r:"Plot each series' drawdown from its OWN running peak (0% = at a record high, negative = below it) rather than raw price, so series of wildly different scales become directly comparable. Shade the status bands (Correction at -10%, Bear at -20%) as chart backgrounds so a crossing is visible at a glance, and put the current and worst-of-year drawdown in the legend. The same transform works for an index and for a portfolio, so write it once.",
  n:"Normalizing to 'distance below your own peak' is the trick that makes a $50,000 index and a $600,000 portfolio comparable on one axis. Users found this more intuitive than an indexed-to-100 price overlay — 'how far underwater' needs no explanation."},

 {t:"Phase 29 — Change alerts (what moved since yesterday?)",
  g:"Stop making the owner re-scan the whole board every morning to find the two things that changed.",
  u:["Tell me what changed on my holdings since yesterday — new Bear, Death Cross, recovery, new 52-week low.",
     "Show it as an icon next to the ticker, not another banner, and let me click it for the detail."],
  r:"Diff yesterday's snapshot against today's on the fields you ALREADY have (status, cross, 52-week low) — this needs ZERO new data calls. Append each transition to a rolling store and surface the recent ones as a small colour-coded icon beside the ticker, click-through to a from→to detail and history. Crucially, GUARD IT WITH YOUR DATA-QUALITY FLAG: skip any row the integrity check marked suspect, or a single corrupt price will fabricate a Death Cross and destroy trust in every alert you ever send.",
  n:"An alert system that cries wolf once is worse than none at all — wiring the dq-guard in from the start was the whole ballgame. Also: the owner asked for an inline icon, NOT a 'what changed' strip; ask where the signal should live before you build the container."},

 {t:"Phase 30 — Dividend income calendar (degrade honestly)",
  g:"Turn 'what do I own?' into 'what will it pay me, and when?' — the question an income portfolio actually exists to answer.",
  u:["Build a forward 12-month dividend calendar across my holdings — projected annual income, forward yield, next 30 days.",
     "Chart it by month, split by account, and list the upcoming payments."],
  r:"PROBE THE DATA SOURCE BEFORE DESIGNING THE UI. Here the per-symbol dividend endpoint returned exact ex/record/pay dates for STOCKS but was plan-gated for ETFs — and the ETFs were the income engine. Rather than abandon the feature or quietly fake the gap, build it in TWO TIERS: Tier 1 (declared) = exact dates and amounts from the feed; Tier 2 (estimated) = yield × market value, spread by a cadence you declare in a small seed file, placed at month level. Then LABEL THE DIFFERENCE IN THE UI — declared rows green with a real date, estimated rows amber and marked 'estimated'.",
  n:"A gated data source is a design constraint, not a blocker. The two-tier pattern — exact where you can, clearly-labelled estimate where you cannot — shipped a useful feature without ever lying to the user, and it degrades gracefully when a tier disappears. Generalize this: any feature that depends on a data source you do not control needs a labelled fallback tier. Postscript: what looked like a plan gate on the stock endpoint turned out to be THROTTLING under parallel load — before you design around a limitation, call the endpoint slowly and sequentially once to check the limitation is real."},

 {t:"Phase 31 — Monte Carlo (replace the single line with a distribution)",
  g:"A retirement projection that shows one deterministic line implies a certainty that does not exist.",
  u:["Can we build a Monte Carlo simulation of the household?",
     "Show me a mockup first.",
     "Let's build it with the median at year 10 on the tile."],
  r:"Simulate thousands of paths and show the MEDIAN plus percentile bands, not an average and not a single line. Two constraints make it cheap: SEED THE RANDOM NUMBER GENERATOR (a projection that changes every time you open it is not a projection, it is a slot machine), and derive volatility from data you ALREADY hold — the Parkinson estimator turns a 52-week high/low into a usable volatility estimate, so the feature needs no new data source at all. Memoize the median so the KPI tile is free to render.",
  n:"Look hard at what your existing data can already tell you before you go shopping for a new feed. The 52-week high/low was sitting in every row of the table; it was one estimator away from being a volatility model."},

 {t:"Phase 32 — DCF valuation (the one I shipped wrong three times)",
  g:"Answer the question the whole dashboard implies but never answers: is this thing actually worth what it costs?",
  u:["Show me a plan to build a DCF.",
     "The model says overvalued but Morningstar says undervalued — show me how you got the fair value.",
     "Still not fixed. NVDA: Morningstar says $280, the model says $43. That is a huge difference.",
     "Way too low compared to Morningstar and other industry-standard valuators."],
  r:"DO NOT USE YOUR PROVIDER'S READY-MADE DCF ENDPOINT. It is not data, it is somebody else's model with hidden assumptions — this one mean-reverted every projection ratio (margin, capex, working capital) to a five-year historical average, which silently punishes any company whose economics improved, and derived its discount rate from a raw trailing beta. Build the model yourself from PRIMARY data: analyst consensus for the forward path, filed statements for the base. Then: fade growth and capex over ~10 years rather than dropping straight to terminal (a growth company does not go from 36% to 3% in one year), and REBUILD the terminal cash flow from normalised inputs instead of growing the last projected year — otherwise the terminal value inherits peak capex and the working capital needed to fund growth that has, by definition, stopped. Expose every judgement input as a control. Add a reverse DCF so the user can see what the market is assuming.",
  n:"THE REAL LESSON IS THE PROCESS FAILURE. I shipped this three times, each time 'verified' by an internal parity check against the vendor's own model — which only ever proved I had faithfully reproduced a flawed model. It took the owner comparing it to Morningstar to expose it. AN EXTERNAL BENCHMARK IS THE ONLY ACCEPTANCE TEST THAT MEANS ANYTHING for a number a user could act on; internal consistency is not correctness. Two more traps found the hard way: the provider's netDebt field ignored short-term investments (it reported one company as carrying net debt when it actually held $51B of NET CASH — always compute totalDebt minus cash AND short-term investments), and one company had filed a NEGATIVE effective tax rate, which sailed straight through into the model."},

 {t:"Phase 33 — Segment sum-of-the-parts (refuse to render broken data)",
  g:"Value each business line separately, so the user can see which segment the price is really paying for.",
  u:["Can we do more on price analysis, based on the Trefis model?",
     "Yes, build it — and default the segment margins all equal to the company margin."],
  r:"Have segments INHERIT the company's consensus path and margin by default, so the sum-of-the-parts reconciles EXACTLY to the total valuation on day one; the user then edits one segment's margin and immediately sees what that assumption is worth. Before rendering, check the filed segments actually sum to reported revenue. If they do not, REFUSE TO SHOW THE VIEW and say why.",
  n:"That reconciliation check earned its keep immediately: one issuer files overlapping segment lines that double-count revenue ($38.5B of segments against $34.6B reported). A valuation built on a 12% revenue overstatement looks entirely plausible and is entirely wrong. Refusing to render, with an explanation, is a feature — not a failure."},

 {t:"Phase 34 — Portfolio look-through (make the hidden concentration visible)",
  g:"Answer 'what do I ACTUALLY own?' — the single-name risk that arrives through funds rather than through shares.",
  u:["What's the next high-value feature we can build?",
     "Yes, plan the look-through.",
     "I'd prefer a KPI tile on the Retirement tab."],
  r:"Decompose each held fund into its underlying holdings and combine that with the directly held shares. The whole feature lives or dies on ITS TREATMENT OF GAPS: store each fund's top-N holdings and put the long tail in an explicit remainder bucket; make cash-inside-funds its own bucket; make a fund you could not map its own bucket. Then enforce a RECONCILIATION GATE — named + remainder + cash + unmapped must equal the household total to the dollar — and while any fund is unmapped, present every exposure as a FLOOR ('at least X%'), never a total.",
  n:"A look-through that hides its gaps understates the exact concentration it exists to reveal — so the honesty rules ARE the feature. The reconciliation gate also doubles as a free regression test forever after. And the result justified the build: it surfaced a company the household owns zero shares of directly, yet holds several percent of through six different funds, plus three separate S&P 500 trackers held side by side."},
];

function build(mode){ // mode: 'internal' | 'public'
  const internal = mode==='internal';
  const H1=t=>new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun(t)]});
  const H2=t=>new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun(t)]});
  const H3=t=>new Paragraph({heading:HeadingLevel.HEADING_3,children:[new TextRun(t)]});
  const P=(t,opt={})=>new Paragraph({spacing:{after:120},children:[new TextRun({text:t,...opt})]});
  const runs=(arr,opt={})=>new Paragraph({spacing:{after:120},...opt,children:arr});
  const bullet=t=>new Paragraph({numbering:{reference:"b",level:0},spacing:{after:60},children:Array.isArray(t)?t:[new TextRun(t)]});
  const goal=t=>new Paragraph({spacing:{after:80},children:[new TextRun({text:"Goal:  ",bold:true,color:BLUE}),new TextRun({text:t})]});
  const spacer=()=>new Paragraph({spacing:{after:120},children:[new TextRun("")]});
  const note=t=>new Paragraph({spacing:{after:120},children:[new TextRun({text:t,italics:true,color:GREY,size:20})]});
  function callout(label,text){ return new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
    borders:{ top:{style:BorderStyle.SINGLE,size:2,color:ACCENT}, bottom:{style:BorderStyle.SINGLE,size:2,color:ACCENT},
              left:{style:BorderStyle.SINGLE,size:12,color:ACCENT}, right:{style:BorderStyle.SINGLE,size:2,color:ACCENT},
              insideHorizontal:{style:BorderStyle.NONE},insideVertical:{style:BorderStyle.NONE}},
    rows:[ new TableRow({children:[ new TableCell({ width:{size:9360,type:WidthType.DXA},
        shading:{fill:LIGHT,type:ShadingType.CLEAR}, margins:{top:100,bottom:100,left:160,right:160},
        children:[ new Paragraph({spacing:{after:40},children:[new TextRun({text:label,bold:true,color:BLUE,size:20})]}),
                   new Paragraph({children:[new TextRun({text:text,italics:true})]}) ]})]})] }); }

  const k=[];
  // Title
  k.push(new Paragraph({spacing:{after:40},children:[new TextRun({text:"Prompt Playbook",bold:true,color:BLUE,size:52})]}));
  k.push(new Paragraph({spacing:{after:40},children:[new TextRun({text:"Building a Live Market Dashboard with an AI Agent"+(internal?"":" — Shareable Edition"),color:GREY,size:28})]}));
  k.push(new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:6,color:ACCENT,space:6}},spacing:{after:160},children:[new TextRun({text:"A reusable, phase-by-phase guide of prompt templates for building a live, data-driven dashboard",italics:true,color:GREY,size:22})]}));
  if(internal) k.push(runs([new TextRun({text:"Prepared for: ",bold:true}),new TextRun("Sunil Pothakamuri  ·  "),new TextRun({text:"Use: ",bold:true}),new TextRun("AI-adoption enablement / client engagements  ·  "),new TextRun({text:"Date: ",bold:true}),new TextRun("August 2026")]));
  else k.push(runs([new TextRun({text:"A shareable framework of reusable prompt templates for building a live, data-driven dashboard with an AI agent.",italics:true,color:GREY})]));

  k.push(H2("What this playbook is"));
  k.push(P(internal
    ? "This document captures the prompt sequence used to build a production-style financial dashboard with an AI agent — from a single spreadsheet to a live, interactive page with technical indicators, drill-down fundamentals, an eight-factor risk model, a rules-based scorecard, live portfolio pricing, and an automated daily refresh."
    : "This document is a reusable, phase-by-phase framework of prompt templates for building a production-style, data-driven dashboard with an AI agent — from a single spreadsheet to a live, interactive page with technical indicators, drill-down fundamentals, a multi-factor risk model, a rules-based scorecard, live portfolio pricing, and an automated daily refresh."));
  k.push(P(internal
    ? "Each phase lists the relevant prompts, then generalizes them into a reusable template you can adapt. The goal is repeatability: a teammate should be able to reproduce a comparable build by working down these prompts."
    : "Each phase states its goal and a reusable, fill-in-the-blank prompt template you can adapt. The goal is repeatability: a teammate should be able to reproduce a comparable build by working down these prompts."));

  k.push(H2("How to use it"));
  k.push(bullet("Work top-to-bottom. The phases are ordered by dependency — data first, then columns, then interactivity, then intelligence, then automation."));
  k.push(bullet([new TextRun("Replace the "),new TextRun({text:"[BRACKETED]",bold:true}),new TextRun(" placeholders with your specifics (data source, tickers, columns, thresholds).")]));
  k.push(bullet("Let the agent ask clarifying questions before it builds — answering them up front is what kept rework low."));
  k.push(bullet("Ask for a plan on anything non-trivial, approve it, then say “build it.”"));

  k.push(H1("The working approach"));
  k.push(P("Five habits did most of the heavy lifting across every phase:"));
  k.push(bullet([new TextRun({text:"Clarify, then build. ",bold:true}),new TextRun("A couple of pointed multiple-choice questions before each major step prevented building the wrong thing.")]));
  k.push(bullet([new TextRun({text:"Probe the data before coding. ",bold:true}),new TextRun("For anything pulling from a live connector, call the tool once and inspect the real response shape before writing code against it.")]));
  k.push(bullet([new TextRun({text:"Plan → approve → implement. ",bold:true}),new TextRun("Bigger features started as a written plan you signed off on.")]));
  k.push(bullet([new TextRun({text:"Verify every change. ",bold:true}),new TextRun("After each edit, integrity-check the file and unit-test the new logic with real and synthetic data before publishing.")]));
  k.push(bullet([new TextRun({text:"Iterate in small, reversible steps. ",bold:true}),new TextRun("One capability per prompt, validated, then the next — rather than one giant request.")]));

  k.push(H1("The prompt library, phase by phase"));
  PHASES.forEach(ph=>{
    k.push(H2(ph.t));
    k.push(goal(ph.g));
    if(internal){ k.push(P("Prompts used:",{bold:true,color:GREY})); ph.u.forEach(p=>k.push(bullet([new TextRun({text:"“"+p+"”",italics:true})]))); }
    if(ph.n) k.push(note(ph.n));
    k.push(callout("Reusable prompt",ph.r));
    k.push(spacer());
  });

  // Operating the dashboard
  k.push(H1("Operating the dashboard — update & run"));
  k.push(P("How the data flows, and how to keep it fresh without losing your portfolio data."));
  k.push(H3("Where the data lives"));
  k.push(bullet([new TextRun({text:"Sources ",bold:true}),new TextRun("live in data/ — the market workbook and the flat holdings exports.")]));
  k.push(bullet([new TextRun({text:"Universe tabs ",bold:true}),new TextRun("are rebuilt from the workbook's six sheets; the deployed dashboard lives in dashboard/.")]));
  k.push(bullet([new TextRun({text:"Portfolio + scorecard ",bold:true}),new TextRun("(the ira, brokerage and coreRank keys) live inside the dashboard's own DATA object — NOT in the workbook.")]));
  k.push(H3("Refresh & automation"));
  k.push(bullet("Nothing manual for market data: the daily task pulls the whole universe live from the FMP connector (the workbook is now only a fallback and needs no Excel-365 refresh)."));
  k.push(bullet("A daily 9am refresh regenerates the tabs, re-imports holdings from data/, reprices off-index names, and writes both HTML copies — preserving the in-app portfolio/scorecard data and skipping safely if a source file is unreadable."));
  k.push(H3("Update your holdings"));
  k.push(bullet("Edit the flat exports in data/ (Symbol, Quantity, Price Paid, Value); the next run re-imports them and prices any new off-index names automatically."));
  k.push(runs([new TextRun({text:"Critical rule: ",bold:true,color:BLUE}),new TextRun("any 'regenerate from the source' step must carry over ira, brokerage and coreRank, or those tabs render blank. It is baked into the scheduled task.")]));
  k.push(callout("Reusable prompt","Schedule the dashboard to regenerate from the workbook and write the HTML files daily at [TIME], preserving the in-app [portfolio / scorecard] data — abort rather than dropping it — and keep integrity checks (skip the run if a file is open or half-saved)."));
  k.push(spacer());

  // Lessons
  k.push(H1("Lessons learned (carry these into the next build)"));
  [["Answer the clarifying questions. ","Two minutes of upfront choices saved hours of rebuilding."],
   ["Ask for a plan on big features. ","“Show me a plan” before “build it” made scope explicit and easy to adjust."],
   ["Make validation routine. ","Real-data spot-checks (the “revalidate [ticker]” prompt) are where bugs surface."],
   ["Price from the live source, not a snapshot. ","Off-index holdings valued from a stale import were wrong until priced individually from the connector."],
   ["Keep the connector behind a thin adapter. ","Isolating the data provider makes it swappable without touching the UI or data model."],
   ["Frame intelligence as rules-based, not advice. ","Every signal states its rule and carries a “not financial advice” label."],
   ["Write both HTML copies after every change. ","The dashboard on disk is the deliverable — regenerating the template is not enough until DATA is injected into both copies."],
   ["Guard scheduled jobs against clobbering in-app data. ","An auto-refresh that rebuilds from the source must preserve anything that lives only in the app."],
   ["Organize and document as you go. ","A clean subfolder layout, a README, and architecture/BRD docs keep the project reproducible and shareable."],
   ["Benchmark externally, or you have not tested anything. ","The DCF passed its internal parity check three times while being badly wrong. Internal consistency is not correctness: any number a user could act on needs an INDEPENDENT reference before it ships."],
   ["Never let a vendor's model be your data. ","A ready-made endpoint that returns an answer rather than facts is somebody else's assumptions wearing your logo. Build models from primary data you can inspect."],
   ["Make the gaps first-class. ","Explicit 'unmapped', 'remainder' and 'estimated' buckets — plus a reconciliation gate that must sum to the total — turn an incomplete feature into an honest one, and give you a permanent regression test for free."],
   ["Verify the way the thing actually runs. ","A syntax check passes on a silently truncated file, and a byte-perfect build check will faithfully rebuild the corruption. Only running the whole script against a stubbed DOM caught it."]
  ].forEach(([b,t])=>k.push(bullet([new TextRun({text:b,bold:true}),new TextRun(t)])));

  // Quick-copy
  k.push(H1("Quick-copy starter prompts"));
  k.push(P("Generic, one-line versions you can paste and fill in:"));
  [ "Create an interactive, auto-refreshing dashboard from [DATA SOURCE], delivered as a standalone HTML page.",
    "Add decision columns ([SIGNALS]) derived from [INPUTS]; label them informational, not advice.",
    "Add [N]- and [M]-day SMAs, % vs each, and a Golden/Death Cross column to every tab.",
    "Make every [row] open a popup with live [details] from [CONNECTOR]; show me the plan first.",
    "Rank [items] within each [group] using [FACTOR A] + [FACTOR B]; expand on click; tell me the weighting.",
    "Add a risk summary built from [FACTORS], each Low/Med/High with a rationale, rolled into an overall rating.",
    "Synthesize [signals] into one Buy/Add/Hold/Trim/Avoid call with conviction and an agree/conflict flag.",
    "Cache [live data] per [item] with a [N]-day expiry plus a manual refresh; lazy-load detail on open.",
    "Revalidate [TICKERS] end-to-end against the source and fix any missing data; add a 'Load live prices' button for whole-tab blanks.",
    "From my broker export [FILE], build a private [ACCOUNT]_Portfolio.xlsx with live metrics; validate zero formula errors + a refresh guide.",
    "Add a '[ACCOUNT] Portfolio' tab joined to the live metrics, with clickable tickers.",
    "Value holdings at Quantity × live price; add a 'Load live prices' button + daily auto-load; price off-index names from [CONNECTOR].",
    "Build a Retirement & Income view for [ACCOUNTS] over [N] years — per-account roles + rebalance plan; illustrative, not advice.",
    "Rank [candidates] on quality + valuation + trend + analyst; add the ranked shortlist to [tab].",
    "Schedule a daily job to re-import holdings, reprice, and write the HTML files at [TIME] — preserving in-app data, never blanking a holding.",
    "Produce [architecture / BRD] docs as Word + HTML, grounded in the code, with diagrams and an executive summary.",
    "Reorganize the project into concern-based subfolders with a README; update automation paths so nothing breaks.",
  ].forEach(t=>k.push(bullet([new TextRun({text:t,italics:true})])));

  k.push(spacer());
  k.push(new Paragraph({border:{top:{style:BorderStyle.SINGLE,size:4,color:"CCCCCC",space:6}},spacing:{before:120},children:[new TextRun({text:"Signals and recommendations described here are rules-based and informational — not financial advice.",italics:true,color:GREY,size:18})]}));

  const doc=new Document({
    styles:{ default:{document:{run:{font:"Arial",size:22}}},
      paragraphStyles:[
        {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,
          run:{size:30,bold:true,color:BLUE,font:"Arial"},
          paragraph:{spacing:{before:300,after:160},outlineLevel:0,border:{bottom:{style:BorderStyle.SINGLE,size:4,color:ACCENT,space:4}}}},
        {id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,
          run:{size:25,bold:true,color:BLUE,font:"Arial"},paragraph:{spacing:{before:220,after:100},outlineLevel:1}},
        {id:"Heading3",name:"Heading 3",basedOn:"Normal",next:"Normal",quickFormat:true,
          run:{size:22,bold:true,color:GREY,font:"Arial"},paragraph:{spacing:{before:160,after:80},outlineLevel:2}},
      ]},
    numbering:{config:[{reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,
      style:{paragraph:{indent:{left:560,hanging:280}}}}]}]},
    sections:[{ properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440}}},
      footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,
        children:[new TextRun({text:"Prompt Playbook"+(internal?"":" (Shareable)")+" · Live Market Dashboard · Page ",size:16,color:GREY}),
                  new TextRun({children:[PageNumber.CURRENT],size:16,color:GREY})]})]})},
      children:k }]
  });
  const name = internal ? "Dashboard_Prompt_Playbook.docx" : "Dashboard_Prompt_Playbook_Public.docx";
  return Packer.toBuffer(doc).then(b=>{fs.writeFileSync(path.join(DOCS_DIR,name),b);console.log(name,b.length,"bytes");});
}

Promise.all([build('internal'),build('public')]).then(()=>console.log("done"));
