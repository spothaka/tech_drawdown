const fs=require('fs');
const path=require('path');
const TDD_BASE=process.env.TDD_BASE||path.dirname(path.dirname(__dirname));
const DOCS_DIR=path.join(TDD_BASE,'docs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, PageBreak, TableOfContents } = require('docx');

const DIR=path.join(DOCS_DIR,'diagrams');
function _png(p){const b=fs.readFileSync(p);return [b.readUInt32BE(16),b.readUInt32BE(20)];}
const dims={}; fs.readdirSync(DIR).forEach(f=>{ if(f.endsWith('.png')) dims[f]=_png(path.join(DIR,f)); });
const INK="1F2937", GOLD="E0A106", DGOLD="B07D04", BLUE="2E75B6", GRAY="6B7280";
const CW=9360, MAXW=624, MAXH=760;

function imgPara(file,caption){
  const [w,h]=dims[file]; const asp=w/h;
  let dw=MAXW, dh=Math.round(dw/asp);
  if(dh>MAXH){ dh=MAXH; dw=Math.round(dh*asp); }
  return [
    new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:120,after:40},
      children:[new ImageRun({type:"png", data:fs.readFileSync(DIR+'/'+file),
        transformation:{width:dw,height:dh},
        altText:{title:caption,description:caption,name:file}})]}),
    new Paragraph({alignment:AlignmentType.CENTER, spacing:{after:180},
      children:[new TextRun({text:caption, italics:true, color:GRAY, size:18})]})
  ];
}
const H1=t=>new Paragraph({heading:HeadingLevel.HEADING_1, children:[new TextRun(t)]});
const H2=t=>new Paragraph({heading:HeadingLevel.HEADING_2, children:[new TextRun(t)]});
const H3=t=>new Paragraph({heading:HeadingLevel.HEADING_3, children:[new TextRun(t)]});
function P(runs){ if(typeof runs==='string') runs=[new TextRun(runs)];
  return new Paragraph({spacing:{after:120}, children:runs}); }
const T=(t,o={})=>new TextRun(Object.assign({text:t,size:22},o));
const C=t=>new TextRun({text:t,font:"Consolas",size:20,color:"B02A00"});
function bullet(runs){ if(typeof runs==='string') runs=[new TextRun(runs)];
  return new Paragraph({numbering:{reference:"b",level:0}, spacing:{after:60}, children:runs}); }

const border={style:BorderStyle.SINGLE,size:1,color:"CCCCCC"};
const borders={top:border,bottom:border,left:border,right:border};
function cell(children,w,head){
  if(!Array.isArray(children)) children=[children];
  const paras=children.map(c=>c instanceof Paragraph?c:new Paragraph({children:Array.isArray(c)?c:[c]}));
  return new TableCell({borders,width:{size:w,type:WidthType.DXA},
    shading:{fill:head?INK:"FFFFFF",type:ShadingType.CLEAR},
    margins:{top:60,bottom:60,left:110,right:110}, children:paras});
}
function table(widths, rows){
  const trs=rows.map((r,i)=>new TableRow({tableHeader:i===0, children:r.map((cellData,ci)=>{
    const head=i===0;
    let kids;
    if(Array.isArray(cellData)) kids=[new Paragraph({children:cellData.map(x=>typeof x==='string'?T(x):x)})];
    else kids=[new Paragraph({children:[head?new TextRun({text:cellData,bold:true,color:"FFFFFF",size:19}):
      (typeof cellData==='string'?T(cellData):cellData)]})];
    if(!head && i%2===0){}
    return new TableCell({borders,width:{size:widths[ci],type:WidthType.DXA},
      shading:{fill:head?INK:(i%2===0?"FBFAF6":"FFFFFF"),type:ShadingType.CLEAR},
      margins:{top:60,bottom:60,left:110,right:110}, children:kids});
  })}));
  return new Table({width:{size:CW,type:WidthType.DXA}, columnWidths:widths, rows:trs});
}
// table with rich cells (runs arrays)
function mkCell(kids, w, fill){
  return new TableCell({borders, width:{size:w,type:WidthType.DXA},
    shading:{fill:fill,type:ShadingType.CLEAR},
    margins:{top:60,bottom:60,left:110,right:110},
    children:[new Paragraph({children:kids})]});
}
function rtable(widths, header, rows){
  const hr=new TableRow({tableHeader:true, children:header.map((t,ci)=>
    mkCell([new TextRun({text:t,bold:true,color:"FFFFFF",size:19})], widths[ci], INK))});
  const trs=rows.map((r,i)=>new TableRow({children:r.map((runs,ci)=>
    mkCell(Array.isArray(runs)?runs:[T(runs)], widths[ci], i%2===1?"FBFAF6":"FFFFFF"))}));
  return new Table({width:{size:CW,type:WidthType.DXA},columnWidths:widths,rows:[hr,...trs]});
}

const children=[];
// ---- Title block ----
children.push(new Paragraph({spacing:{before:1400,after:0},alignment:AlignmentType.LEFT,
  border:{bottom:{style:BorderStyle.SINGLE,size:18,color:GOLD,space:8}},
  children:[new TextRun({text:"Tech Drawdown",bold:true,size:56,color:INK})]}));
children.push(new Paragraph({spacing:{before:120,after:0},children:[new TextRun({text:"Architecture & Design",bold:true,size:40,color:DGOLD})]}));
children.push(new Paragraph({spacing:{before:160,after:0},children:[new TextRun({text:"Technical deep-dive — live market-drawdown dashboard, private portfolio tracking, and daily automation  ·  Baseline v1.0 (August 2026)",size:24,color:GRAY})]}));
children.push(new Paragraph({spacing:{before:400,after:0},children:[new TextRun({text:"INTERNAL DESIGN DOCUMENT",bold:true,size:18,color:GOLD})]}));
children.push(new Paragraph({spacing:{before:40,after:0},children:[new TextRun({text:"Prepared for Sunil · rules-based analytics, not financial advice",size:18,color:GRAY})]}));
children.push(new Paragraph({children:[new PageBreak()]}));

// ---- TOC ----
children.push(new Paragraph({spacing:{after:120},children:[new TextRun({text:"Contents",bold:true,size:28,color:INK})]}));
children.push(new TableOfContents("Contents",{hyperlink:true,headingStyleRange:"1-2"}));
children.push(new Paragraph({children:[new PageBreak()]}));

