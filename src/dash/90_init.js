function rowByTicker(tk){ for(const k of ['sp','nasdaq','dow']){const r=(DATA[k]||[]).find(x=>x.ticker===tk); if(r)return r;} return null; }
function riskLvl(p,medT,hiT){ return p>=hiT?'High':(p>=medT?'Med':'Low'); }
function computeRisk(t,row,sg,esg){
  const k=(t&&t.key_financial_highlights)||{};
  const sig=(sg&&sg.signals)||null, opFlags=(sg&&sg.opFlags)||0, scFlags=(sg&&sg.scFlags)||0;
  const out={};
  // Credit
  { let p=0; const de=k.debt_to_equity_ratio_ttm,da=k.debt_to_assets_ratio_ttm,ic=k.interest_coverage_ratio_ttm,nde=k.net_debt_to_ebitda_ttm;
    if(de!=null){if(de>2)p+=2;else if(de>1)p+=1;} if(da!=null&&da>0.6)p+=1;
    if(ic!=null){if(ic<1.5)p+=2;else if(ic<3)p+=1;} if(nde!=null&&nde>3)p+=1;
    out.credit={level:riskLvl(p,1,3),note:[de!=null?'D/E '+de.toFixed(1):null,ic!=null?'int.cov '+ic.toFixed(1):null].filter(Boolean).join(' · ')||'limited data'}; }
  // Liquidity
  { let p=0; const cr=k.current_ratio_ttm,qr=k.quick_ratio_ttm,ca=k.cash_ratio_ttm;
    if(cr!=null&&cr<1)p+=1; if(qr!=null&&qr<1)p+=1; if(ca!=null&&ca<0.2)p+=1;
    out.liq={level:riskLvl(p,1,2),note:[cr!=null?'current '+cr.toFixed(2):null,qr!=null?'quick '+qr.toFixed(2):null].filter(Boolean).join(' · ')||'limited data'}; }
  // Operational (financial proxy + news flags)
  { let p=0; const om=k.operating_profit_margin_ttm,at=k.asset_turnover_ttm;
    if(om!=null){if(om<0)p+=2;else if(om<0.05)p+=1;} if(at!=null&&at<0.4)p+=1;
    if(opFlags>=3)p+=2; else if(opFlags>=1)p+=1;
    out.oper={level:riskLvl(p,1,3),note:[om!=null?'op margin '+(om*100).toFixed(0)+'%':null,opFlags>0?(opFlags+' operational news'):null].filter(Boolean).join(' · ')||'limited data'}; }
  // Supply chain (disruption news: pandemic/war/oil/shipping/disasters/macro + sector exposure)
  { let p=/Information Technology|Industrials|Consumer Discretionary|Consumer Staples|Materials|Energy|Health Care/.test((row&&row.sector)||'')?1:0;
    if(scFlags>=3)p+=2; else if(scFlags>=1)p+=1;
    out.supply={level:riskLvl(p,1,2),note:scFlags>0?(scFlags+' disruption-related headlines'):'no recent disruption news'}; }
  // Market
  { let p=0; const off=row?row.off:null,sp=row?row.smapct:null,cross=row?row.cross:null;
    if(off!=null){if(off<=-0.4)p+=2;else if(off<=-0.2)p+=1;} if(sp!=null&&sp<0)p+=1; if(cross==='Death Cross')p+=1;
    out.mkt={level:riskLvl(p,1,3),note:[off!=null?(off*100).toFixed(0)+'% off high':null,(cross&&cross!=='—')?cross.toLowerCase():null].filter(Boolean).join(' · ')||'limited data'}; }
  // Climate (Environmental score vs sector, + carbon-heavy sector bump)
  if(esg&&esg.e!=null){ let p=esg.e>=60?0:(esg.e>=40?1:2); if(/Energy|Materials|Utilities/.test((row&&row.sector)||''))p=Math.min(3,p+1);
    out.climate={level:riskLvl(p,1,2),note:'Env '+esg.e.toFixed(0)+(esg.sE!=null?(' vs sector '+esg.sE.toFixed(0)):'')}; }
  else out.climate={level:'—',note:'no ESG coverage'};
  // ESG score (higher = lower risk)
  if(esg&&esg.esg!=null){ let lvl=esg.esg>=65?'Low':(esg.esg>=45?'Med':'High'); if(esg.sESG!=null&&esg.esg<esg.sESG-10)lvl=(lvl==='Low'?'Med':'High');
    out.esg={level:lvl,note:'ESG '+esg.esg.toFixed(0)+(esg.sESG!=null?(' vs sector '+esg.sESG.toFixed(0)):'')+(esg.e!=null?(' · E'+esg.e.toFixed(0)+'/S'+esg.s.toFixed(0)+'/G'+esg.g.toFixed(0)):'')}; }
  else out.esg={level:'—',note:'no ESG coverage'};
  // World events (news sentiment)
  let we={level:'—',note:'sentiment unavailable'};
  if(sig&&sig.sentiment){ const cur=sig.sentiment.current||0,mom=sig.sentiment.momentum,z=sig.sentiment.zscore_1mo,att=(sig.media_attention&&sig.media_attention.zscore_1mo)||0;
    let wp=0; if(cur<-0.1)wp+=2; else if(cur<-0.02)wp+=1; if(mom!=null&&mom<-0.02)wp+=1; if(z!=null&&z<=-2)wp+=1; if(att>=2&&cur<0)wp+=1;
    const tone=cur<-0.05?'negative':(cur>0.05?'positive':'neutral'),attn=att>=2?'spiking':(att<=-1?'subdued':'normal');
    we={level:riskLvl(wp,2,4),note:tone+' news tone · '+attn+' media attention'}; }
  out.world=we;
  const map={Low:1,Med:2,High:3}; const vals=[out.credit,out.liq,out.oper,out.supply,out.mkt,out.climate,out.esg,out.world].map(x=>map[x.level]).filter(Boolean);
  const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  out.overall=avg==null?'—':(avg>=2.34?'High':(avg>=1.67?'Med':'Low'));
  return out;
}
function riskChip(l){ const c=l==='High'?'s':(l==='Med'?'h':(l==='Low'?'b':'')); return '<span class="rec '+c+'">'+(l||'—')+'</span>'; }
function riskSection(r){
  const rw=(label,o)=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)"><div><b>${label}</b><div class="foot" style="margin:0">${esc(o.note||'')}</div></div><div style="white-space:nowrap">${riskChip(o.level)}</div></div>`;
  return '<div style="border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><h4 style="margin:0">Risk summary</h4><div>Overall '+riskChip(r.overall)+'</div></div>'
    +rw('Market', r.mkt)+rw('Credit', r.credit)+rw('Liquidity', r.liq)+rw('Operational', r.oper)+rw('Supply chain', r.supply)+rw('World events', r.world)+rw('Climate', r.climate)+rw('ESG score', r.esg)
    +'<div class="foot" style="margin-top:6px">Credit/Liquidity/Operational from financial ratios (+ operational news); Supply chain from disruption news (pandemic, war, oil, shipping, disasters, macro shocks) &amp; sector exposure; Market from drawdown &amp; SMA; World events from news sentiment; Climate &amp; ESG from ESG scores vs sector. Rules-based &amp; informational — not advice.</div>'
    +'</div>';
}

