// ---------- Portfolio look-through: what you ACTUALLY own ----------
// Decomposes held ETFs/mutual funds into their underlying companies and combines them with the
// direct holdings, so single-name concentration that is currently invisible becomes visible
// (e.g. owning ZERO NVDA shares while holding it through six funds).
//
// Fund holdings are PRECOMPUTED (scripts/build_lookthrough.py -> DATA.lookthrough); the ROLL-UP runs
// client-side against CURRENT position values, so it always matches the live portfolio tabs.
//
// HONESTY RULES (a look-through that hides gaps understates concentration — the exact failure this
// feature exists to prevent):
//   * top-N holdings are stored; the long tail is an explicit "diversified remainder" bucket.
//   * a fund we could not map is an explicit "not yet mapped" bucket — never dropped.
//   * cash inside funds is its own bucket.
//   * RECONCILIATION GATE: named + remainder + cash + unmapped MUST equal the household total.
var LT_BUILD='1.1';

function ltData(){ return DATA.lookthrough||null; }
function _ltHouse(){
  var h={}, tot=0;
  ['ira','brokerage'].forEach(function(acct){
    (DATA[acct]||[]).forEach(function(r){
      var t=r.ticker, ty=r.type||'';
      if(!t || ty==='CD' || ty==='Cash') return;
      var v=+r.value||0;
      if(v<=0) return;
      h[t]=(h[t]||0)+v; tot+=v;
    });
  });
  return {holds:h, total:tot};
}
function ltRollup(){
  var L=ltData(); if(!L) return null;
  var H=_ltHouse();
  if(!H.total) return null;
  var funds=L.funds||{}, known=L.known||[];
  var exp={};                 // sym -> {direct, via:{fund:$}, total}
  var remainder=0, cashIn=0, unmapped=0, unmappedList=[], mappedVal=0, synth=false;

  function add(sym,name,amt,fund){
    if(amt<=0) return;
    var e=exp[sym]||(exp[sym]={sym:sym, name:name||sym, direct:0, via:{}, total:0});
    if(name && (!e.name||e.name===sym)) e.name=name;
    if(fund){ e.via[fund]=(e.via[fund]||0)+amt; } else { e.direct+=amt; }
    e.total+=amt;
  }
  Object.keys(H.holds).forEach(function(t){
    var v=H.holds[t];
    var f=funds[t];
    if(f){
      mappedVal+=v;
      if(f.synthetic) synth=true;
      (f.top||[]).forEach(function(h){ add(h.sym,h.name, v*(h.w/100), t); });
      remainder += v*((f.residualW||0)/100);
      cashIn    += v*((f.cashW||0)/100);
      // any disclosure shortfall (weights not summing to 100) also goes to remainder, never lost
      var gap = 100 - ((f.topW||0)+(f.residualW||0)+(f.cashW||0));
      if(gap>0.01) remainder += v*(gap/100);
    } else if(known.indexOf(t)>=0){
      unmapped+=v; unmappedList.push(t);          // a fund we know about but have not mapped YET
    } else {
      add(t,null,v,null);                          // a direct stock
    }
  });
  var rows=Object.keys(exp).map(function(k){ return exp[k]; });
  rows.forEach(function(r){ r.pct=r.total/H.total*100; r.viaTotal=r.total-r.direct; });
  rows.sort(function(a,b){ return b.total-a.total; });
  var named=rows.reduce(function(a,r){ return a+r.total; },0);
  var recon=named+remainder+cashIn+unmapped;      // MUST equal H.total
  return {rows:rows, total:H.total, named:named, remainder:remainder, cash:cashIn,
          unmapped:unmapped, unmappedList:unmappedList, mappedVal:mappedVal,
          reconErr:Math.abs(recon-H.total), coverage:(mappedVal+ (H.total-mappedVal-unmapped))/H.total,
          synthetic:synth, asOf:L.asOf,
          hidden:rows.filter(function(r){ return r.direct<1 && r.pct>=0.5; }),
          partial:(unmapped/H.total)>0.05,   // coverage incomplete => every % below is a FLOOR, not a total
          dupes:_ltDupes(H, funds, known)};
}
// duplicate-exposure detector: funds tracking the same index held more than once
function _ltDupes(H, funds, known){
  var GROUPS=[{name:'S&P 500 trackers', members:['VOO','FXAIX','SPYM','IVV','SPY']}];
  var out=[];
  GROUPS.forEach(function(g){
    var hit=g.members.filter(function(m){ return (H.holds[m]||0)>0; });
    if(hit.length>=2){
      var v=hit.reduce(function(a,m){ return a+H.holds[m]; },0);
      out.push({name:g.name, members:hit, value:v, pct:v/H.total*100});
    }
  });
  return out;
}
function ltTopHidden(){
  var r=ltRollup();
  if(!r||!r.hidden.length) return null;
  var h=r.hidden[0];
  // While funds remain unmapped the figure is a FLOOR — say so ("≥") rather than overstating precision.
  return {sym:h.sym, pct:h.pct, total:h.total, partial:r.partial, unmappedPct:(r.unmapped/r.total*100)};
}