// 1
// ---- Executive Summary ----
children.push(H1("Executive Summary"));
children.push(P([T("Tech Drawdown replaces a stack of spreadsheets and manual price look-ups with a single, always-current web page.",{bold:true})]));
children.push(P("It answers three questions at a glance: which stocks and funds are in a drawdown (and how deep), what each holding is worth at today's prices, and whether the household is on track for retirement income."));
children.push(P("The dashboard covers roughly 1,100 securities across six market indices, plus two private accounts — an income-focused IRA and a growth-focused Brokerage — and a household retirement planner. Market and portfolio prices refresh automatically every morning and on demand, pulling live quotes from a market-data service, so nothing has to be updated by hand."));
children.push(P([T("Business value: ",{bold:true}),T("it collapses hours of manual spreadsheet upkeep into a zero-touch daily refresh, gives a live and accurate view of portfolio value and risk, and ships as one file that opens in any browser — easy to share, nothing to install.")]));
children.push(P([T("Beyond the snapshot: ",{bold:true}),T("the dashboard keeps a rolling daily history of household value, so it can show performance against the Dow, Nasdaq and S&P 500, an underwater timeline of how far each series sits below its own peak, day-over-day change alerts on held names, and a forward 12-month dividend-income calendar. It also projects the household forward with a Monte Carlo simulation, values held stocks with a three-stage discounted-cash-flow model (benchmarked against published independent fair values, with a Trefis-style segment sum-of-the-parts view), and X-rays the funds to reveal what the household actually owns — the single-name concentration that reaches it through ETFs and mutual funds rather than through directly held shares.")]));
children.push(P([T("Built to be trusted: ",{bold:true}),T("every automated step is guarded, so a corrupt file or a network hiccup can never wipe holdings or break the dashboard; it always falls back to the last good state. Holdings never leave the local machine — only ticker symbols are sent out, and only to retrieve public market data.")]));
children.push(rtable([2400,6960],
 ["At a glance","Detail"],
 [
 [[T("Coverage")],[T("~1,100 securities: S&P 500, Nasdaq-100, Dow, Top-100 ETFs, Thematic ETFs, Mutual Funds")]],
 [[T("Private accounts")],[T("IRA (income focus) + Brokerage (growth focus) + household retirement planner")]],
 [[T("Refresh")],[T("Automatic daily at 9am, plus an on-demand 'Load live prices' button using the market-data connector")]],
 [[T("Delivery")],[T("Single self-contained web page; opens in any browser and works offline")]],
 [[T("Data privacy")],[T("Holdings stay local; only ticker symbols are sent for public market data")]],
 [[T("Reliability")],[T("Integrity-gated automation — always falls back to the last good state, never blanks a holding")]],
 [[T("History & income")],[T("Rolling daily value history → benchmark vs Dow/Nasdaq/S&P, drawdown timeline, held-name change alerts, and a forward 12-month dividend calendar")]],
 ]));
children.push(new Paragraph({spacing:{before:80,after:60},children:[new TextRun({text:"Not financial advice: the scorecards, risk summaries, and retirement projections are rules-based, illustrative tools to support the owner's own decisions.",italics:true,color:GRAY,size:18})]}));
children.push(new Paragraph({children:[new PageBreak()]}));
children.push(H1("1 · System Overview"));
children.push(P("The Tech Drawdown system is a single-file HTML dashboard that reports market drawdown and trend signals across roughly 1,100 securities, plus a private Portfolio tab with IRA and Brokerage sub-views and a household retirement planner. It is built from local Excel workbooks by a Python pipeline, enriched at runtime by a live market-data connector when one is injected, and kept current by a daily automated refresh."));
children.push(P("Four layers make up the system: Data Sources (local Excel files); a Build Pipeline (Python that assembles a JSON snapshot and injects it into an HTML template); the Dashboard Runtime (the browser-side dashboard with a localStorage cache); the Live Connector (the Bigdata MCP for real-time prices and fundamentals, when a live shim is present); and Automation (a 9am local refresh that re-imports holdings, reprices, regenerates, and writes the HTML files)."));
children.push(P([T("Core design principle: ",{bold:true}),T("the deployed HTML carries an embedded data snapshot so it always renders offline, while the connector layers live values on top at runtime. Every automated step is guarded so a bad input can never corrupt the last-good dashboard or blank a holding.")]));

// 2
children.push(H1("2 · System Architecture"));
children.push(P("Components and data stores across the four layers. Red edges are live connector calls; green edges are the automated daily task."));
imgPara("01_architecture.png","Figure 1 — System architecture (four layers, data stores, connector, automation)").forEach(x=>children.push(x));

// 3
children.push(H1("3 · Component Inventory"));
children.push(rtable([2100,5060,2200],
 ["Component","Responsibility","Tech / location"],
 [
 [[T("Universe workbook")],[T("Source of the 6 market universes (sub-tabs under the Markets tab: S&P 500, Nasdaq-100, Dow, Top-100 ETFs, Thematic ETFs, Mutual Funds); live price/high/SMA columns via Excel STOCKHISTORY.")],[C("tech100_drawdown_SP_NAS.xlsx")]],
 [[T("Holdings exports")],[T("Flat broker exports (Symbol, Quantity, Price Paid, Value) — the source of truth for positions.")],[C("IRA.xlsx"),T(" "),C("Brokerage.xlsx")]],
 [[T("Portfolio workbooks")],[T("Generated live-formula workbooks with per-holding drawdown metrics; a standalone Excel view, not part of the dashboard data path.")],[C("IRA_Portfolio.xlsx"),T(" / "),C("Brokerage_Portfolio.xlsx")]],
 [[T("Build pipeline")],[T("Reads workbooks, cleans/types rows, preserves or re-imports portfolios, assembles the 17-key JSON, injects into template, validates, writes deployed HTML.")],[C("rebuild_all.py"),T(", "),C("build_ira.py"),T(", "),C("build_brokerage.py")]],
 [[T("Data snapshot")],[T("The single source object embedded into the dashboard.")],[C("dash_data_live.json")]],
 [[T("Template / deployed HTML")],[T("Template holds the DATA placeholder; deploy injects the JSON. All UI/logic lives here.")],[C("dashboard_tpl.html"),T(" → "),C("tech_drawdown_dashboard.html")]],
 [[T("Dashboard runtime")],[T("4 top-level tabs (Overview; Markets with 6 universe sub-tabs; Portfolio with IRA & Brokerage sub-tabs; Retirement & Income), portfolio live-pricing, fundamentals popup, retirement planner, ranking modals, Chart.js visuals.")],[C("dashboard/tech_drawdown_dashboard.html")]],
 [[T("Derived-feed transforms")],[T("Nine pure local transforms that fold accumulated state into DATA — no connector calls, each preserve-on-failure: portfolio history, change alerts, dividend calendar, DCF bases, fund look-through, index history, macro history, splits, glossary.")],[C("build_history.py"),T(", "),C("build_alerts.py"),T(", "),C("build_dividends.py"),T(", "),C("build_dcf.py"),T(", "),C("build_lookthrough.py")]],
 [[T("Live data connector")],[T("Resolves tickers and returns real-time prices, fundamentals, ESG, sentiment. Note: the FMP connector is a BUILD-TIME source only — see 4.1.")],[T("Bigdata MCP (runtime) · FMP MCP (build-time)")]],
 [[T("Scheduled task")],[T("Daily: integrity-gated re-import + off-index reprice + derived feeds (history, alerts, dividends, DCF, look-through) + regenerate + write both HTML copies, with a sync-status report.")],[C("scripts/daily_refresh.md"),T(" ("),C("0 9 * * *"),T(")")]],
 ]));