function renderCompany(t){
  const k=(t&&t.key_financial_highlights)||{};
  const ad=(t&&t.analyst_data)||{},pt=ad.price_targets||{},rt=ad.ratings||{};
  const ckm=(((t&&t.company_key_metrics)||[]).slice()).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const mc=ckm.length?ckm[0].market_cap:null;
  const grid=fitem('P/E (TTM)',rat(k.price_to_earnings_ratio_ttm))
    +fitem('P/B',rat(k.price_to_book_ratio_ttm))
    +fitem('P/S',rat(k.price_to_sales_ratio_ttm))
    +fitem('EV / EBITDA',rat(k.ev_to_ebitda_ttm))
    +fitem('Debt / Equity',rat(k.debt_to_equity_ratio_ttm))
    +fitem('Current Ratio',rat(k.current_ratio_ttm))
    +fitem('ROE',pctR(k.return_on_equity_ttm))
    +fitem('ROA',pctR(k.return_on_assets_ttm))
    +fitem('Gross Margin',pctR(k.gross_profit_margin_ttm))
    +fitem('Net Margin',pctR(k.net_profit_margin_ttm))
    +fitem('FCF Yield',pctR(k.free_cash_flow_yield_ttm))
    +fitem('Dividend Yield',pctR(k.dividend_yield_ttm))
    +fitem('Market Cap',big(mc))
    +fitem('Enterprise Value',big(k.enterprise_value_ttm));
  let an='';
  if(rt.consensus||pt.target_consensus!=null){
    an='<h4>Analyst coverage</h4><div class="fgrid">'
      +fitem('Consensus',rt.consensus||'—')
      +fitem('Price Target',pt.target_consensus!=null?('$'+Number(pt.target_consensus).toLocaleString()):'—')
      +fitem('Target Range',(pt.target_low!=null&&pt.target_high!=null)?('$'+pt.target_low+' – $'+pt.target_high):'—')
      +fitem('Buy / Hold / Sell',((rt.strong_buy||0)+(rt.buy||0))+' / '+(rt.hold||0)+' / '+((rt.sell||0)+(rt.strong_sell||0)))
      +'</div>';
  }
  return '<h4 style="margin-top:2px">Key fundamentals (TTM)</h4><div class="fgrid">'+grid+'</div>'+an
    +'<div class="foot" style="margin-top:14px">Fundamentals via Bigdata / Financial Modeling Prep. Informational only — not investment advice.</div>';
}

