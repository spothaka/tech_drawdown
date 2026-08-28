function esgOf(t){ const ep=t&&t.esg_data&&t.esg_data.esg_performance; if(!ep)return null; const dates=Object.keys(ep).sort().reverse(); if(!dates.length)return null; const d=ep[dates[0]]; return {esg:d.esg_average_score,e:d.environmental_score,s:d.social_score,g:d.governance_score,sESG:d.sector_esg_average_score,sE:d.sector_environmental_score}; }
function kfhFromFundamentals(t){
  const f=t&&t.fundamentals; if(!f)return null;
  const pick=a=>(a||[]).find(x=>x&&(x.periodicity==='TTM'||x.fiscal_period==='TTM'))||(a||[])[0]||null;
  const R=pick(f.ratios)||{}, M=pick(f.key_metrics)||{};
  if(!Object.keys(R).length && !Object.keys(M).length) return null;
  const nz=v=>(v===0||v==null?null:v);
  return {
    price_to_earnings_ratio_ttm:nz(M.pe_ratio), price_to_sales_ratio_ttm:nz(M.price_to_sales),
    price_to_book_ratio_ttm:nz(M.price_to_book), ev_to_ebitda_ttm:nz(M.ev_to_ebitda),
    free_cash_flow_yield_ttm:M.free_cash_flow_yield, return_on_equity_ttm:R.return_on_equity,
    return_on_assets_ttm:R.return_on_assets, gross_profit_margin_ttm:R.gross_margin,
    net_profit_margin_ttm:R.net_margin, operating_profit_margin_ttm:R.operating_margin,
    debt_to_equity_ratio_ttm:R.debt_to_equity, debt_to_assets_ratio_ttm:R.debt_to_assets,
    current_ratio_ttm:R.current_ratio, quick_ratio_ttm:R.quick_ratio, cash_ratio_ttm:R.cash_ratio,
    asset_turnover_ttm:R.asset_turnover, interest_coverage_ratio_ttm:nz(R.interest_coverage),
    net_debt_to_ebitda_ttm:nz(R.net_debt_to_ebitda), dividend_yield_ttm:R.dividend_yield };
}
function compactCT(t){
  const k=BDX.companyK(t);
  const ad=(t&&t.analyst_data)||{};
  const ckm=(((t&&t.company_key_metrics)||[]).slice()).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  let mc= ckm.length?ckm[0].market_cap:null;
  if(mc==null && t&&t.fundamentals&&t.fundamentals.key_metrics){ const km=(t.fundamentals.key_metrics||[]).find(x=>x&&x.market_cap!=null); if(km)mc=km.market_cap; }
  return {k, ad:{price_targets:ad.price_targets,ratings:ad.ratings}, mc, esg: esgOf(t), p: BDX.companyProfile(t)};
}
function expandCT(ct){ return {key_financial_highlights:ct.k||{}, analyst_data:ct.ad||{}, company_key_metrics:[{date:'c',market_cap:ct.mc}]}; }
function cacheNote(ticker,isETF){ return '<div class="foot" style="margin-top:8px">Fundamentals cached locally · refreshes daily'+(isETF?'':' (sentiment daily)')+'. <a class="rfsh" style="color:var(--accent);cursor:pointer" data-tk="'+ticker+'" data-etf="'+(isETF?1:0)+'">↻ refresh now</a></div>'; }
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('.rfsh');if(a){e.preventDefault();const tk=a.dataset.tk,etf=a.dataset.etf==='1';pcDel(tk);delete fundCache[(etf?'E:':'C:')+tk];openTicker(tk,etf);}});
const ov=document.getElementById('modalOv'),mTitle=document.getElementById('modalTitle'),mBody=document.getElementById('modalBody');
function closeModal(){ov.classList.remove('open');var _c=ov.querySelector('.modal');if(_c)_c.classList.remove('wide');}
document.getElementById('modalX').onclick=closeModal;
ov.addEventListener('click',e=>{if(e.target===ov)closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('.tkr');if(a){e.preventDefault();openTicker(a.dataset.tk,a.dataset.etf==='1');}});