// 4
children.push(H1("4 · Data Model"));
children.push(P([T("The embedded "),C("DATA"),T(" object has exactly nineteen keys. Six come from the workbook; three ("),C("ira"),T(", "),C("brokerage"),T(", "),C("coreRank"),T(") are app-owned and never exist in the workbook; and ten ("),C("splits"),T(", "),C("indexHistory"),T(", "),C("macroHistory"),T(", "),C("history"),T(", "),C("alerts"),T(", "),C("dividends"),T(", "),C("dcf"),T(", "),C("lookthrough"),T(", "),C("earnings"),T(", "),C("dcfMonitor"),T(") are derived feeds refreshed by the daily task.")]));
children.push(rtable([2000,1900,5460],
 ["Key","Origin","Row shape (fields)"],
 [
 [[C("sp"),T(", "),C("nasdaq"),T(", "),C("dow")],[T("Workbook (stock tabs)")],[T("ticker, company, sector, price, high, off, status, signal, recover, sma, smapct, sma50, sma50pct, cross, consensus, fwdpe")]],
 [[C("etfs"),T(", "),C("thematic"),T(", "),C("mutualfunds")],[T("Workbook (fund tabs)")],[T("same as above but "),C("divyield"),T(" replaces consensus/fwdpe")],],
 [[C("ira"),T(", "),C("brokerage")],[T("App (holdings exports)")],[T("base: ticker, type {CD·Cash·Equity/ETF·Mutual Fund}, qty, paid, value · off-index adds: price, high, off, status, sma, smapct, sma50, sma50pct, cross, recover, signal")]],
 [[C("coreRank")],[T("App (growth-core screen)")],[T("rank, ticker, comp, Q, V, T, A, pe, off, cross, up, held")]],
 [[C("splits")],[T("App (data/splits.json)")],[T("TICKER -> { ratio, date, type } — split / reverse-split badges on every tab")]],
 [[C("indexHistory")],[T("Derived (FMP chart)")],[T("SYM -> { name, points:[{d,c}] } — 4 US indices, 1-year weekly; own-scale Overview sparklines")]],
 [[C("macroHistory")],[T("Derived (FMP commodity/forex/economics)")],[T("{ series:[{key,name,unit,points:[{d,c}]}], asof } — oil, gold, silver, copper, rare earths (REMX proxy), USD vs EUR/JPY/GBP/CNY, UMich consumer sentiment; weekly (sentiment monthly)")]],
 [[C("history")],[T("Derived (data/history.json)")],[T("[{ date, total, ira, brokerage }] — the accumulating daily household-value series; feeds the benchmark and drawdown-timeline cards. Appended by build_history.py from the merged holdings — no connector call, so the line always agrees with the portfolio tabs.")]],
 [[C("alerts")],[T("Derived (data/alerts.json)")],[T("TICKER -> { kind, sev, label, date, account, from, to, history[] } — held-name transitions over the last 14 days (bear · death · correction · low52 · recover · golden). Pure prior-vs-today diff by build_alerts.py; dq-guarded.")]],
 [[C("dividends")],[T("Derived (FMP calendar + data/dividend_schedule.json)")],[T("{ asOf, annual, yield, next30, months[12], upcoming[] } — forward 12-month income split by account. Tier 1: declared stock payments (exact dates). Tier 2: yield-based ETF/fund estimates (per-symbol ETF dividend dates are plan-gated).")]],
 [[C("dcf")],[T("Derived (data/dcf.json + dcf_anchor/segments)")],[T("TICKER -> { rev0, ebit0, taxEff, dna, capexPct0, nwcPct, netDebt, shares, beta, price, wacc parts, est[{fy,rev,ebit,dna,ni,n}], segments{}, segOk, anchor, ebitRecon, asOf } — the valuation BASE (analyst consensus + filed statements) for each held stock, with corrupt consensus EBIT RECONSTRUCTED at ingest (see 6.6). The model runs client-side from this base, so every assumption stays a user control. Built by build_dcf.py; extended ~6 symbols per run (the statement/estimate quota is finite).")]],
 [[C("lookthrough")],[T("Derived (data/fund_holdings.json)")],[T("{ asOf, known[], funds: TICKER -> { asOf, topW, residualW, cashW, synthetic, top:[{sym,name,w}] } } — top-50 holdings per held fund plus an explicit long-tail remainder and cash weight. The roll-up against current position values runs client-side, so it always agrees with the portfolio tabs. Built by build_lookthrough.py; ~4 funds per run, refreshed weekly.")]],
 [[C("earnings")],[T("Derived (data/earnings.json)")],[T("TICKER -> { reportDate, fiscalPeriod, eps{actual,est,surprisePct}, revenue{...}, epsTrend[], fwd{}, drivers[], watch[], rating{} } — the latest reported quarter for held/universe stocks. Drives the inline memo badge (shown only <=30 days after the report, a client-side test) and the Earnings popup. Built by build_earnings.py from the Bigdata company tearsheet; ~6 names per run, prioritising recent reporters.")]],
 [[C("dcfMonitor")],[T("Derived (data/dcf_monitor.json)")],[T("{ asOf, tol, names: TICKER -> { modelFv, anchor, gapPct, reconcilable, best, flag, ebitRecon, baseAsOf } } — the daily DCF drift monitor (Loop 5). Re-runs the real client DCF functions in Node against the external anchors; FLAGS a name only when the gap exceeds tolerance AND no plausible assumption reconciles it. Built by dcf_monitor.js; no connector calls.")]],
 ]));
children.push(H2("4.1 · Architecture invariant — precompute, then embed"));
children.push(P([T("The published HTML "),T("cannot call the FMP connector",{bold:true}),T(" — that call never settles (no error, no timeout), so any feature that tried to fetch FMP data at runtime would hang forever. Everything FMP-derived is therefore computed by the daily task and "),T("embedded in DATA",{bold:true}),T(". Live Bigdata "),T("does",{italics:true}),T(" work when a live-connector shim is present and serves the on-demand factsheet, fundamentals and live-price paths. This single constraint shapes every analytic in the system: each ships as a "),T("pure local transform",{bold:true}),T(" (a build script with no connector calls, preserving its prior value on failure) plus a "),T("dumb renderer",{bold:true}),T(" (a client module that only reads DATA). It is also why the client-side models — Monte Carlo, DCF, the look-through roll-up — compute from an embedded base rather than fetching one.")]));
children.push(H3("Market value resolution (Portfolio tab)"));
children.push(P([T("For each holding the price is chosen in priority order: "),C("LIVEPX[ticker]"),T(" (freshly loaded) → embedded "),C("price"),T(" → matching universe-tab price → none. "),T("Market Value = Quantity × chosen price",{bold:true}),T(", falling back to the imported "),C("value"),T(" only for CDs/cash or when no price exists. Gain/Loss, Weight, and KPIs recompute from that market value.")]));

// 5
children.push(H1("5 · Data-Flow Diagram"));
imgPara("02_dataflow.png","Figure 2 — Data flow from source files to the published artifact").forEach(x=>children.push(x));

// 6
children.push(H1("6 · Build & Publish Process"));
children.push(P([T("Deterministic and idempotent: the same inputs always produce the same deployed HTML. The validation gate ("),C("node"),T(" parse, single </html>, exactly two </script>) blocks publishing a broken file.")]));
imgPara("03_build_process.png","Figure 3 — Build-and-publish pipeline with validation gate").forEach(x=>children.push(x));

