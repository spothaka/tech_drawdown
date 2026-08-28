// ---------- Dividend income calendar popup (opened by the .kpidiv tile on the Retirement tab) ----------
// Reuses the shared modal (ov / mTitle / mBody from 74_fundamentals) + Chart.js. Data is DATA.dividends,
// produced by scripts/build_dividends.py (Tier 1 declared stocks via FMP + Tier 2 yield-based ETFs/funds).
var _divChart=null;
function openDividends(){
  var Dv=DATA.dividends; if(!Dv) return;
  var months=Dv.months||[], up=Dv.upcoming||[];
  function money(n){ return '$'+Math.round(n||0).toLocaleString(); }
  function pct(x){ return (x==null?'—':(x*100).toFixed(2)+'%'); }
  var metrics='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:2px 0 16px">'
    +'<div style="background:var(--soft,#f6f8fb);border-radius:10px;padding:10px 12px"><div class="foot" style="margin:0">Projected annual income</div><div style="font-size:19px;font-weight:700">'+money(Dv.annual)+'</div></div>'
    +'<div style="background:var(--soft,#f6f8fb);border-radius:10px;padding:10px 12px"><div class="foot" style="margin:0">Forward yield on value</div><div style="font-size:19px;font-weight:700">'+pct(Dv.yield)+'</div></div>'
    +'<div style="background:var(--soft,#f6f8fb);border-radius:10px;padding:10px 12px"><div class="foot" style="margin:0">Next 30 days</div><div style="font-size:19px;font-weight:700">'+money(Dv.next30)+'</div></div>'
    +'</div>';
  var legend='<div style="display:flex;gap:14px;align-items:center;margin-bottom:6px">'
    +'<span class="foot" style="margin:0">By month</span>'
    +'<span class="foot" style="margin:0;display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:#1D9E75"></span>Brokerage</span>'
    +'<span class="foot" style="margin:0;display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:#2E75B6"></span>IRA</span></div>';
  var rows=up.map(function(u){
    var tag=u.declared?'<span style="color:#16a34a">declared</span>':'<span style="color:#b45309">est.</span>';
    var per=(u.amount!=null)?(' · $'+Number(u.amount).toFixed(2)+'/sh'):'';
    var pd=u.payDate?u.payDate.slice(5):'';
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px">'
      +'<span style="font-weight:700;width:56px">'+esc(u.ticker)+'</span>'
      +'<span style="flex:1;color:var(--muted)">pay '+esc(pd)+' · '+tag+per+'</span>'
      +'<span style="width:64px;text-align:right;color:var(--muted)">'+(u.shares!=null?Number(u.shares).toLocaleString(undefined,{maximumFractionDigits:0})+' sh':'')+'</span>'
      +'<span style="width:60px;text-align:right;font-weight:700">'+money(u.income)+'</span></div>';
  }).join('');
  mTitle.innerHTML='Dividend income <span style="font-weight:400;color:var(--muted);font-size:13px">· next 12 months · illustrative</span>';
  mBody.innerHTML=metrics+legend
    +'<div class="chartbox" style="height:210px"><canvas id="divCanvas"></canvas></div>'
    +'<div class="foot" style="margin:12px 0 4px">Next payments</div>'+(rows||'<div class="foot">No payments projected.</div>')
    +'<div class="foot" style="margin-top:12px"><b>Declared</b> = exact date &amp; amount from the dividend feed. <b>Estimated</b> = projected from the fund’s yield &amp; payout frequency (ETF dates are month-level; a few stock payers may be filled on the next daily run). Informational, not advice.</div>';
  ov.classList.add('open');
  var cx=document.getElementById('divCanvas'); if(!cx||typeof Chart==='undefined') return;
  if(_divChart){ try{_divChart.destroy();}catch(e){} }
  _divChart=new Chart(cx,{type:'bar',
    data:{labels:months.map(function(m){return m.label;}),datasets:[
      {label:'Brokerage',data:months.map(function(m){return +(m.brokerage||0).toFixed(2);}),backgroundColor:'#1D9E75',stack:'x',borderRadius:3,maxBarThickness:26},
      {label:'IRA',data:months.map(function(m){return +(m.ira||0).toFixed(2);}),backgroundColor:'#2E75B6',stack:'x',borderRadius:3,maxBarThickness:26}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': $'+Math.round(c.parsed.y).toLocaleString();},
        footer:function(items){var t=items.reduce(function(s,i){return s+i.parsed.y;},0);return 'Total: $'+Math.round(t).toLocaleString();}}}},
      scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:'#f1f5f9'},ticks:{callback:function(v){return '$'+v;}}}}}});
}
document.addEventListener('click', function(e){
  var t=e.target&&e.target.closest&&e.target.closest('.kpidiv');
  if(t){ e.preventDefault(); openDividends(); }
});
document.addEventListener('keydown', function(e){
  if(e.key!=='Enter'&&e.key!==' ') return;
  var el=document.activeElement;
  if(el&&el.classList&&el.classList.contains('kpidiv')){ e.preventDefault(); openDividends(); }
});