async function mcpCall(name,args){
  var _t=(typeof DBG!=='undefined')?DBG.timer('mcp',String(name||'').split('__').pop()):null;
  try{
    var t=liveMcpTransport();
    if(!t||!t.callMcpTool) throw new Error('no live connector');
    const r=await t.callMcpTool(name,args);
    if(r&&r.isError){ if(_t)_t(false,{err:'isError'}); throw new Error('connector returned an error'); }
    let p=r&&(r.structuredContent!=null?r.structuredContent:(r.content&&r.content[0]&&r.content[0].text));
    if(typeof p==='string'){try{p=JSON.parse(p);}catch(e){}}
    if(_t)_t(true);
    return p;
  }catch(e){ if(_t)_t(false,{err:String(e&&e.message||e)}); throw e; }
}
// Robust extraction of find_securities rows across connector response shapes:
//   {result:[{results:[...]}]}  |  [{results:[...]}]  |  {results:[...]}  |  [row,row,...]
function _secRows(f){
  if(!f) return [];
  var x=(f.result!==undefined)?f.result:f;
  if(Array.isArray(x)){
    if(x.length && x[0] && Array.isArray(x[0].results)) return x[0].results;
    return x;
  }
  if(x && Array.isArray(x.results)) return x.results;
  return [];
}