// ---------- popup ----------
function openLookthrough(){
  var r=ltRollup();
  ov.classList.add('open');
  mTitle.innerHTML='What you actually own <span style="font-weight:400;color:var(--muted);font-size:13px">· look-through</span>';
  if(!r){ mBody.innerHTML='<div class="note">Fund holdings aren’t available yet — the daily run maps them.</div>'; return; }
  var ok=r.reconErr<1;
  var hdr='<div style="display:flex;align-items:baseline;gap:14px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:12px">'
    +'<div><div class="foot" style="margin:0">Household (marketable)</div><div style="font-size:22px;font-weight:800">'+fmtUsd(r.total)+'</div></div>'
    +'<div style="border-left:1px solid var(--line);padding-left:14px"><div class="foot" style="margin:0">Looked through</div>'
    +'<div style="font-size:16px;font-weight:700">'+fmtUsd(r.mappedVal)+'</div></div>'
    +'<div style="margin-left:auto;text-align:right"><div class="foot" style="margin:0">Reconciliation</div>'
    +'<div style="font-size:13px;font-weight:700;color:'+(ok?'#16a34a':'#dc2626')+'">'+(ok?'100.0% ✓':('off by '+fmtUsd(r.reconErr)))+'</div></div></div>';
  var alerts='';
  var top=r.hidden[0];
  if(top) alerts+='<div class="note" style="border-left-color:#dc2626"><b>You own $0 of '+esc(top.sym)+' directly — yet it is '
    +top.pct.toFixed(1)+'% of your household ('+fmtUsd(top.total)+').</b> It reaches you through '
    +Object.keys(top.via).map(esc).join(', ')+'.</div>';
  r.dupes.forEach(function(d){
    alerts+='<div class="note" style="border-left-color:#b45309"><b>'+esc(d.name)+' held '+d.members.length+' times</b> — '
      +d.members.map(esc).join(' + ')+' = <b>'+fmtUsd(d.value)+' ('+d.pct.toFixed(1)+'%)</b> in near-identical products.</div>';
  });
  if(r.unmapped>0) alerts+='<div class="note" style="border-left-color:#6b7280">'+fmtUsd(r.unmapped)+' ('
    +(r.unmapped/r.total*100).toFixed(1)+'%) is in funds not mapped yet ('+r.unmappedList.map(esc).join(', ')
    +') — the daily run adds them. Their underlying names are NOT yet counted below, so the true concentration is <b>at least</b> what is shown.</div>';

  var mx=r.rows.length?r.rows[0].total:1;
  var tbl='<div class="foot" style="margin:4px 0 6px">True single-name exposure — <span style="color:#1D9E75">direct</span> vs <span style="color:#7C3AED">via funds</span></div>'
    +'<table class="mdt" style="width:100%;font-size:12px;table-layout:fixed">'
    +'<tr><th style="text-align:left;width:16%">Name</th><th style="width:30%">Direct / via funds</th>'
    +'<th style="text-align:right;width:16%">Total</th><th style="text-align:right;width:10%">%</th>'
    +'<th style="text-align:left;width:28%">Held through</th></tr>';
  r.rows.slice(0,20).forEach(function(x){
    var dw=(x.direct/mx)*100, fw=(x.viaTotal/mx)*100;
    var hot=(x.direct<1 && x.pct>=1);
    var big=(x.pct>=5);
    tbl+='<tr'+(hot?' style="background:#FDECEC"':'')+'>'
      +'<td style="text-align:left"><b>'+esc(x.sym)+'</b>'+(hot?' <span style="font-size:9.5px;color:#dc2626">hidden</span>':'')+'</td>'
      +'<td><div style="display:flex;height:11px;border-radius:3px;overflow:hidden;background:#f1f5f9">'
        +'<div style="width:'+dw+'%;background:#1D9E75"></div><div style="width:'+fw+'%;background:#7C3AED"></div></div></td>'
      +'<td style="text-align:right"><b>'+fmtUsd(x.total)+'</b></td>'
      +'<td style="text-align:right;font-weight:700'+(big?';color:#dc2626':'')+'">'+x.pct.toFixed(1)+'%</td>'
      +'<td style="text-align:left;font-size:11px;color:var(--muted)">'+(Object.keys(x.via).length?Object.keys(x.via).map(esc).join(', '):'—')+'</td></tr>';
  });
  tbl+='</table>';
  var buckets='<table class="mdt" style="width:100%;font-size:12px;margin-top:8px">'
    +'<tr><td style="text-align:left;color:var(--muted)">Diversified remainder (long tail inside your funds)</td><td style="text-align:right">'+fmtUsd(r.remainder)+'</td><td style="text-align:right;width:60px">'+(r.remainder/r.total*100).toFixed(1)+'%</td></tr>'
    +'<tr><td style="text-align:left;color:var(--muted)">Cash inside funds</td><td style="text-align:right">'+fmtUsd(r.cash)+'</td><td style="text-align:right">'+(r.cash/r.total*100).toFixed(1)+'%</td></tr>'
    +(r.unmapped>0?('<tr><td style="text-align:left;color:var(--muted)">Funds not yet mapped</td><td style="text-align:right">'+fmtUsd(r.unmapped)+'</td><td style="text-align:right">'+(r.unmapped/r.total*100).toFixed(1)+'%</td></tr>'):'')
    +'</table>';
  var foot='<div class="foot" style="margin-top:10px">Top-50 holdings per fund; the long tail is the remainder above — never dropped, because dropping it would understate your concentration. '
    +'ETF holdings update daily; <b>mutual funds disclose quarterly</b>, so FBGRX/FXAIX can lag ~90 days. '
    +(r.synthetic?'<b>JEPI/JEPQ hold equity-linked notes</b>, so their look-through is approximate. ':'')
    +'Anything ≥5% of the household is flagged red. Informational — <b>not advice</b>.</div>';
  mBody.innerHTML=hdr+alerts+tbl+buckets+foot;
}
document.addEventListener('click', function(e){
  var t=e.target&&e.target.closest&&e.target.closest('.kpilt');
  if(t){ e.preventDefault(); openLookthrough(); }
});
document.addEventListener('keydown', function(e){
  if(e.key!=='Enter'&&e.key!==' ') return;
  var el=document.activeElement;
  if(el&&el.classList&&el.classList.contains('kpilt')){ e.preventDefault(); openLookthrough(); }
});