// 7
children.push(H2("6.1 · Data sourcing (FMP-primary)"));
children.push(P([T("Since the V1 cut-over, the six universe tabs' LIVE market data (price, 52-week high/low, 50/200-day SMA, and the derived % off / status / cross) is sourced from the FMP connector's "),C("batch-quote"),T(" endpoint — one batched call per ~450 tickers, covering equities, ETFs, and mutual funds. "),C("scripts/build_market_data.py"),T(" (a pure transform, no connector calls) applies a per-ticker fallback ladder — "),T("FMP primary",{bold:true}),T(" -> "),T("STOCKHISTORY workbook tail rung (guard-validated)",{bold:true}),T(" -> "),T("carry-forward from the prior market_data.xlsx",{bold:true}),T(" — writes "),C("data/market_data.xlsx"),T(" (machine-written, plain values), and emits the full DATA universe (live + static) for injection. Coverage on the ~915-ticker universe is ~99% from FMP; the ~11 uncovered bond / money-market funds fill from the STOCKHISTORY tail. The workbook is now read-only for membership + static columns and no longer needs an Excel-365 refresh for live data.")]));
imgPara("09_data_sourcing.png","Figure 9 — Universe data sourcing: the FMP -> STOCKHISTORY tail -> carry-forward provider chain, guard-validated").forEach(x=>children.push(x));
children.push(H2("6.2 · Integrity guard"));
children.push(P([C("scripts/integrity_guard.py"),T(" validates every row: a true 52-week [low, high] band check when a low is present (FMP rows), else a max/min ratio heuristic (STOCKHISTORY rows). Corrupt or #N/A rows have their derived signals suppressed and are tagged "),C("dq"),T(", surfaced in the UI as a small ⚠ badge. A total FMP outage degrades safely to the STOCKHISTORY fallback build.")]));
children.push(H2("6.3 · One-year history feeds (Overview charts)"));
children.push(P([T("Two pure transforms build the Overview's 1-year charts, each embedded as a DATA key so the page makes no runtime calls. "),C("scripts/build_index_history.py"),T(" reads FMP "),C("historical-price-eod-light"),T(" arrays for ^DJI, ^IXIC (Nasdaq Composite; ^NDX/QQQ are plan-gated), ^GSPC and ^RUT, downsamples to weekly, and emits "),C("indexHistory"),T(" — rendered as four own-scale area sparklines in a single row. "),C("scripts/build_macro_history.py"),T(" reads FMP commodity, forex and economics arrays and emits "),C("macroHistory"),T(" for the "),T("Macro & commodities",{bold:true}),T(" card: oil (CLUSD), gold (GCUSD), silver (SIUSD), copper (HGUSD), rare earths (REMX ETF proxy), USD vs EUR/JPY/GBP/CNY (EURUSD & GBPUSD inverted to USD-strength), and UMich consumer sentiment (monthly). Both steps "),T("preserve the prior value and carry forward",{bold:true}),T(" on any gating or failure, so the charts never blank; the macro card auto-hides while its data is absent. The Overview itself was rebuilt into a 3-column spectrum — Best performing (green), In correction (amber), Worst drawdown (red) — merging equities and ETFs with per-row index-membership chips.")]));
children.push(H2("6.4 · Derived portfolio feeds (history, alerts, dividends, DCF, look-through)"));
children.push(P([T("Five further pure transforms run at the end of each daily build, after the holdings are merged, and are embedded as DATA keys. "),C("scripts/build_history.py"),T(" appends one "),C("{date,total,ira,brokerage}"),T(" record per day to "),C("data/history.json"),T(" — idempotent per date, so re-running a day overwrites rather than duplicates — and the totals are computed from the already-merged holdings, so the benchmark line can never drift from the portfolio tabs. "),C("scripts/build_alerts.py"),T(" diffs yesterday's snapshot against today's on status, cross and 52-week low for every held ticker, appends new transitions to a rolling 60-day store, and emits the last 14 days as "),C("alerts"),T(". It makes "),T("no connector calls",{bold:true}),T(" — every field it needs is already in DATA — and it is "),T("dq-guarded",{bold:true}),T(": a row the integrity guard flagged as corrupt or missing is skipped, so a bad price can never fabricate a Death Cross or a false 52-week low. "),C("scripts/build_dividends.py"),T(" builds the forward 12-month income grid from two tiers (see 6.5); "),C("scripts/build_dcf.py"),T(" builds the valuation bases (6.6) and "),C("scripts/build_lookthrough.py"),T(" the fund look-through map (6.7). All five "),T("preserve the prior value on any failure",{bold:true}),T(" — a feed can be stale, but it is never blanked, and the run report says which.")]));
children.push(H2("6.5 · Dividend calendar — two-tier sourcing"));
children.push(P([T("Per-symbol dividend dates are only partially available on the current market-data plan, so the calendar is built from two tiers and the difference is stated plainly in the interface rather than hidden. "),T("Tier 1 (declared) ",{bold:true}),T("— held "),T("stocks",{bold:true}),T(" via the FMP "),C("dividends-company"),T(" endpoint: real ex-dividend, record and pay dates, amount and frequency, with the next undeclared quarter projected from the cadence. "),T("Tier 2 (estimated) ",{bold:true}),T("— "),T("ETFs and funds",{bold:true}),T(", whose per-symbol dividend dates are plan-gated: annual income = the security's dividend yield × its market value, spread across the year by the cadence declared in "),C("data/dividend_schedule.json"),T(" (e.g. JEPI/JEPQ monthly, SCHD/VOO quarterly) and placed at month level. Declared rows render green with an exact date; estimated rows render amber and are labelled "),T("estimated",{italics:true}),T(". A stock whose fetch fails simply falls back to Tier 2. Correction (July 2026): an earlier note recorded the "),C("dividends-company"),T(" endpoint as plan-gated for stocks. It is not — it "),T("throttles",{bold:true}),T(" under parallel load and returns access errors that look like gating. Calling it sequentially in batches of three restores it. Per-symbol ETF dividend dates remain genuinely gated, which is why Tier 2 exists.")]));
children.push(H2("6.6 · Valuation bases (DCF) — sourcing and the endpoint prohibition"));
children.push(P([C("scripts/build_dcf.py"),T(" assembles a compact valuation "),T("base",{bold:true}),T(" per held stock from four primary endpoints: "),C("analyst → financial-estimates"),T(" (forward revenue / EBIT / D&A per fiscal year, with analyst counts) and the filed "),C("statements"),T(" — income statement (base revenue, EBIT, effective tax, diluted shares), cash-flow statement (D&A, capex, working capital) and balance sheet (total debt, cash and short-term investments). An optional revenue-product-segmentation call adds segment revenue for the sum-of-the-parts view. The base is embedded; the "),T("model runs client-side",{bold:true}),T(", so every judgement input — capex intensity, terminal capex normalisation, fade length, consensus haircut, beta, risk-free rate, equity risk premium, terminal growth — is a visible user control rather than a hidden default.")]));
children.push(P([T("The market-data provider also exposes a ready-made "),C("discountedCashFlow"),T(" endpoint. "),T("It must not be used.",{bold:true}),T(" It is not data but an opinionated model: it projects every ratio (EBIT margin, D&A, capex, working capital) as a five-year historical average — a silent mean-reversion assumption that crushes any company whose economics have improved — and it derives WACC from a raw trailing beta. Its "),C("netDebt"),T(" field is also wrong (in the balance-sheet endpoint too): it subtracts only cash and equivalents, ignoring short-term investments. For one large-cap it reports $81.9B of net debt against a true $17.6B; for another it reports $0.8B of net debt when the company in fact holds roughly $51B of "),T("net cash",{italics:true}),T(". Net debt is therefore always computed as "),C("totalDebt − cashAndShortTermInvestments"),T(". A related trap: the endpoint's growth parameters are expressed as "),T("fractions",{bold:true}),T(" while its rate parameters are expressed as "),T("percent",{bold:true}),T(", so passing 10 for 10% growth is read as 1000% and returns a negative equity value with no error at all.")]));
children.push(P([T("The model is three-stage: Stage 1 follows analyst consensus; Stage 2 fades growth toward the terminal rate and capex toward maintenance capex over ten years; Stage 3 "),T("rebuilds",{bold:true}),T(" the steady-state free cash flow from normalised inputs rather than growing the last projected year (which would inherit peak capex and the working-capital investment needed to fund growth that has, by definition, stopped). Beta is Blume-adjusted. A "),T("reverse DCF",{bold:true}),T(" reports the discount rate the market is applying to consensus. The output is gated against published independent fair values before release — the current build lands within ~3–5% of them — and that external benchmark, not an internal parity check, is the acceptance test.")]));
children.push(P([T("A "),T("segment sum-of-the-parts",{bold:true}),T(" view values each reported business line separately (segments inherit the company's consensus growth path and margin by default, so the segment view reconciles exactly to the total, and per-segment margins are then user-editable). It is "),T("refused outright",{bold:true}),T(" when the filed segments do not sum to reported revenue within 2% — some issuers file overlapping lines that double-count revenue, and a valuation built on a 12% revenue overstatement is worse than no valuation at all. Filed effective tax rates can also be negative, and are clamped to 21%.")]));
children.push(H2("6.7 · Fund look-through"));
children.push(P([C("scripts/build_lookthrough.py"),T(" reads each held fund's holdings and stores its top-50 names, an explicit long-tail "),C("residualW"),T(", a "),C("cashW"),T(", and a per-fund disclosure date. The "),T("roll-up runs client-side",{bold:true}),T(" against current position values, so it always agrees with the portfolio tabs, and it decomposes the household into: named single-name exposure (direct shares plus shares reaching the household through funds), the diversified remainder inside those funds, cash held inside funds, and funds not yet mapped.")]));
children.push(P([T("The design rule is that "),T("a look-through which hides its gaps understates the exact concentration it exists to reveal",{bold:true}),T(". So nothing is dropped: the long tail is a bucket, cash is a bucket, and an unmapped fund is a bucket — and while any fund is unmapped, every percentage is presented as a "),T("floor",{bold:true}),T(" (\u201c\u2265\u201d) rather than a total. A "),T("reconciliation gate",{bold:true}),T(" enforces this: named + remainder + cash + unmapped must equal the household total, and the popup shows the residual error. Two honesty caveats are surfaced in the interface: funds holding equity-linked notes rather than shares are flagged as approximate, and mutual funds disclose holdings quarterly, so their as-of date can lag ~90 days. A duplicate-tracker detector flags near-identical products held more than once (for example three separate S&P 500 trackers).")]));
children.push(H1("7 · Runtime & Live-Price Service"));
children.push(P("The dashboard is a single script scope. Tabs are built once at load. Portfolio tabs pull live prices through a shared, cached service:"));
children.push(bullet([C("livePrice(ticker)"),T(" — cache-checks LP: (day TTL), else resolves and fetches; writes to LIVEPX[ticker].")]));
children.push(bullet([C("resolveTyped(ticker)"),T(" — find_securities, picks the exact :TICKER listing, returns id + isETF from security_type (MGK→ETF, NVO→Novo Nordisk).")]));
children.push(bullet([C("companyLiveMetrics()"),T(" parses company_tearsheet → price_performance.current_market; "),C("etfLiveMetrics()"),T(" parses the ETF tearsheet Price Performance table.")]));
children.push(bullet([C("attachLivePrices / autoLive / runLive"),T(" — wire the Load live prices button and the once-per-day auto-load fired from the tab-click handler.")]));
imgPara("05_liveprice_workflow.png","Figure 4 — Runtime Load-live-prices workflow (IRA / Brokerage tab)").forEach(x=>children.push(x));