// ===================== PROVIDER ADAPTER (BDX) =====================
// Single boundary for ALL market-data connector I/O + response-shape mapping.
// If the provider (or its response shapes) change, edit HERE — call sites don't move.
//   Endpoints .... BDX.EP            Transport .... mcpCall / BD
//   Search ....... BDX.search(query)                 -> normalized rows[]
//   Company ...... BDX.companyTearsheet(id,secs) ; BDX.companyK(t) (fundamentals field-map) ; BDX.companyQuote(t)
//   ETF .......... BDX.etfMarkdown(id[,pretty]) ; BDX.etfMetrics(md) ; BDX.etfQuote(md)
//   Sentiment .... BDX.sentimentRaw(id) ; BDX.sentimentFlags(s)
const BDX={
  EP:{ search:BD+'find_securities', company:BD+'bigdata_company_tearsheet', etf:BD+'bigdata_etf_tearsheet', sentiment:BD+'bigdata_sentiment_tearsheet', dcf:FMP+'discountedCashFlow' },
  async search(query){ return _secRows(await mcpCall(this.EP.search,{query:query})); },
  async companyTearsheet(id,sections){ return mcpCall(this.EP.company,{rp_entity_id:id,company_type:'Public',sections:sections}); },
  async etfMarkdown(id,pretty){ const md0=await mcpCall(this.EP.etf,{rp_entity_id:id}); return (typeof md0==='string')?md0:(pretty?JSON.stringify(md0,null,2):JSON.stringify(md0)); },
  async sentimentRaw(id){ return mcpCall(this.EP.sentiment,{rp_entity_id:id}); },
  // DCF (FMP): custom model — growth params are FRACTIONS, rate params are PERCENT (see 51_dcf.js)
  async dcfRaw(symbol,args){ return mcpCall(this.EP.dcf, Object.assign({endpoint:'custom-dcf-advanced',symbol:symbol}, args||{})); },
  // company fundamentals -> normalized TTM object (handles OLD key_financial_highlights AND NEW fundamentals.* shape)
  companyK(t){ var kfh=(t&&t.key_financial_highlights)||{}, k={}; for(var key in kfh){ if(key!=='historical_ratios') k[key]=kfh[key]; }
    if(k.price_to_earnings_ratio_ttm==null && k.debt_to_equity_ratio_ttm==null && k.net_profit_margin_ttm==null){ var fk=kfhFromFundamentals(t); if(fk) k=fk; } return k; },
  companyQuote(t){ return companyLiveMetrics(t); },
  etfQuote(md){ return etfLiveMetrics(md); },
  // ETF tearsheet markdown -> normalized metrics
  etfMetrics(md){ if(!md||typeof md!=='string') return null; var num=function(re){var mm=md.match(re);return mm?parseFloat(mm[1].replace(/,/g,'')):null;};
    return { expense:num(/Expense Ratio \(TER\)\s*\|\s*([\d.]+)%/), premdisc:num(/Premium\/Discount to NAV\s*\|\s*([+\-]?[\d.]+)%/),
      top10:num(/Top-10 Weight\s*\|\s*([\d.]+)%/), ret1y:num(/\|\s*1Y\s*\|\s*([+\-]?[\d.]+)%/), ret3m:num(/\|\s*3M\s*\|\s*([+\-]?[\d.]+)%/),
      maxdd:num(/Max Drawdown \(1Y\)\s*\|\s*(-?[\d.]+)%/), vol60:num(/Realized Volatility \(60D\)\s*\|\s*([\d.]+)%/) }; },
  // company_overview section -> normalized profile for the factsheet card
  companyProfile(t){ var o=(t&&t.company_overview)||{}; if(!o.company_name && !o.description && !o.sector) return null;
    var desc=o.description||'';
    var fm=desc.match(/[Ff]ounded in (\d{4})/)||desc.match(/incorporated[^0-9]*(\d{4})/);
    var founded=fm?fm[1]:(o.ipo_date?String(o.ipo_date).slice(0,4):null);
    var hqm=desc.match(/headquartered in ([^.]+)\./); var hq=hqm?hqm[1].trim():(o.country||null);
    var chg1y=null; try{ var pc=((t.price_performance||{}).price_changes)||[]; var y=pc.filter(function(x){return x.period==='1Y';})[0]; chg1y=y?y.change_pct:null; }catch(e){}
    return {name:o.company_name||null,sector:o.sector||null,industry:o.industry||null,country:o.country||null,exchange:o.exchange||null,ceo:o.ceo||null,employees:o.full_time_employees||null,mcap:o.market_cap||null,ipo:o.ipo_date||null,founded:founded,hq:hq,desc:desc||null,chg1y:chg1y}; },
  // ETF tearsheet markdown -> factsheet facts
  etfFacts(md){ if(!md||typeof md!=='string')return null;
    var s=function(re){var m=md.match(re);return m?String(m[1]).trim():null;};
    var n=function(re){var m=md.match(re);return m?parseFloat(m[1].replace(/,/g,'')):null;};
    var dm=md.match(/###\s*Description\s*\n+([^\n]+)/); var desc=dm?dm[1].trim():null;
    var hm=md.match(/\|\s*1\s*\|\s*([^|]+?)\s*\|[^|]*\|[^|]*\|\s*([\d.]+)%/);
    return {provider:s(/\|\s*Provider\s*\|\s*([^|\n]+?)\s*\|/),assetClass:s(/\|\s*Asset Class\s*\|\s*([^|\n]+?)\s*\|/),aum:s(/Assets Under Management \(AUM\)\s*\|\s*([^|\n]+?)\s*\|/),expense:n(/Expense Ratio \(TER\)\s*\|\s*([\d.]+)%/),holdings:n(/Holdings Count\s*\|\s*([\d,]+)/),inception:s(/Inception Date\s*\|\s*([\d-]+)/),exchange:s(/Listing Exchange\s*\|\s*([^|\n]+?)\s*\|/),top10:n(/Top-10 Weight\s*\|\s*([\d.]+)%/),topName:hm?hm[1].trim():null,topWeight:hm?parseFloat(hm[2]):null,desc:desc}; },
  // sentiment tearsheet -> {signals, opFlags, scFlags}
  sentimentFlags(s){ if(!s) return null;
    var opRe=/cyber|breach|hack|recall|lawsuit|litigation|strike|supply chain|outage|resign|steps down|layoff|investigation|fraud|disrupt|shortage|defect|probe|fine/i;
    var scRe=/supply chain|shortage|component|chip shortage|logistics|freight|shipping|\bports?\b|container|canal|tariff|sanction|embargo|export ban|pandemic|covid|lockdown|\bwar\b|conflict|invasion|geopolit|oil price|crude oil|opec|energy price|earthquake|hurricane|typhoon|flooding|wildfire|natural disaster|recession|inflation|rate hike|downturn|\bcrisis\b|bottleneck|backlog/i;
    var of=0,sc=0; ((s.evidence&&s.evidence.docs)||[]).forEach(function(d){ if(!d.headline)return; if(opRe.test(d.headline)&&(d.sentiment==null||d.sentiment<0))of++; if(scRe.test(d.headline))sc++; });
    return {signals:s.signals||null,opFlags:of,scFlags:sc}; }
};
const rat=v=>v==null?'—':Number(v).toFixed(2);
const pctR=v=>v==null?'—':(Number(v)*100).toFixed(1)+'%';
const big=v=>{if(v==null)return '—';v=Number(v);const a=Math.abs(v);if(a>=1e12)return '$'+(v/1e12).toFixed(2)+'T';if(a>=1e9)return '$'+(v/1e9).toFixed(2)+'B';if(a>=1e6)return '$'+(v/1e6).toFixed(2)+'M';return '$'+v.toLocaleString();};
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fitem(l,v){return `<div class="fitem"><div class="l">${l}</div><div class="v">${v}</div></div>`;}

function fsSummarize(d){ d=String(d).replace(/\s+/g,' ').trim(); if(d.length<=280)return esc(d);
  var cut=d.slice(0,280); var ls=cut.lastIndexOf('. '); if(ls>150){cut=cut.slice(0,ls+1);}else{cut=cut.replace(/\s+\S*$/,'')+'…';} return esc(cut); }
function fsCard(tag,sum,src,cells,fun){ return '<div class="fscard">'
   +(tag?'<div class="fstag">'+esc(tag)+'</div>':'')
   +(sum?'<div class="fssum">'+sum+'</div><div class="fssrc">Source: '+esc(src)+'</div>':'')
   +(cells&&cells.length?'<div class="fsgrid">'+cells.join('')+'</div>':'')
   +(fun?'<div class="fsfun"><span class="fsic">\U0001F4A1</span><span class="fst"><b>Did you know?</b> '+fun+'</span></div>':'')
   +'</div>'; }
function funFactCompany(p,row){ var yr=new Date().getFullYear();
  if(p&&p.founded&&/^\d{4}$/.test(String(p.founded))){ var age=yr-parseInt(p.founded,10); if(age>=1&&age<400) return 'Founded in '+esc(p.founded)+' — that\'s '+age+' years of history.'; }
  if(p&&p.mcap&&p.mcap>=1e12) return 'Worth about '+big(p.mcap)+' — one of only a handful of companies ever to top $1 trillion.';
  if(p&&p.chg1y!=null&&Math.abs(p.chg1y)>=15) return (p.chg1y>=0?'Up ':'Down ')+Math.abs(p.chg1y).toFixed(0)+'% over the past year.';
  if(p&&p.employees&&p.employees>=1000) return 'Employs about '+Number(p.employees).toLocaleString()+' people worldwide.';
  if(row&&typeof row.off==='number'){ var o=Math.round(Math.abs(row.off)*100); return o<=3?'Trading right near its 52-week high.':'Currently about '+o+'% below its 52-week high.'; }
  return ''; }
function funFactETF(f,row){
  if(f&&f.expense!=null){ var fee=Math.round(f.expense/100*10000); return 'For every $10,000 you hold, the yearly fee is only about $'+fee+'.'; }
  if(f&&f.holdings) return 'Bundles '+f.holdings+' holdings into a single ticker.';
  if(f&&f.topName&&f.topWeight) return 'Its biggest position is '+esc(f.topName)+' at '+f.topWeight.toFixed(1)+'%.';
  if(f&&f.top10) return 'Its top 10 holdings make up '+f.top10.toFixed(0)+'% of the fund.';
  if(row&&typeof row.off==='number'){ var o=Math.round(Math.abs(row.off)*100); return 'Currently about '+o+'% below its 52-week high.'; }
  return ''; }
function factsheetCompany(p,row){ if(!p)return '';
  var tag=[p.sector,p.industry,p.hq||p.country].filter(Boolean).join(' · ');
  var sum=p.desc?fsSummarize(p.desc):'';
  var cells=[];
  if(p.name)cells.push(fitem('Company',esc(p.name)));
  if(p.sector)cells.push(fitem('Sector',esc(p.sector)));
  if(p.industry)cells.push(fitem('Industry',esc(p.industry)));
  if(p.hq||p.country)cells.push(fitem('HQ',esc(p.hq||p.country)));
  if(p.founded)cells.push(fitem('Founded',esc(p.founded)));
  if(p.employees)cells.push(fitem('Employees','~'+Number(p.employees).toLocaleString()));
  if(p.mcap)cells.push(fitem('Market cap',big(p.mcap)));
  if(p.ceo)cells.push(fitem('CEO',esc(p.ceo)));
  if(p.exchange)cells.push(fitem('Exchange',esc(p.exchange)));
  return fsCard(tag,sum,'Bigdata company overview',cells,funFactCompany(p,row)); }
function factsheetETF(f,ticker,row){ if(!f)return '';
  var tag=[f.provider,f.assetClass].filter(Boolean).join(' · ');
  var sum=f.desc?fsSummarize(f.desc):'';
  var cells=[];
  if(f.provider)cells.push(fitem('Issuer',esc(f.provider)));
  if(f.expense!=null)cells.push(fitem('Expense ratio',f.expense.toFixed(2)+'%'));
  if(f.aum)cells.push(fitem('AUM','$'+esc(f.aum)));
  if(f.holdings)cells.push(fitem('Holdings',String(f.holdings)));
  if(f.inception)cells.push(fitem('Inception',esc(String(f.inception).slice(0,4))));
  if(f.topName)cells.push(fitem('Top holding',esc(f.topName)+(f.topWeight?(' · '+f.topWeight.toFixed(1)+'%'):'')));
  return fsCard(tag,sum,'ETF tearsheet',cells,funFactETF(f,row)); }
function anyRowByTicker(tk){
  if(typeof rowByTicker==='function'){ var r=rowByTicker(tk); if(r) return r; }
  var keys=['sp','nasdaq','dow','etfs','thematic','mutualfunds','ira','brokerage'];
  for(var i=0;i<keys.length;i++){
    var a=(DATA[keys[i]]||[]);
    for(var j=0;j<a.length;j++) if(a[j]&&a[j].ticker===tk) return a[j];
  }
  return null;
}
function snapshotCard(ticker,isETF){
  var row=anyRowByTicker(ticker); if(!row) return '';
  var cells=[];
  if(row.company) cells.push(fitem('Company',esc(row.company)));
  if(row.sector||row.category) cells.push(fitem(isETF?'Category':'Sector',esc(row.sector||row.category)));
  if(row.price!=null&&typeof fmtUsd==='function') cells.push(fitem('Price',fmtUsd(row.price)));
  if(row.status&&row.status!=='—') cells.push(fitem('Status',esc(row.status)));
  if(row.cross&&row.cross!=='—') cells.push(fitem('Cross',esc(row.cross)));
  if(typeof row.off==='number') cells.push(fitem('% off 52-wk high',(row.off*100).toFixed(1)+'%'));
  var fun=isETF?funFactETF(null,row):funFactCompany(null,row);
  return fsCard(row.company||ticker,'','embedded snapshot',cells,fun);
}
function cachedTearsheetHtml(ticker,isETF){
  if(typeof pcGet!=='function') return '';
  if(isETF){
    var md=pcGet('ETF:'+ticker,DAY);
    if(md===undefined||md==null) return '';
    var html=factsheetETF(BDX.etfFacts(md),ticker,anyRowByTicker(ticker));
    if(typeof etfSignal==='function') html+=etfSignal(md);
    if(typeof mdToHtml==='function') html+=mdToHtml(md);
    return html+'<div class="foot" style="margin-top:8px">Cached tearsheet from a prior live session.</div>';
  }
  var ct=pcGet('CT:'+ticker,DAY);
  if(ct===undefined||!ct) return '';
  var sg=pcGet('SENT:'+ticker,DAY); if(sg===undefined) sg=null;
  var row=anyRowByTicker(ticker);
  var html=factsheetCompany(ct.p,row);
  if(typeof expandCT==='function'&&typeof computeRisk==='function'){
    var t2=expandCT(ct);
    var risk=computeRisk(t2,row,sg,ct.esg);
    if(typeof advisorScorecard==='function') html+=advisorScorecard(ct.k,row,risk,sg,ct.ad);
    if(typeof riskSection==='function') html+=riskSection(risk);
    if(typeof renderCompany==='function') html+=renderCompany(t2);
  }
  return html+'<div class="foot" style="margin-top:8px">Cached tearsheet from a prior live session.</div>';
}
async function openTicker(ticker,isETF){
  ov.classList.add('open');mTitle.textContent=ticker;
  mBody.innerHTML='<div class="note">Loading fundamentals…</div>';
  if(!hasLiveConnector()){
    var row=anyRowByTicker(ticker);
    var cached=cachedTearsheetHtml(ticker,isETF);
    var ctOff=(!isETF&&typeof pcGet==='function')?pcGet('CT:'+ticker,DAY):null;
    var name=(ctOff&&ctOff.p&&ctOff.p.name)||(row&&row.company)||'';
    mTitle.textContent=ticker+(name?(' · '+name):'');
    mBody.innerHTML='<div id="dcfStrip"></div>'
      +'<div class="note">Live tearsheet isn\'t reachable in this browser — showing the embedded snapshot'
      +(cached?' plus a cached tearsheet from a prior live session.':'.')
      +'</div>'
      +(cached||snapshotCard(ticker,isETF));
    if(!isETF&&typeof dcfFill==='function') await dcfFill(ticker);
    return;
  }
  const ck=(isETF?'E:':'C:')+ticker;
  if(fundCache[ck]){mBody.innerHTML=fundCache[ck]; if(!isETF&&typeof dcfFill==='function')dcfFill(ticker); return;}
  try{
    let html, name='';
    if(isETF){
      let md=pcGet('ETF:'+ticker,DAY);
      if(md===undefined){ const m=await resolveEntity(ticker,true); if(!m){mBody.innerHTML='<div class="note">No security match found for '+esc(ticker)+'.</div>';return;} name=m.name; md=await BDX.etfMarkdown(m.id,true); pcSet('ETF:'+ticker,md); }
      else{ const e=pcGet('EID:'+ticker,30*DAY); name=(e&&e.name)||''; }
      mTitle.textContent=ticker+(name?(' · '+name):'');
      var _ef=BDX.etfFacts(md); html=factsheetETF(_ef,ticker,rowByTicker(ticker))+etfSignal(md)+mdToHtml(md)+cacheNote(ticker,true);
    } else {
      let ct=pcGet('CT:'+ticker,DAY), sg=pcGet('SENT:'+ticker,DAY), m=null;
      if(ct===undefined){ m=await resolveEntity(ticker,false); if(!m){mBody.innerHTML='<div class="note">No security match found for '+esc(ticker)+'.</div>';return;} const t=await BDX.companyTearsheet(m.id,['company_overview','financial_ratios','key_metrics','analyst_ratings','dividends','esg_performance']); ct=compactCT(t); pcSet('CT:'+ticker,ct); }
      if(sg===undefined){ if(!m)m=await resolveEntity(ticker,false); try{const s=m?await BDX.sentimentRaw(m.id):null; sg=BDX.sentimentFlags(s); }catch(e){sg=null;} pcSet('SENT:'+ticker,sg); }
      const e=pcGet('EID:'+ticker,30*DAY); name=(m&&m.name)||(e&&e.name)||'';
      mTitle.textContent=ticker+(name?(' · '+name):'');
      const t2=expandCT(ct);
      const risk=computeRisk(t2,rowByTicker(ticker),sg,ct.esg);
      const _r=rowByTicker(ticker); if(_r)_r.risk=risk.overall; const _spt=document.getElementById('spTable'); if(_spt&&_spt._render)_spt._render();
      html='<div id="dcfStrip"></div>'+factsheetCompany(ct.p,rowByTicker(ticker))+advisorScorecard(ct.k,rowByTicker(ticker),risk,sg,ct.ad)+riskSection(risk)+renderCompany(t2)+cacheNote(ticker,false);
    }
    fundCache[ck]=html;mBody.innerHTML=html;
    if(!isETF&&typeof dcfFill==='function') await dcfFill(ticker);
  }catch(err){ if(typeof DBG!=='undefined')DBG.log('ERROR','popup','openTicker '+ticker+' — '+(err&&err.message||err)); mBody.innerHTML='<div class="note">Couldn\'t load fundamentals: '+esc(err&&err.message||err)+'</div>';}
}

// ---------- Sector company ranking (50% fundamentals + 50% SMA trend; live connector) ----------