function mdToHtml(md){
  const lines=String(md).split('\n');const out=[];let i=0;
  while(i<lines.length){
    const ln=lines[i];
    if(/^\s*\|/.test(ln)){
      const tbl=[];
      while(i<lines.length&&/^\s*\|/.test(lines[i])){tbl.push(lines[i]);i++;}
      const rows=tbl.filter(r=>!/^\s*\|[\s\-:|]+\|\s*$/.test(r)).map(r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
      if(rows.length)out.push('<table class="mdt">'+rows.map((r,idx)=>'<tr>'+r.map(c=>idx===0?('<th>'+hcol(c)+'</th>'):('<td>'+esc(c)+'</td>')).join('')+'</tr>').join('')+'</table>');
      continue;
    }
    const h=ln.match(/^(#{1,6})\s+(.*)/);
    if(h){out.push('<h4>'+esc(h[2])+'</h4>');i++;continue;}
    const s=ln.trim();
    if(s===''||/^\*.*\*$/.test(s)){i++;continue;}
    out.push('<div style="font-size:12.5px;margin:4px 0">'+esc(s)+'</div>');i++;
  }
  return out.join('');
}


// ---------- Rules-based fundamental signal (Buy/Hold/Sell from valuation, quality & balance-sheet metrics) ----------
function scLow(v,g,b){return v==null?null:(v<g?1:(v>b?-1:0));}   // lower is better
function scHigh(v,g,b){return v==null?null:(v>g?1:(v<b?-1:0));}  // higher is better
function fundScoreNum(k){ if(!k)return null;
  const a=[]; const pe=k.price_to_earnings_ratio_ttm; if(pe!=null&&pe>0)a.push(scLow(pe,15,30));
  a.push(scLow(k.price_to_sales_ratio_ttm,2,6)); a.push(scLow(k.price_to_book_ratio_ttm,3,8)); a.push(scLow(k.ev_to_ebitda_ttm,12,22)); a.push(scHigh(k.free_cash_flow_yield_ttm,0.05,0.02));
  a.push(scHigh(k.return_on_equity_ttm,0.20,0.10)); a.push(scHigh(k.return_on_assets_ttm,0.10,0.05)); a.push(scHigh(k.gross_profit_margin_ttm,0.50,0.30)); a.push(scHigh(k.net_profit_margin_ttm,0.15,0.05));
  a.push(scLow(k.debt_to_equity_ratio_ttm,0.5,1.5)); a.push(scHigh(k.current_ratio_ttm,1.5,1.0));
  const c=a.filter(x=>x!=null); if(!c.length)return null; return c.reduce((x,y)=>x+y,0)/c.length; }

function advisorScorecard(k,row,risk,sg,ad){
  const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
  const comps=[];
  const fn=fundScoreNum(k); const qv=fn==null?null:(fn>=0.25?1:(fn<=-0.25?-1:0));
  comps.push({key:'qv',name:'Quality & Valuation',val:qv,w:1.0});
  let tp=null; if(row){ tp=0; if(row.cross==='Golden Cross')tp++; else if(row.cross==='Death Cross')tp--;
    if(row.smapct!=null)tp+=row.smapct>0?0.5:-0.5; if(row.sma50pct!=null)tp+=row.sma50pct>0?0.5:-0.5;
    if(row.off!=null&&row.off<=-0.2)tp-=0.5; }
  const tr=tp==null?null:(tp>=0.75?1:(tp<=-0.75?-1:0));
  comps.push({key:'tr',name:'Trend & Timing',val:tr,w:0.8});
  const rmap={Low:1,Med:0,High:-1}; const rk=(risk&&rmap[risk.overall]!=null)?rmap[risk.overall]:null;
  comps.push({key:'rk',name:'Risk',val:rk,w:1.0});
  let sn=null; const st=sg&&sg.signals&&sg.signals.sentiment;
  if(st){ let s=0; const c=st.current||0,mo=st.momentum; if(c>0.05)s++; else if(c<-0.05)s--; if(mo!=null){if(mo<-0.03)s-=0.5;else if(mo>0.03)s+=0.5;} sn=s>=0.75?1:(s<=-0.75?-1:0); }
  comps.push({key:'sn',name:'Sentiment',val:sn,w:0.6});
  let W=0,have=0; comps.forEach(c=>{if(c.val!=null){W+=c.val*c.w;have++;}});
  if(!have) return '';
  const pos=comps.filter(c=>c.val>0), neg=comps.filter(c=>c.val<0);
  let rec,rc; if(W>=2.0&&!neg.length){rec='BUY';rc='#16a34a';} else if(W>=0.8){rec='ADD';rc='#4d9a4d';} else if(W>-0.8){rec='HOLD';rc='#b45309';} else if(W<=-2.0&&!pos.length){rec='AVOID';rc='#dc2626';} else {rec='TRIM';rc='#d97706';}
  let agree,conviction;
  if(pos.length&&!neg.length){agree='signals aligned (bullish)';conviction=pos.length>=3?'High':'Medium';}
  else if(neg.length&&!pos.length){agree='signals aligned (bearish)';conviction=neg.length>=3?'High':'Medium';}
  else if(pos.length&&neg.length){agree='signals conflict';conviction='Low';}
  else {agree='signals neutral';conviction='Low';}
  const nm=a=>a.map(c=>c.name.split(' & ')[0].toLowerCase()).join(', ');
  let line; if(pos.length&&neg.length) line=cap(nm(pos))+' constructive, but '+nm(neg)+' negative — a mixed picture.';
  else if(pos.length) line='Mutually reinforcing: '+nm(pos)+' point the same way.';
  else if(neg.length) line='Headwinds across '+nm(neg)+'.';
  else line='No decisive signal in either direction.';
  let worst=null,wv=1e9; comps.forEach(c=>{if(c.val!=null&&c.val*c.w<wv){wv=c.val*c.w;worst=c;}});
  let hiRisk=''; if(risk){['credit','liq','oper','supply','mkt','climate','esg','world'].forEach(f=>{if(risk[f]&&risk[f].level==='High'&&!hiRisk)hiRisk=({credit:'credit',liq:'liquidity',oper:'operational',supply:'supply-chain',mkt:'market',climate:'climate',esg:'ESG',world:'world-events'})[f];});}
  const wk=worst?worst.key:'tr'; let inval;
  if(wk==='qv') inval='valuation is the weak link — downside if growth disappoints or the multiple compresses.';
  else if(wk==='tr') inval='trend is the weak link — a 50/200 Death Cross or a decisive loss of the 200-day average.';
  else if(wk==='rk') inval='risk is the weak link — watch the '+(hiRisk||'overall')+' risk factor below worsening.';
  else if(wk==='sn') inval='sentiment is the weak link — further negative news tone or a bad catalyst.';
  else inval='a 50/200 Death Cross or a decisive loss of the 200-day average.';
  const chip=c=>{const m=c.val==null?{t:'—',col:'var(--muted)'}:c.val>0?{t:'+',col:'#16a34a'}:c.val<0?{t:'–',col:'#dc2626'}:{t:'0',col:'#b45309'};
    return '<span style="display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:8px;padding:3px 8px;font-size:12px"><b style="color:'+m.col+'">'+m.t+'</b> '+c.name+'</span>';};
  const street=(ad&&ad.ratings&&ad.ratings.consensus)?(' · Street: '+ad.ratings.consensus+((ad.price_targets&&ad.price_targets.target_consensus)?(' (tgt $'+ad.price_targets.target_consensus+')'):'')):'';
  return '<div style="border:1px solid var(--line);border-left:5px solid '+rc+';border-radius:10px;padding:12px 14px;margin-bottom:10px">'
    +'<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span style="font-size:20px;font-weight:800;color:'+rc+'">'+rec+'</span>'
    +'<span style="color:var(--muted);font-size:12px">Conviction: '+conviction+' · '+agree+' · score '+(W>=0?'+':'')+W.toFixed(1)+street+'</span></div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+comps.map(chip).join('')+'</div>'
    +'<div style="font-size:12.5px;margin-top:8px">'+line+'</div>'
    +'<div style="font-size:12.5px;margin-top:4px"><b>Watch:</b> '+inval+'</div>'
    +'<div class="foot" style="margin-top:6px">Mechanical blend of valuation/quality, trend, risk &amp; sentiment (analyst views shown for context only, not scored). Rules-based screen — not financial advice.</div>'
    +'</div>';
}


function fundamentalSignal(k){
  if(!k) return '';
  const pe=k.price_to_earnings_ratio_ttm;
  const noEarn=(pe==null||pe<=0);
  const val=[];
  if(!noEarn) val.push(scLow(pe,15,30));
  val.push(scLow(k.price_to_sales_ratio_ttm,2,6));
  val.push(scLow(k.price_to_book_ratio_ttm,3,8));
  val.push(scLow(k.ev_to_ebitda_ttm,12,22));
  val.push(scHigh(k.free_cash_flow_yield_ttm,0.05,0.02));
  const divB = (k.dividend_yield_ttm==null)?null:(k.dividend_yield_ttm>0.03?1:0); // bonus only
  const qual=[scHigh(k.return_on_equity_ttm,0.20,0.10),scHigh(k.return_on_assets_ttm,0.10,0.05),
              scHigh(k.gross_profit_margin_ttm,0.50,0.30),scHigh(k.net_profit_margin_ttm,0.15,0.05)];
  const health=[scLow(k.debt_to_equity_ratio_ttm,0.5,1.5),scHigh(k.current_ratio_ttm,1.5,1.0)];
  const clean=a=>a.filter(x=>x!=null);
  const all=[...clean(val),...(divB!=null?[divB]:[]),...clean(qual),...clean(health)];
  if(!all.length) return '';
  const norm=all.reduce((a,b)=>a+b,0)/all.length;
  let label,cls; if(norm>=0.25){label='BUY';cls='b';} else if(norm<=-0.25){label='SELL';cls='s';} else {label='HOLD';cls='h';}
  const bs=a=>clean(a).reduce((x,y)=>x+y,0);
  const vS=bs(val)+(divB||0), qS=bs(qual), hS=bs(health);
  const sgn=n=>(n>=0?'+':'')+n;
  const parts=[ (vS>0?'attractively valued':(vS<0?'richly valued':'fairly valued')),
                (qS>0?'strong profitability':(qS<0?'weak profitability':'average profitability')),
                (hS>0?'solid balance sheet':(hS<0?'elevated leverage':'adequate balance sheet')) ];
  const cmap={b:'#16a34a',h:'#b45309',s:'#dc2626'};
  return '<div style="border:1px solid var(--line);border-left:5px solid '+cmap[cls]+';border-radius:10px;padding:12px 14px;margin-bottom:8px">'
    +'<div style="display:flex;align-items:baseline;gap:10px"><span class="rec '+cls+'" style="font-size:19px">'+label+'</span>'
    +'<span style="color:var(--muted);font-size:12px">Fundamental score '+sgn(+norm.toFixed(2))+' · rules-based</span></div>'
    +'<div style="font-size:12.5px;margin-top:6px">Valuation <b>'+sgn(vS)+'</b> &nbsp;·&nbsp; Quality <b>'+sgn(qS)+'</b> &nbsp;·&nbsp; Health <b>'+sgn(hS)+'</b></div>'
    +'<div style="font-size:12.5px;margin-top:4px">'+parts.join(', ')+'.'+(noEarn?' <span style="color:var(--corr)">No positive earnings — P/E excluded.</span>':'')+'</div>'
    +'<div class="foot" style="margin-top:6px"><b>Rules-based screen, not financial advice.</b> Mechanical score from valuation, quality &amp; balance-sheet metrics; excludes analyst views. Generic thresholds may misjudge financials, REITs &amp; unprofitable names.</div>'
    +'</div>';
}

function etfSignal(md){
  const num=(re)=>{const m=md.match(re);return m?parseFloat(m[1].replace(/,/g,'')):null;};
  const price=num(/Last Price\s*\|\s*([\d.,]+)/);
  const ma50=num(/50-Day MA\s*\|\s*([\d.,]+)/);
  const ma200=num(/200-Day MA\s*\|\s*([\d.,]+)/);
  const rsi=num(/\|\s*Current\s*\|\s*([\d.]+)\s*\|/);
  const prem=num(/Premium\/Discount to NAV\s*\|\s*(-?[\d.]+)%/);
  const exp=num(/Expense Ratio \(TER\)\s*\|\s*([\d.]+)%/);
  const r1y=num(/\|\s*1Y\s*\|\s*([+\-]?[\d.]+)%/);
  const trend=[];
  if(price!=null&&ma200!=null) trend.push(price>ma200?1:-1);
  if(ma50!=null&&ma200!=null) trend.push(ma50>ma200?1:-1);
  if(r1y!=null) trend.push(r1y>10?1:(r1y<-10?-1:0));
  const timing=(rsi==null)?[]:[rsi<30?1:(rsi>70?-1:0)];
  const cost=(exp==null)?[]:[exp<0.10?1:(exp>0.50?-1:0)];
  const value=(prem==null)?[]:[prem<-0.5?1:(prem>0.5?-1:0)];
  const all=[...trend,...timing,...cost,...value];
  if(!all.length) return '';
  const norm=all.reduce((a,b)=>a+b,0)/all.length;
  let label,cls; if(norm>=0.25){label='BUY';cls='b';} else if(norm<=-0.25){label='SELL';cls='s';} else {label='HOLD';cls='h';}
  const sgn=n=>(n>=0?'+':'')+(+n.toFixed(2));
  const parts=[];
  if(price!=null&&ma200!=null) parts.push(price>ma200?'above its 200-day average':'below its 200-day average');
  if(ma50!=null&&ma200!=null) parts.push(ma50>ma200?'golden-cross regime':'death-cross regime');
  if(exp!=null) parts.push(exp<0.10?'very low cost':(exp>0.50?'high cost':'moderate cost'));
  if(rsi!=null&&(rsi<30||rsi>70)) parts.push(rsi<30?'oversold (RSI)':'overbought (RSI)');
  if(prem!=null&&Math.abs(prem)>0.5) parts.push(prem<0?'discount to NAV':'premium to NAV');
  const cmap={b:'#16a34a',h:'#b45309',s:'#dc2626'};
  return '<div style="border:1px solid var(--line);border-left:5px solid '+cmap[cls]+';border-radius:10px;padding:12px 14px;margin-bottom:8px">'
    +'<div style="display:flex;align-items:baseline;gap:10px"><span class="rec '+cls+'" style="font-size:19px">'+label+'</span>'
    +'<span style="color:var(--muted);font-size:12px">ETF trend &amp; cost score '+sgn(norm)+' · rules-based</span></div>'
    +(parts.length?'<div style="font-size:12.5px;margin-top:5px">'+parts.join(', ')+'.</div>':'')
    +'<div class="foot" style="margin-top:6px"><b>Rules-based screen, not financial advice.</b> ETF signal blends trend (price vs 200-day &amp; 50/200 cross, 1-yr return), momentum (RSI), cost (expense ratio) &amp; premium/discount to NAV — it does not value the underlying holdings.</div>'
    +'</div>';
}