// 8
children.push(H1("8 · Live-Price Sequence"));
imgPara("07_sequence.png","Figure 5 — Sequence of a live price fetch (cache → resolve → connector → recompute)").forEach(x=>children.push(x));

// 9
children.push(H1("9 · Caching & Freshness Model"));
children.push(P([T("All caches live in one localStorage object, "),C("tdd_pcache_v5"),T(", each entry timestamped and read through "),C("pcGet(key, ttl)"),T(". On quota pressure the oldest third is evicted. DAY = 86,400,000 ms.")]));
children.push(rtable([1500,3600,1200,3060],
 ["Prefix","Holds","TTL","Used by"],
 [
 [[C("LP:")],[T("Live price metrics per ticker")],[T("1 day")],[T("portfolio tabs (livePrice)")]],
 [[C("LPAUTO:")],[T("Per-tab auto-loaded-today marker")],[T("1 day")],[T("autoLive guard")]],
 [[C("STY:")],[T("Typed entity resolution (id + isETF)")],[T("30 days")],[T("resolveTyped")]],
 [[C("EID:")],[T("Entity id + name")],[T("30 days")],[T("popup resolveEntity")]],
 [[C("ETF:")],[T("Raw ETF tearsheet markdown")],[T("7 days")],[T("ETF price + popup")]],
 [[C("CT:")],[T("Compact company tearsheet")],[T("7 days")],[T("fundamentals popup")]],
 [[C("SENT:")],[T("Sentiment + news flags")],[T("1 day")],[T("risk summary")]],
 [[C("F: / ETM:")],[T("Fund/ETF scoring metrics")],[T("7 days")],[T("ranking modals")]],
 ]));
children.push(P([T("Freshness: ",{bold:true}),T("connector prices are the latest available session close (they change once per trading day). Universe tabs are only as fresh as the last time the workbook was opened in Excel 365. The daily task and the Load live prices button are the two ways to force-refresh.")]));

// 10
children.push(H1("10 · Daily Scheduled Refresh"));
children.push(P("Runs at 9am local. Three integrity gates protect the last-good artifact: the main workbook must be a well-formed zip with all six sheets; each holdings file must pass its own read gate or the import is skipped; and each connector fetch may fail without blanking a holding."));
imgPara("04_scheduled_workflow.png","Figure 6 — Daily 9am scheduled refresh workflow with integrity gates and fallbacks").forEach(x=>children.push(x));

