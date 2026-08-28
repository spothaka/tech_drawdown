const fs=require('fs');
const path=require('path');
const TDD_BASE=process.env.TDD_BASE||path.dirname(path.dirname(__dirname));
const DOCS_DIR=path.join(TDD_BASE,'docs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, PageBreak, TableOfContents } = require('docx');

const INK="1F2937", GOLD="E0A106", DGOLD="B07D04", BLUE="2E75B6", GRAY="6B7280", RED="C0392B";
const CW=9360;
const H1=t=>new Paragraph({heading:HeadingLevel.HEADING_1, children:[new TextRun(t)]});
const H3=t=>new Paragraph({heading:HeadingLevel.HEADING_3, children:[new TextRun(t)]});
function P(runs){ if(typeof runs==='string') runs=[new TextRun({text:runs,size:22})];
  return new Paragraph({spacing:{after:120}, children:runs}); }
const T=(t,o={})=>new TextRun(Object.assign({text:t,size:22},o));
const C=t=>new TextRun({text:t,font:"Consolas",size:20,color:"B02A00"});
function bullet(runs){ if(typeof runs==='string') runs=[new TextRun({text:runs,size:22})];
  return new Paragraph({numbering:{reference:"b",level:0}, spacing:{after:60}, children:runs}); }
const border={style:BorderStyle.SINGLE,size:1,color:"CCCCCC"};
const borders={top:border,bottom:border,left:border,right:border};
function mkCell(kids,w,fill){ return new TableCell({borders,width:{size:w,type:WidthType.DXA},
  shading:{fill:fill,type:ShadingType.CLEAR}, margins:{top:60,bottom:60,left:110,right:110},
  children:[new Paragraph({children:kids})]}); }
function rtable(widths, header, rows){
  const hr=new TableRow({tableHeader:true, children:header.map((t,ci)=>
    mkCell([new TextRun({text:t,bold:true,color:"FFFFFF",size:19})], widths[ci], INK))});
  const trs=rows.map((r,i)=>new TableRow({children:r.map((runs,ci)=>
    mkCell(Array.isArray(runs)?runs:[T(runs)], widths[ci], i%2===1?"FBFAF6":"FFFFFF"))}));
  return new Table({width:{size:CW,type:WidthType.DXA},columnWidths:widths,rows:[hr,...trs]});
}
const PRICOL={Must:RED,Should:BLUE,Could:GRAY};
function req(id,pri,text){
  return new Paragraph({spacing:{after:100}, border:{left:{style:BorderStyle.SINGLE,size:14,color:BLUE,space:8}},
    children:[
      new TextRun({text:id+"  ",bold:true,color:BLUE,size:22}),
      new TextRun({text:"["+pri+"] ",bold:true,color:PRICOL[pri],size:18}),
      new TextRun({text:"— "+text,size:22})
    ]});
}

const c=[];
// Title
c.push(new Paragraph({spacing:{before:1400,after:0},
  border:{bottom:{style:BorderStyle.SINGLE,size:18,color:GOLD,space:8}},
  children:[new TextRun({text:"Business Requirements Document",bold:true,size:48,color:INK})]}));
c.push(new Paragraph({spacing:{before:120},children:[new TextRun({text:"Tech Drawdown",bold:true,size:40,color:DGOLD})]}));
c.push(new Paragraph({spacing:{before:160},children:[new TextRun({text:"Market-drawdown dashboard, private portfolio tracking, retirement planning & equity valuation",size:24,color:GRAY})]}));
c.push(new Paragraph({spacing:{before:400},children:[new TextRun({text:"BASELINE v1.0",bold:true,size:18,color:GOLD})]}));
c.push(new Paragraph({spacing:{before:40},children:[new TextRun({text:"Prepared for Sunil · rules-based analytics, not financial advice",size:18,color:GRAY})]}));
c.push(new Paragraph({children:[new PageBreak()]}));
// TOC
c.push(new Paragraph({spacing:{after:120},children:[new TextRun({text:"Contents",bold:true,size:28,color:INK})]}));
c.push(new TableOfContents("Contents",{hyperlink:true,headingStyleRange:"1-1"}));
c.push(new Paragraph({children:[new PageBreak()]}));

// 1 Document Control
c.push(H1("1 · Document Control"));
c.push(rtable([2600,6760],["Field","Detail"],[
 [[T("Document title")],[T("Tech Drawdown — Business Requirements Document")]],
 [[T("Version")],[T("1.0 (Baseline v1.0 — current shipped scope)")]],
 [[T("Status")],[T("Baseline — v1.0 starting point")]],
 [[T("Author / Owner")],[T("Sunil")]],
 [[T("Date")],[T("2026-08-28")]],
 [[T("Related documents")],[T("Tech Drawdown — Architecture & Design (HTML/DOCX); TASKS.md roadmap; Dashboard Prompt Playbook")]],
 [[T("Change log")],[T("1.0 — Baseline. Documents the current shipped scope as the starting point: market-drawdown dashboard, private portfolios, retirement planner, ranking engine, dividend calendar, Monte Carlo, 3-stage DCF (with EBIT reconstruction, reverse-solve, calibrate, probabilistic range, drift monitor, segment SOTP), portfolio look-through, earnings memos, logging & debug.")]],
]));

// 2 Executive Summary
c.push(H1("2 · Executive Summary"));
c.push(P([T("Tech Drawdown replaces a stack of spreadsheets and manual price look-ups with a single, always-current web page.",{bold:true}),
  T(" It answers three questions at a glance: which stocks and funds are in a drawdown (and how deep), what each holding is worth at today's prices, and whether the household is on track for retirement income.")]));
c.push(P("This BRD defines the business need, objectives, scope, and requirements for the tool. It documents Baseline v1.0 (the current shipped starting point) and frames remaining hardening and feature work. Technical realization is covered separately in the Architecture & Design document; this BRD stays at the level of business intent and required capabilities."));

// 3 Background
c.push(H1("3 · Business Background & Problem Statement"));
c.push(P("Monitoring a personal investment portfolio across market indices, ETFs, and mutual funds — while tracking drawdowns, trend signals, and retirement readiness — previously required several manually maintained spreadsheets and repeated, ad-hoc price look-ups. This created three recurring problems:"));
c.push(bullet([T("Stale, error-prone data. ",{bold:true}),T("Portfolio values and drawdown metrics were only as current as the last manual refresh; off-index holdings were frequently mis-valued from outdated figures.")]));
c.push(bullet([T("No single view. ",{bold:true}),T("Market context, personal holdings, and retirement projections lived in separate places, making it hard to see the whole picture or act quickly.")]));
c.push(bullet([T("High manual effort. ",{bold:true}),T("Keeping everything current consumed significant time and was easy to forget or get wrong.")]));
c.push(P("The business need is a consolidated, self-updating view that is accurate, low-effort, private, and easy to open anywhere."));

// 4 Objectives
c.push(H1("4 · Business Objectives"));
c.push(P("The tool exists to achieve the following measurable objectives:"));
c.push(bullet([T("O1 — Eliminate manual valuation effort: ",{bold:true}),T("reduce portfolio upkeep from hours of spreadsheet work to a single source-file edit, with a zero-touch daily refresh.")]));
c.push(bullet([T("O2 — Provide one always-current view: ",{bold:true}),T("market drawdown and trend across ~1,100 securities plus personal holdings, in a single interface.")]));
c.push(bullet([T("O3 — Support retirement-income decisions: ",{bold:true}),T("project household balances and sustainable income, with an income-focused IRA and a growth-focused Brokerage.")]));
c.push(bullet([T("O4 — Keep private financial data secure: ",{bold:true}),T("holdings remain local; no third party receives account details.")]));
c.push(bullet([T("O5 — Deliver a shareable, no-install artifact: ",{bold:true}),T("a single file that opens in any browser and works offline.")]));

// 5 Scope
c.push(H1("5 · Scope"));
c.push(H3("In scope (Baseline v1.0)"));
["Market-drawdown & trend monitoring across six universes: S&P 500, Nasdaq-100, Dow, Top-100 ETFs, Thematic ETFs, Mutual Funds.",
 "Private IRA & Brokerage portfolio tracking valued at current market prices.",
 "Household retirement & income planning across the two accounts.",
 "Market-context Overview: a de-duplicated health spectrum (best-performing / in-correction / worst-drawdown, equities and ETFs with index-membership tags) plus 1-year charts for the major US indices and a macro & commodities panel (oil, gold, silver, copper, rare earths, the US dollar vs major currencies, and consumer sentiment).",
 "On-demand fundamentals per security: a plain-English factsheet (summary, key vitals, and a Did-you-know fun fact), an advisor scorecard, and a risk summary.",
 "Operational logging & debugging: a persistent per-run log of the daily automation, plus an opt-in in-app debug panel for support and troubleshooting.",
 "Performance vs the market: household value indexed against the Dow, Nasdaq and S&P 500, and a drawdown (underwater) timeline showing how far each series sits below its own running peak.",
 "Change alerts on held names: a daily diff that flags a holding entering Bear or Correction, a Golden or Death Cross, a recovery, or a new 52-week low — shown as an icon beside the ticker with a click-through history.",
 "Dividend income calendar: a forward 12-month projection of dividend income by account, combining declared payment dates for stocks with yield-based estimates for ETFs and funds.",
 "Monte Carlo retirement projection: a probabilistic view of household value over the chosen horizon \u2014 median and percentile bands rather than a single deterministic line \u2014 with adjustable contributions and return assumptions.",
 "Equity valuation: an independent, transparent estimate of fair value per held stock (a three-stage discounted-cash-flow model driven by analyst consensus and filed financial statements), a reverse DCF showing what the market is implicitly assuming, and a segment sum-of-the-parts view that values each reported business line separately. Every assumption is exposed as a user control.",
 "Portfolio look-through: an X-ray of what the household actually owns \u2014 true single-name exposure combining directly held shares with the shares reaching the household through its ETFs and mutual funds, including a duplicate-tracker check, with explicit disclosure of anything not yet mapped.",
 "Automated daily refresh (import holdings, reprice, regenerate, republish) with a status report.",
 "Delivery as a single self-contained, browser-openable dashboard."].forEach(x=>c.push(bullet(x)));
c.push(H3("Out of scope"));
["Live brokerage-account connectivity (holdings maintained by manual export/import until security is hardened).",
 "Trade execution, order placement, or money movement.",
 "Multi-user access, roles, or authentication (single-owner use).",
 "Intraday / real-time streaming quotes (prices are session-close).",
 "Personalized financial advice (outputs are rules-based and illustrative)."].forEach(x=>c.push(bullet(x)));

// 6 Stakeholders
c.push(H1("6 · Stakeholders & Roles"));
c.push(rtable([2600,3200,3560],["Stakeholder","Role","Interest"],[
 [[T("Owner / Primary user (Sunil)")],[T("Sponsor, product owner, sole end-user")],[T("Accurate, low-effort portfolio & market view; retirement planning")]],
 [[T("Household")],[T("Beneficiary")],[T("Retirement-income outlook")]],
 [[T("Market-data provider")],[T("External service")],[T("Supplies prices, fundamentals, sentiment (tickers only sent out)")]],
 [[T("Automation (scheduled task)")],[T("System actor")],[T("Executes the daily refresh reliably and safely")]],
]));

// 7 Business Requirements
c.push(H1("7 · Business Requirements"));
c.push(P([T("Requirements are grouped by capability and prioritized using MoSCoW ("),
  new TextRun({text:"Must",bold:true,color:RED,size:22}),T(" / "),
  new TextRun({text:"Should",bold:true,color:BLUE,size:22}),T(" / "),
  new TextRun({text:"Could",bold:true,color:GRAY,size:22}),T(").")]));
c.push(H3("A · Market monitoring"));
c.push(req("BR-1","Must","Track, per security, the current price, 52-week high, % off high, drawdown status (Bear / Correction / Normal), 50- and 200-day moving averages with the associated trend and cross signals, across all six universes."));
c.push(req("BR-2","Should","Allow the user to search and filter securities by ticker, name, sector/category, and status."));
c.push(req("BR-3","Should","Rank securities and funds within a sector/category, and a growth-core shortlist, by a transparent composite score using a customizable rules engine: adjustable dimension/factor weights, editable thresholds, and IF/THEN conditions (exclude / bonus / penalty / cap / floor), with a per-row explanation of every score (delivered in V2)."));
c.push(H3("B · Portfolio tracking"));
c.push(req("BR-4","Must","Value each IRA and Brokerage holding at its current market price — Market Value = Quantity × current price — falling back to the last imported value only when no live price is available (e.g. CDs/cash)."));
c.push(req("BR-5","Must","Compute cost basis, gain/loss ($ and %), and portfolio weight per holding, plus account-level totals and return."));
c.push(req("BR-6","Must","Refresh prices automatically once per day and on demand via a user-triggered action."));
c.push(req("BR-7","Should","Correctly value off-index holdings that are not part of any tracked universe by pricing them live from the data provider."));
c.push(req("BR-8","Could","Present allocation and gain/loss visualizations for each account."));
c.push(H3("C · Fundamentals & risk"));
c.push(req("BR-9","Should","On demand, present per-security fundamentals, an advisor-style scorecard, and a multi-factor risk summary (credit, liquidity, market, supply-chain, ESG, and world-events factors)."));
c.push(req("BR-9b","Could","In the fundamentals view, summarize recent and upcoming CORPORATE ACTIONS — stock splits / reverse-splits, dividends (ex-div / pay dates, amount), and mergers & acquisitions — for stocks, ETFs, and (best-effort) mutual funds; types without a reliable data source (spin-offs, ticker/name changes, delistings) are noted as future."));
c.push(H3("D · Retirement & income planning"));
c.push(req("BR-10","Should","Project household balances and monthly income to a configurable retirement horizon, treating the IRA as the income engine and the Brokerage as the growth engine, with rebalancing guidance toward target allocations."));
c.push(req("BR-10b","Should","Project forward 12-month DIVIDEND INCOME across the holdings — projected annual income, forward yield on market value, and income expected in the next 30 days — broken down by month and by account, distinguishing DECLARED payments (exact ex-dividend / record / pay dates from the market-data feed) from ESTIMATED ones (yield-based, month-level), and label the difference plainly in the interface."));
c.push(req("BR-10c","Should","Show household performance IN CONTEXT: index the portfolio's value against the major US indices (Dow / Nasdaq / S&P 500) from a rolling daily history, and present a drawdown (underwater) timeline of how far the portfolio and each index sit below their own running peak, with the Correction and Bear bands marked."));
c.push(req("BR-10d","Should","Project household value PROBABILISTICALLY to the retirement horizon \u2014 a simulation producing a median outcome and percentile bands rather than a single deterministic line \u2014 with user-adjustable horizon, annual contribution and return assumptions. The simulation must be reproducible (a fixed seed produces the same result) and must derive its volatility from data already held, not from a new external source."));
c.push(req("BR-10e","Should","Reveal the household's TRUE single-name exposure by looking through held ETFs and mutual funds to their underlying holdings and combining that with directly held shares \u2014 so concentration that is invisible on the account tabs (a company owned entirely through funds) becomes visible \u2014 including a check for near-identical funds held more than once. Anything not looked through (each fund's long tail, cash inside funds, and any fund not yet mapped) must be shown as an explicit bucket and must reconcile to the household total; while coverage is incomplete, every exposure figure must be presented as a floor rather than a total."));
c.push(H3("C2 \u00b7 Valuation"));
c.push(req("BR-15","Should","Provide an INDEPENDENT FAIR-VALUE estimate for each held stock \u2014 a discounted-cash-flow model driven by analyst consensus and the company's filed financial statements \u2014 presented alongside the market price in the fundamentals view, with every judgement input (growth fade, capex intensity, terminal growth, beta, risk-free rate, equity risk premium, consensus haircut) exposed as a user control rather than a hidden default, plus a reverse DCF reporting the discount rate the market is implicitly applying."));
c.push(req("BR-16","Should","Offer a SEGMENT SUM-OF-THE-PARTS view valuing each reported business line separately, with per-segment margins editable and the segment total reconciling to the company total by construction."));
c.push(req("BR-17","Must","Gate every valuation output against an external, independent reference before release, and REFUSE to display any view whose source data fails an arithmetic reconciliation check (e.g. filed segments that do not sum to reported revenue) \u2014 stating why, rather than displaying a plausible-looking number built on broken inputs."));
c.push(H3("E · Automation & data integrity"));
c.push(req("BR-11","Must","Automatically, once per day, re-import holdings from the source files, refresh prices, regenerate the dashboard, and republish it — with no manual steps."));
c.push(req("BR-12","Must","Never corrupt the last-known-good dashboard or lose holdings when an input is missing, locked, or malformed; degrade safely (skip & preserve, keep last-known price) rather than fail destructively."));
c.push(req("BR-13","Should","Report the outcome of each automated run — which accounts were imported vs skipped and why, which prices refreshed or failed, and summary counts."));
c.push(req("BR-13b","Should","Surface corporate actions and data-quality issues: badge recent stock splits and reverse-splits across all tabs (auto-hiding after ~90 days), and flag AND suppress rows whose price / SMA / cross values are internally inconsistent (a ⚠ badge on the row) — a symptom of stale or broken source data."));
c.push(req("BR-13c","Should","Source live universe market data from a dedicated market-data connector (FMP batch-quote) with a resilient fallback ladder — connector primary, workbook (STOCKHISTORY) tail rung, then carry-forward — so the daily build runs headlessly and deterministically, without depending on an Excel-365 refresh; every value is validated (52-week band / internal-consistency) before use."));
c.push(req("BR-13d","Should","Detect and surface material CHANGES on held names between one day and the next — a holding entering Bear or Correction, a Golden or Death Cross, a recovery, or a new 52-week low — as an alert beside the ticker with a click-through from→to history, and list the day's transitions in the automated run report. Alerts must be derived from the existing snapshot (no extra data calls) and must be suppressed for any row flagged as data-quality-suspect, so a corrupt price can never raise a false alarm."));
c.push(H3("F · Delivery"));
c.push(req("BR-14","Must","Deliver the solution as a single, self-contained web page that opens in any modern browser and renders its last snapshot even without a live data connection."));

// 8 NFR
c.push(H1("8 · Non-Functional Requirements"));
c.push(rtable([2600,6760],["Quality attribute","Requirement"],[
 [[T("Reliability")],[T("Guarded pipeline with integrity gates and a fallback chain; a bad input never corrupts the last-good output or blanks a holding.")]],
 [[T("Security & privacy")],[T("Holdings remain local; only ticker symbols are sent externally for public market data. Access control / authentication is required before any live brokerage connection.")]],
 [[T("Availability & performance")],[T("Refreshes at least daily; on-demand price refresh completes within seconds for the current holding count; caching limits external calls.")]],
 [[T("Usability")],[T("No installation; tabbed, browser-based UI; clear 'data as of' context and not-financial-advice disclaimers.")]],
 [[T("Maintainability")],[T("Data provider isolated behind a thin adapter; multi-provider chain (FMP primary, Bigdata, STOCKHISTORY fallback) so no single source is a dependency; versioned roadmap and current architecture documentation.")]],
 [[T("Portability")],[T("Runs from a single file on any OS/browser; offline-capable.")]],
]));

// 9 Assumptions
c.push(H1("9 · Assumptions, Constraints & Dependencies"));
c.push(bullet([T("Assumption: ",{bold:true}),T("prices are latest session-close values; live universe data is fetched from the FMP connector at build time, with the workbook\u2019s STOCKHISTORY columns serving only as a guard-validated fallback (no Excel-365 refresh required).")]));
c.push(bullet([T("Assumption: ",{bold:true}),T("source holdings files are the flat exports (Symbol, Quantity, Price Paid, Value) and are hydrated locally by file sync at refresh time.")]));
c.push(bullet([T("Constraint: ",{bold:true}),T("in-browser live data must come through a managed data connector (no API keys embedded in the page).")]));
c.push(bullet([T("Constraint: ",{bold:true}),T("outputs are rules-based and illustrative — not personalized financial or tax advice.")]));
c.push(bullet([T("Constraint: ",{bold:true}),T("the published page cannot call the market-data connector at runtime, so every derived analytic (history, alerts, dividends, valuations, look-through) is computed by the daily automation and embedded in the page. Each therefore preserves its prior value on failure \u2014 a feed may be stale, but is never blank, and the run report says which.")]));
c.push(bullet([T("Constraint: ",{bold:true}),T("the provider's own ready-made valuation endpoint is NOT used as a source \u2014 it mean-reverts every projection ratio to a historical average and reports net debt incorrectly. Valuations are built from primary data (analyst estimates and filed statements) only. The estimate and statement endpoints also carry a finite daily quota, so valuation and look-through coverage extends by a few securities per run and the interface names what it does not yet cover.")]));
c.push(bullet([T("Dependency: ",{bold:true}),T("an external market-data provider for prices, fundamentals, and sentiment.")]));
c.push(bullet([T("Dependency: ",{bold:true}),T("the scheduled-automation capability of the host environment.")]));

// 10 KPIs
c.push(H1("10 · Success Metrics & KPIs"));
c.push(rtable([4200,5160],["Metric","Target"],[
 [[T("Manual effort")],[T("Portfolio kept current with a single source-file edit (down from hours of spreadsheet upkeep)")]],
 [[T("Data freshness")],[T("Holdings & market prices current within one trading session")]],
 [[T("Valuation accuracy")],[T("Portfolio value equals shares × current price (validated to the cent)")]],
 [[T("Reliability")],[T("Zero holding-loss incidents; every run either succeeds or falls back safely with a reported reason")]],
 [[T("Coverage")],[T("100% of marketable holdings priced (live, or explicit fallback)")]],
 [[T("Accessibility")],[T("Dashboard opens and renders on any browser with no installation")]],
]));

// 11 Risks
c.push(H1("11 · Risks & Mitigations"));
c.push(rtable([3200,2600,3560],["Risk","Impact","Mitigation"],[
 [[T("Data-provider deprecation / rate-limits / response-shape changes")],[T("Loss of live prices & fundamentals")],[T("Connector I/O isolated behind one adapter (BDX); universe data on a multi-provider chain (FMP primary -> Bigdata -> STOCKHISTORY fallback, delivered) so no single provider is a dependency; every value validated by the integrity guard")]],
 [[T("Private data exposure (holdings embedded in the page)")],[T("Confidentiality breach")],[T("Security hardening & access control before any live brokerage link")]],
 [[T("Silent failures hide bugs")],[T("Stale/incorrect values go unnoticed")],[T("Logging & debug: visible error trail + run logs")]],
 [[T("Source-file not synced (placeholder/locked)")],[T("Missed holdings update")],[T("Integrity gate skips import and preserves prior holdings, with a flag in the run report")]],
 [[T("Corrupt / stale source data (STOCKHISTORY #N/A or bad cells)")],[T("Wrong drawdown / cross on the dashboard")],[T("FMP-primary headless build (no Excel-365 dependency) + integrity guard that suppresses & flags impossible rows (52-wk band / ratio, dq badge), delivered")]],
]));

// 12 Value
c.push(H1("12 · Business Value"));
c.push(P("The tool converts hours of recurring manual maintenance into a zero-touch daily refresh, provides a live and accurate view of portfolio value and market risk, and supports retirement-income decisions — all while keeping private data local and packaging everything as one shareable, no-install file. For the owner's professional context, it also serves as a concrete, end-to-end example of turning fragmented spreadsheets into an automated, documented, and governable solution."));

// 13 Phased delivery
c.push(H1("13 · Phased Delivery"));
c.push(bullet([T("Baseline v1.0 (this document): ",{bold:true}),T("the current shipped starting point \u2014 9-tab dashboard, live-priced IRA & Brokerage, retirement planner, market-context Overview, rules-based ranking engine, logging & debug, household history and market benchmark, drawdown timeline, change alerts, dividend income calendar, Monte Carlo projection, 3-stage DCF with reverse-solve / calibrate / probabilistic range / drift monitor / consensus-EBIT reconstruction / segment sum-of-the-parts, portfolio look-through, earnings memos, daily automation, and documentation.")]));
c.push(bullet([T("Remaining hardening: ",{bold:true}),T("security / authentication before any live brokerage link, and GitHub source control / CI. Do not publish the HTML \u2014 it embeds private holdings.")]));
c.push(bullet([T("Feature backlog (committed): ",{bold:true}),T("see \u00a713.1 below and TASKS.md.")]));

// 14 Glossary
c.push(H3("13.1 · Feature Backlog"));
c.push(P("Effort: S \u2248 hours, M \u2248 a day, L \u2248 multi-day. Detailed specs and build order live in TASKS.md. Everything in \u00a75 (in scope) is Baseline v1.0."));
c.push(rtable([3500,900,4960],["Feature","Effort","Notes / dependency"],[
 [[T("Multi-scenario retirement modeling")],[T("M")],[T("Adjustable assumptions with side-by-side scenarios; client-side.")]],
 [[T("Tax-lot / cost-basis detail & realized-gain tracking")],[T("L")],[T("Needs a richer per-lot broker export.")]],
 [[T("Export to PDF / email digest")],[T("M")],[T("PDF via the pdf skill; email needs a mail connector (not currently connected).")]],
 [[T("Corporate Actions summary in the Fundamentals popup")],[T("M")],[T("Splits / dividends / M&A; source-less types (spin-offs, ticker/name changes, delistings) future.")]],
]));
c.push(H1("14 · Glossary"));
c.push(rtable([2800,6560],["Term","Meaning"],[
 [[T("Drawdown")],[T("Percentage decline of a security's price from its 52-week high.")]],
 [[T("Status (Bear/Correction/Normal)")],[T("Drawdown band: Bear ≤ −20%, Correction −10% to −20%, else Normal.")]],
 [[T("Golden / Death Cross")],[T("50-day MA above (golden) or below (death) the 200-day MA — a trend signal.")]],
 [[T("Off-index holding")],[T("A holding not present in any tracked universe tab, priced individually from the provider.")]],
 [[T("Universe")],[T("One of the six tracked market lists (indices, ETF groups, mutual funds).")]],
 [[T("Forward yield")],[T("Projected next-12-month dividend income divided by the current market value of the holdings.")]],
 [[T("Ex-dividend / record / pay date")],[T("Ex-div: buy before this date to receive the dividend. Record: the date the holder is registered. Pay: the date cash actually arrives.")]],
 [[T("Declared vs estimated (dividend)")],[T("Declared — an exact amount and date announced by the issuer. Estimated — a projection from the security's yield and payment cadence, placed at month level.")]],
 [[T("Underwater / drawdown timeline")],[T("A chart of how far a series sits below its own running peak over time; 0% means at a record high.")]],
 [[T("Alpha (benchmark card)")],[T("The portfolio's indexed return minus the benchmark's over the same window — positive means it is outrunning the index.")]],
 [[T("MoSCoW")],[T("Prioritization: Must / Should / Could / Won't.")]],
 [[T("NFR")],[T("Non-functional requirement (a quality attribute rather than a feature).")]],
]));

// 15 Appendices
c.push(H1("15 · Appendices"));
c.push(P([T("For technical realization — system architecture, data model, workflows, caching, and safeguards — see the companion "),
  T("Tech Drawdown — Architecture & Design",{bold:true}),T(" document (HTML and Word). The delivery roadmap and open items are tracked in "),C("TASKS.md"),T(".")]));

const doc=new Document({
  creator:"Tech Drawdown", title:"Tech Drawdown — BRD",
  styles:{ default:{document:{run:{font:"Arial",size:22}}},
    paragraphStyles:[
      {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:28,bold:true,font:"Arial",color:INK},
        paragraph:{spacing:{before:300,after:130},outlineLevel:0,
          border:{left:{style:BorderStyle.SINGLE,size:24,color:GOLD,space:10}}}},
      {id:"Heading3",name:"Heading 3",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:22,bold:true,font:"Arial",color:DGOLD},
        paragraph:{spacing:{before:150,after:50},outlineLevel:2}},
    ]},
  numbering:{config:[{reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",
    alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:560,hanging:280}}}}]}]},
  sections:[{
    properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440}}},
    footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,
      children:[new TextRun({text:"Tech Drawdown — BRD v1.0    ·    ",size:16,color:GRAY}),
        new TextRun({children:["Page ",PageNumber.CURRENT],size:16,color:GRAY})]})]})},
    children:c
  }]
});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(path.join(DOCS_DIR,'Tech_Drawdown_BRD.docx'),b);
  console.log('brd docx bytes',b.length);});