// 11
children.push(H1("11 · Holdings-Update Workflow"));
children.push(P("Adding or changing a position is a single edit to the source file. Everything downstream is automatic on the next run."));
imgPara("06_holdings_workflow.png","Figure 7 — Holdings-update workflow (hands-off after the source edit)").forEach(x=>children.push(x));
children.push(P([T("One dependency: ",{bold:true}),T("the source files must be hydrated locally by OneDrive at 9am. If they read as placeholders, the task skips the import and preserves prior holdings, flagging ⚠ IMPORT SKIPPED at the top of its report.")]));

// 12
children.push(H1("12 · Failure Modes & Safeguards"));
children.push(rtable([3900,5460],
 ["Failure mode","Safeguard"],
 [
 [[T("Workbook mid-save / truncated / locked")],[T("Step-0 integrity gate (zip + EOCD + 6 sheets); ABORT and keep last-good artifact.")]],
 [[T("Holdings file is a OneDrive placeholder")],[T("Per-file import gate → SKIP + preserve prior holdings; ⚠ flagged in report. Never wipes positions.")]],
 [[T("Connector down / ticker unresolved")],[T("Keep carried-over last-known price (or import value); never blank. Button/auto no-ops when connector unreachable.")]],
 [[T("Dropping app-only data on rebuild")],[T("ira/brokerage/coreRank preserved from existing HTML; ABORT rather than write an empty array.")]],
 [[T("Broken HTML published")],[T("Validation gate: node parse + </html> + two </script> before write/publish.")]],
 [[T("Wrong entity (e.g. GOOG→wrong company)")],[T("Exact :TICKER listing match + alias table; type from security_type.")]],
 [[T("localStorage quota exceeded")],[T("Evict oldest third and retry write.")]],
 ]));

// 13
children.push(H1("13 · Privacy & Security"));
children.push(bullet([T("Holdings stay local. ",{bold:true}),T("Positions live in local Excel files and the embedded snapshot; there is no live brokerage-account connection.")]));
children.push(bullet([T("Connector sees only tickers. ",{bold:true}),T("The Bigdata MCP is queried by symbol for public market data — never quantities, cost basis, or account values.")]));
children.push(bullet([T("Offline-safe. ",{bold:true}),T("Opened without the connector, the dashboard renders the embedded snapshot; live features degrade gracefully.")]));
children.push(bullet([T("Not financial advice. ",{bold:true}),T("Scorecards, risk summaries, and retirement projections are rules-based, illustrative screens.")]));

// 14
// ---- 14 · Rules-Based Ranking Engine ----
children.push(H1("14 · Rules-Based Ranking Engine (V2)"));
children.push(P([T("The three rankings — sector company, fund/category, and the growth-core shortlist — run on a declarative rules engine rather than hard-coded scoring. The engine is authored once in "),C("src/ranking/"),T(" and materialised into the artifact by "),C("scripts/sync_engine.js"),T(", keeping a single source of truth (guarded by "),C("tests/ranking/inline_sync.js"),T(" and a --check mode).")]));
imgPara("08_ranking_engine.png","Figure 8 — Rules-based ranking engine: source of truth, injection, and in-artifact use").forEach(x=>children.push(x));
children.push(H2("14.1 · Engine"));
children.push(P([C("engine.js"),T(" (v0.4, pure, dual Node/browser) exposes "),C("scoreItem"),T(" (absolute per-item), "),C("rankGroup"),T(" (group-relative percentile with dimensions), weighted aggregation, IF/THEN "),C("conditions"),T(" (gate / bonus / penalty / cap / floor), and "),C("validateRuleset"),T(". Every score is explainable — the engine records each factor, dimension, and which rules fired.")]));
children.push(H2("14.2 · Rulesets"));
children.push(rtable([2700,6660],
 ["Ruleset","Role"],
 [
 [[C("company_fundamentals.json")],[T("Absolute 12-factor company score (feeds the sector ranking's fundamentals factor and the fundamentals popup).")]],
 [[C("sector_company.json")],[T("Sector company ranking: 50% fundamentals + 50% SMA trend, percentile-blended within the sector.")]],
 [[C("fund_category.json")],[T("Fund/category ranking: Overview, Holdings, Returns, Risk, SMA-trend dimensions.")]],
 [[C("growth_core.json")],[T("Growth-core shortlist: Quality, Valuation, Trend, Analyst (quality-tilted).")]],
 ]));
children.push(H2("14.3 · Editor and explainability (in the artifact)"));
children.push(bullet([T("Weight sliders (dimension + per-factor) and factor on/off toggles, with live re-rank.")]));
children.push(bullet([T("Editable good/bad thresholds on the company-fundamentals factors (recomputes from cache, no connector calls).")]));
children.push(bullet([T("Conditions builder: single-clause IF/THEN rules (exclude / bonus / penalty / cap / floor) over metrics, factors, or the composite.")]));
children.push(bullet([T("Presets, export/import ruleset JSON, and a per-row score-breakdown popover showing dimension contributions and fired rules.")]));
children.push(H2("14.4 · Growth-core daily recompute"));
children.push(P([T("The growth-core scorecard is live in-artifact and also recomputed each morning: the scheduled task fetches the shortlist's fundamentals via the connector, and "),C("scripts/recompute_core.js"),T(" rebuilds "),C("coreRank"),T(" through the "),C("growth_core"),T(" ruleset, preserving the prior snapshot on any failure (never blanks).")]));

// ---- 15 · Build process flows & feature summary ----
children.push(H1("15 · Build Process Flows & Feature Summary"));
children.push(H2("15.1 · Build and publish flow"));
children.push(P([T("Sources (workbook + holdings exports) to Python, which assembles the 15-key "),C("dash_data_live.json"),T("; injected into "),C("dashboard_tpl.html"),T(" (replacing the DATA placeholder); validated (node parse, </html>, two </script>); written to both HTML copies on disk. The ranking-engine block is injected separately from "),C("src/ranking/"),T(" by "),C("sync_engine.js"),T(". See Figures 3 and 8.")]));
children.push(H2("15.2 · Daily automation flow"));
children.push(P([T("9am: integrity-gate the workbook, FETCH the universe from FMP batch-quote and BUILD it via build_market_data.py (FMP -> STOCKHISTORY tail -> carry-forward; STOCKHISTORY fallback if FMP fails), re-import IRA/Brokerage holdings (gated, preserve-on-fail), reprice off-index holdings via the connector, recompute growth-core, carry split badges (data/splits.json) and auto-suggest split candidates, run data-integrity checks, regenerate + validate, write both HTML copies, status report. Every step has a safe fallback; nothing is ever blanked. See Figure 6.")]));
children.push(H2("15.3 · Feature summary"));
children.push(rtable([3000,6360],
 ["Area","What it does"],
 [
 [[T("Market universe")],[T("Six tabs (S&P 500, Nasdaq-100, Dow, Top-100 ETFs, Thematic ETFs, Mutual Funds) with drawdown, status, SMA trend, cross signals.")]],
 [[T("Private portfolios")],[T("IRA and Brokerage tabs; market value = qty x live price; Load-live-prices + daily auto-load; allocation and gain/loss.")]],
 [[T("Retirement planner")],[T("Two-account model (IRA income / Brokerage growth), projections, rebalancing targets.")]],
 [[T("Fundamentals popup")],[T("Risk summary (incl. supply-chain), advisor scorecard, sentiment, key-fundamentals grid.")]],
 [[T("Rules-based rankings")],[T("Sector, fund, and growth-core rankings on a customizable engine: weights, thresholds, IF/THEN conditions, explain-per-row.")]],
 [[T("Provider adapter (BDX)")],[T("All connector I/O + response-shape mapping isolated behind one object; robust to provider/shape changes.")]],
 [[T("Automation")],[T("Daily 9am refresh + growth-core recompute with integrity gates and safe fallbacks.")]],
 [[T("Corporate actions & data integrity")],[T("Split / reverse-split badges on every tab (from data/splits.json), auto-hiding after 90 days; the daily task auto-suggests split candidates and flags impossible rows (SMA/high outside the 52-week band, or Cross Signal disagreeing with sma50 vs sma200). Planned (V3): a per-ticker Corporate Actions summary in the Fundamentals popup — splits, dividends, and M&A.")]],
 [[T("Data sourcing (FMP-primary)")],[T("Live universe data from FMP batch-quote; provider chain FMP -> STOCKHISTORY tail -> carry-forward; data/market_data.xlsx written each run; no Excel-365 dependency.")]],
 [[T("Data-integrity guard + badge")],[T("52-week band / ratio validation of every row; corrupt/#N/A signals suppressed and tagged dq, shown as a ⚠ badge.")]],
 [[T("Overview spectrum")],[T("3-column health view (Best / Correction / Worst), equities+ETFs merged with index-membership chips; per-row data bars colored by bucket.")]],
 [[T("1-year charts (index + macro)")],[T("Own-scale sparklines for 4 US indices and a Macro & commodities card (oil, gold, silver, copper, rare earths, USD vs EUR/JPY/GBP/CNY, consumer sentiment); built by build_index_history.py / build_macro_history.py and embedded, no runtime calls.")]],
 [[T("Fundamentals factsheet")],[T("Popup opens with a plain-English company/ETF summary, a vitals grid (sector, HQ, founded, employees, market cap / issuer, expense, AUM, holdings, top holding), and a data-derived Did-you-know fun fact.")]],
 [[T("Modular template build")],[T("The single-file dashboard is assembled from 27 concern-based modules in src/dash/ by assemble_dashboard.py (golden-master byte check); edits are small-file, not surgery on a 165 KB monolith. Two gates guard every republish: the golden-master byte check and a full-script stubbed-DOM harness — a syntax check alone cannot catch a silently truncated module, which will still assemble cleanly and then blank every panel at runtime.")]],
 [[T("Logging & debug")],[T("Every daily run writes a structured JSONL log + a human report under logs/ (via log_util.py, auto-pruned); an opt-in in-artifact debug panel (?debug=1 or Shift+D) shows connector calls, data provenance, cache, and errors with a copy-report button.")]],
 [[T("Benchmark vs the market")],[T("Retirement-tab card indexing household value to 100 against Dow / Nasdaq / S&P 500 from DATA.history, with a live alpha readout. Starts in context mode (the three real index curves) and switches to a rebased head-to-head once two days of history exist — no fabricated back-cast.")]],
 [[T("Drawdown timeline")],[T("Underwater chart (src/dash/46_drawdown.js): each series' drawdown from its own running peak over the past year, with Normal / Correction (-10%) / Bear (-20%) bands shaded; legend shows current and worst-of-year per series.")]],
 [[T("Change alerts")],[T("Daily prior-vs-today diff of held names (build_alerts.py): bear / death-cross / correction / new 52-week low / recovery / golden-cross. Colour-coded icon beside the ticker on the IRA and Brokerage tables opens a from->to popup with recent history; the run report lists the day's transitions. No connector calls; dq-guarded.")]],
 [[T("Dividend income calendar")],[T("Retirement-tab KPI tile (projected annual income) opens a popup with annual / forward-yield / next-30-day metrics, a 12-month bar chart split by account, and an upcoming-payments list marking each row declared (exact) or estimated (yield-based). Two-tier build — see 6.5.")]],
 [[T("Monte Carlo projection")],[T("Retirement-tab KPI tile (median household value at year N) opens a seeded, reproducible 10,000-path simulation with an SVG fan chart (10th/25th/50th/75th/90th percentiles) and controls for horizon, annual contribution and return assumptions. Per-holding volatility is estimated with the Parkinson estimator from the 52-week high/low already in DATA — no new data source, no connector calls.")]],
 [[T("DCF valuation")],[T("Fair-value strip in the Fundamentals popup and a full valuation popup: three-stage DCF (consensus -> 10-year fade -> rebuilt steady state), Blume-adjusted beta, sensitivity grid and a reverse DCF reporting the discount rate the market applies to consensus. Every assumption is a user control. Bases precomputed by build_dcf.py from analyst consensus + filed statements; benchmarked against published independent fair values before release - see 6.6.")]],
 [[T("Segment sum-of-the-parts")],[T("Trefis-style tab in the valuation popup: each reported business line valued separately, segments inheriting the company consensus path and margin by default (so the segment view reconciles exactly to the total) with per-segment margins editable. Refused with an explanation when the filed segments do not sum to reported revenue within 2%.")]],
 [[T("Portfolio look-through")],[T("Retirement-tab KPI tile (hidden exposure) opens the household X-ray: true single-name exposure, direct shares vs shares reaching the household through funds, plus a duplicate-tracker detector. Explicit buckets for the long tail, cash inside funds, and funds not yet mapped; a reconciliation gate requires the buckets to sum to the household total, and every % is a floor while coverage is incomplete - see 6.7.")]],
 [[T("Earnings memos")],[T("A small memo badge sits beside a ticker for the 30 days after it reports (a client-side freshness test, so it expires on its own) and opens an Earnings popup: reported-vs-consensus EPS/revenue beat/miss with surprise %, an 8-quarter EPS trend, drivers, the forward/normalization read, watch-items and the analyst rating. Precomputed by build_earnings.py (Bigdata tearsheet); a long-form Markdown/PDF memo is also generated to reports/earnings/.")]],
 [[T("Closed-loop DCF")],[T("Four feedback loops around the valuation, all client-side on the embedded base: (1) reverse-solve - one bracketed monotone solver inverts the model for any single assumption to hit a target, or reports no-solution; (2) calibrate-to-anchor - tunes within plausible bands to reconcile the model to an external reference, and FLAGS rather than forces when nothing fits; (4) probabilistic - a seeded assumption-distribution simulation giving P10/P50/P90 and P(undervalued); (5) drift monitor (dcf_monitor.js, nightly) - records the model-vs-anchor gap and flags the suspect case. Plus an editable normalized-margin lever the fade glides toward.")]],
 [[T("Consensus-EBIT reconstruction")],[T("FMP's consensus operating-income estimate is corrupt for some names (below consensus net income - impossible). build_dcf.py detects it at the AGGREGATE level (sum(ebitAvg) < 0.85 x sum(netIncomeAvg), matched subsets, loss-maker-guarded) and rebuilds EBIT = netIncome / (1 - tax), re-basing D&A to base-year intensity - flagged via ebitRecon and disclosed in the popup. The gate is self-limiting: mild per-year noise does not trip it.")]],
 ]));

children.push(H2("15.4 · Feature backlog"));
children.push(P([T("Committed, effort-tagged backlog (detailed specs in TASKS.md). Effort: S ≈ hours, M ≈ a day, L ≈ multi-day. Listed here as planned scope — not yet built. Capabilities in 15.3 are Baseline v1.0.")]));
children.push(rtable([3500,900,4960],["Feature","Effort","Notes / dependency"],[
 [[T("Multi-scenario retirement modeling")],[T("M")],[T("Adjustable assumptions with side-by-side scenarios; client-side.")]],
 [[T("Tax-lot / cost-basis detail & realized-gain tracking")],[T("L")],[T("Needs a richer per-lot broker export.")]],
 [[T("Export to PDF / email digest")],[T("M")],[T("PDF via the pdf skill; email needs a mail connector (not currently connected).")]],
 [[T("Corporate Actions summary in the Fundamentals popup")],[T("M")],[T("Splits / dividends / M&A; source-less types (spin-offs, ticker/name changes, delistings) future.")]],
]));
children.push(H1("16 · File & Script Appendix"));
children.push(rtable([3700,5660],
 ["File","Role"],
 [
 [[C("tech100_drawdown_SP_NAS.xlsx")],[T("Universe workbook (6 tabs): membership + static columns + STOCKHISTORY fallback tail rung.")]],
 [[C("market_data.xlsx")],[T("Machine-written live-data workbook (FMP-sourced, plain values; regenerated each run).")]],
 [[C("IRA.xlsx"),T(" · "),C("Brokerage.xlsx")],[T("Flat holdings exports (Symbol, Quantity, Price Paid, Value).")]],
 [[C("IRA_Portfolio.xlsx"),T(" · "),C("Brokerage_Portfolio.xlsx")],[T("Generated live-formula Excel views (standalone).")]],
 [[C("dashboard_tpl.html")],[T("Template — all UI/logic; holds the DATA placeholder.")]],
 [[C("tech_drawdown_dashboard.html")],[T("Deployed artifact HTML (DATA injected).")]],
 [[C("dash_data_live.json")],[T("19-key data snapshot (universe + ira/brokerage/coreRank/splits/indexHistory/macroHistory/history/alerts/dividends/dcf/lookthrough/earnings/dcfMonitor).")]],
 [[C("build_market_data.py")],[T("FMP-primary universe build (chain FMP->STOCKHISTORY tail->carry-forward) -> market_data.xlsx + DATA.")]],
 [[C("build_index_history.py")],[T("Pure transform: FMP light arrays -> weekly 1-yr indexHistory (4 US indices).")]],
 [[C("build_macro_history.py")],[T("Pure transform: FMP commodity/forex/economics -> macroHistory (oil/metals/USD-FX/sentiment); FX inverted to USD-strength.")]],
 [[C("build_history.py")],[T("Pure transform: appends {date,total,ira,brokerage} to data/history.json (idempotent per date) -> DATA.history; feeds the benchmark + drawdown-timeline cards. No connector calls.")]],
 [[C("build_alerts.py")],[T("Pure transform: diffs prior vs today held names on status / cross / 52-week low -> data/alerts.json (rolling 60 days) + DATA.alerts (last 14 days). dq-guarded; no connector calls.")]],
 [[C("build_dividends.py")],[T("Pure transform: Tier-1 declared stock dividends (FMP) + Tier-2 yield-based ETF/fund estimates (data/dividend_schedule.json) -> DATA.dividends (forward 12-month grid, split by account).")]],
 [[C("data/dividend_schedule.json")],[T("Seed file: per-ETF/fund payment cadence (and optional yield override) used for the Tier-2 dividend estimates.")]],
 [[C("src/dash/*")],[T("27 concern-based source modules — the dashboard source of truth; concatenated by assemble_dashboard.py.")]],
 [[C("assemble_dashboard.py")],[T("Concatenates src/dash modules into dashboard_tpl.html (byte-for-byte golden-master); run before DATA injection in rebuild_all.py.")]],
 [[C("log_util.py")],[T("Pipeline run logging — leveled JSONL events + latest_run.md + runs.jsonl history under logs/ (RunLogger + CLI); the daily task records each run.")]],
 [[C("src/dash/05_debug.js")],[T("Opt-in in-artifact debug panel (DBG ring buffer, global error handlers, provenance/cache/env tabs); ?debug=1 or Shift+D.")]],
 [[C("logs/")],[T("Per-run run_*.jsonl + latest_run.md + runs.jsonl (auto-pruned to the last 30 runs).")]],
 [[C("integrity_guard.py")],[T("Data-quality guard (52-wk band / ratio); suppresses corrupt/#N/A rows, tags dq (badge).")]],
 [[C("rebuild_all.py")],[T("Regenerate universe tabs + preserve app data + redeploy.")]],
 [[C("build_ira.py"),T(" · "),C("build_brokerage.py")],[T("Build the live-formula portfolio workbooks.")]],
 [[C("validate_all.py")],[T("Reconcile artifact DATA vs workbook (coverage + field + recompute).")]],
 [[T("Scheduled task / daily_refresh.md")],[T("Daily 9am import + reprice + recompute growth-core + regenerate + write both HTML copies.")]],
 [[C("src/ranking/*")],[T("Rules engine: engine.js, store.js, metrics.js + ruleset JSONs (single source of truth).")]],
 [[C("sync_engine.js")],[T("Materialise the ranking engine from src/ranking into the template block.")]],
 [[C("recompute_core.js")],[T("Rebuild the growth-core coreRank via the growth_core engine (used by the daily task).")]],
 ]));

const doc=new Document({
  creator:"Tech Drawdown", title:"Tech Drawdown — Architecture & Design",
  styles:{ default:{document:{run:{font:"Arial",size:22}}},
    paragraphStyles:[
      {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:30,bold:true,font:"Arial",color:INK},
        paragraph:{spacing:{before:320,after:140},outlineLevel:0,
          border:{left:{style:BorderStyle.SINGLE,size:24,color:GOLD,space:10}}}},
      {id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:26,bold:true,font:"Arial",color:INK},
        paragraph:{spacing:{before:220,after:100},outlineLevel:1}},
      {id:"Heading3",name:"Heading 3",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:22,bold:true,font:"Arial",color:DGOLD},
        paragraph:{spacing:{before:160,after:60},outlineLevel:2}},
    ]},
  numbering:{config:[{reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",
    alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:560,hanging:280}}}}]}]},
  sections:[{
    properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440}}},
    footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,
      children:[new TextRun({text:"Tech Drawdown — Architecture & Design    ·    ",size:16,color:GRAY}),
        new TextRun({children:["Page ",PageNumber.CURRENT],size:16,color:GRAY})]})]})},
    children
  }]
});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(path.join(DOCS_DIR,'Tech_Drawdown_Architecture.docx'),b);
  console.log('docx bytes',b.length);});
