// ---------- Drawdown timeline (underwater): how far below peak, over the past year ----------
// Complements the benchmark card (growth) with a risk lens. For each series we track the
// running peak and plot drawdown% = value/peak - 1 at each point (0 at top, negative below),
// with shaded Normal / Correction / Bear status bands. Real data only: DATA.indexHistory
// (Dow/Nasdaq/S&P, weekly ~1yr) now; portfolio (DATA.history) once it has >= 2 points.
var DRAWDN = (function(){
  var SER = [
    {key:'^GSPC', label:'S&P 500',  col:'#1D9E75'},
    {key:'^IXIC', label:'Nasdaq',   col:'#7C3AED'},
    {key:'^DJI',  label:'Dow Jones',col:'#2E75B6'}
  ];
  var PORT = {label:'Your portfolio', col:'#0f2440'};

  function idxPts(key){ var e=(DATA.indexHistory||{})[key]; return (e&&e.points)||[]; }
  function fmtDate(d){ try{var p=String(d).split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(+p[1]||1)-1]+" '"+p[0].slice(2);}catch(e){return d;} }
  function ddPct(n){ return (n>0?'+':'')+n.toFixed(1)+'%'; }
  function statusOf(dd){ return dd<=-20?'Bear':(dd<=-10?'Correction':'Normal'); }
  function statusCol(dd){ return dd<=-20?'#dc2626':(dd<=-10?'#E0A106':'#16a34a'); }

  // underwater series from [{d,c}] -> array of {d, dd} plus max drawdown
  function underwater(pts){
    var peak=-Infinity, out=[], mx=0;
    for(var i=0;i<pts.length;i++){ var c=pts[i].c; if(c>peak)peak=c; var dd=peak?100*(c/peak-1):0; if(dd<mx)mx=dd; out.push({d:pts[i].d,dd:+dd.toFixed(2)}); }
    return {series:out, maxDD:+mx.toFixed(2), curDD: out.length?out[out.length-1].dd:0};
  }
  function portOnOrBefore(hist,d){ var out=null; for(var i=0;i<hist.length;i++){ if(hist[i].date<=d) out=hist[i]; else break; } return out; }

  // Chart.js background plugin: shade the three status bands behind the data.
  var bandsPlugin={ id:'ddbands', beforeDatasetsDraw:function(chart){
    try{
      var a=chart.chartArea, y=chart.scales.y, ctx=chart.ctx; if(!a||!y)return;
      function band(hi,lo,color){ var yhi=y.getPixelForValue(hi), ylo=y.getPixelForValue(lo);
        ctx.save(); ctx.fillStyle=color; ctx.fillRect(a.left, Math.min(yhi,ylo), a.right-a.left, Math.abs(ylo-yhi)); ctx.restore(); }
      var min=y.min;
      band(0,-10,'rgba(22,163,74,0.06)');
      band(-10,-20,'rgba(224,161,6,0.10)');
      if(min<-20) band(-20,min,'rgba(220,38,38,0.10)');
    }catch(e){}
  }};

  function build(){
    var host=document.getElementById('ddCard'); if(!host) return;
    var hist=(DATA.history||[]).slice().sort(function(a,b){return a.date<b.date?-1:1;});

    // axis = index weekly dates (full year)
    var labels=idxPts(SER[0].key).map(function(p){return p.d;});
    var datasets=[], stats=[];

    SER.forEach(function(s){
      var uw=underwater(idxPts(s.key));
      var m={}; uw.series.forEach(function(p){m[p.d]=p.dd;});
      datasets.push({label:s.label,data:labels.map(function(d){return m[d]!=null?m[d]:null;}),
        borderColor:s.col,backgroundColor:'transparent',fill:false,tension:0.25,pointRadius:0,borderWidth:2,spanGaps:true});
      stats.push({label:s.label,col:s.col,cur:uw.curDD,mx:uw.maxDD});
    });

    var havePort = hist.length>=2;
    if(havePort){
      var uwp=underwater(hist.map(function(h){return {d:h.date,c:h.total};}));
      var mp={}; uwp.series.forEach(function(p){mp[p.d]=p.dd;});
      var pdata=labels.map(function(d){ var r=portOnOrBefore(hist,d); return r&&mp[r.date]!=null?mp[r.date]:null; });
      datasets.push({label:PORT.label,data:pdata,borderColor:PORT.col,backgroundColor:withAlpha(PORT.col,0.10),
        fill:true,tension:0.25,pointRadius:0,borderWidth:3.5,order:0,spanGaps:true});
      stats.unshift({label:PORT.label,col:PORT.col,cur:uwp.curDD,mx:uwp.maxDD});
    }

    // stat row: current status + worst-of-year per series
    var chips=stats.map(function(s){
      return '<span class="balpha"><b style="color:'+s.col+'">'+s.label+'</b> now '
        +'<b style="color:'+statusCol(s.cur)+'">'+ddPct(s.cur)+'</b> · worst '+ddPct(s.mx)+'</span>';
    }).join('');
    var portNote = havePort ? '' : '<span class="balpha" style="background:'+withAlpha(PORT.col,0.08)+'">Your portfolio drawdown accrues from today</span>';

    host.innerHTML='<div class="card"><h3>Drawdown timeline '
      +'<span class="hcol" tabindex="0" role="button" data-g="ddtimeline" aria-label="Drawdown timeline: how far each line sits below its own running peak over the past year. 0% means at a record high; deeper negatives mean a bigger fall from the peak. Bands mark Normal (0 to -10%), Correction (-10 to -20%) and Bear (below -20%).">drawdown timeline<span class="hci" aria-hidden="true">&#9432;</span></span>'
      +' <span style="font-weight:400;color:#6b7280;font-size:12.5px">· % below running peak · weekly · 1 year</span></h3>'
      +'<div class="brow">'+portNote+chips+'</div>'
      +'<div class="chartbox tall"><canvas id="ddCanvas"></canvas></div>'
      +'<div class="foot">Each line is that series\' drawdown from its own highest point so far — 0% at a fresh record high, dipping negative as it falls below peak and climbing back as it recovers. Green / amber / red bands are the Normal, Correction (&#8211;10%) and Bear (&#8211;20%) zones the rest of the dashboard uses. '
      +(havePort?'Your household line uses daily portfolio value.':'Your household line begins once a few days of history accrue.')
      +' Informational, not advice.</div></div>';

    var ctx=document.getElementById('ddCanvas'); if(!ctx||typeof Chart==='undefined') return;
    new Chart(ctx,{type:'line',
      data:{labels:labels.map(fmtDate),datasets:datasets},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8}},
          tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+(c.parsed.y!=null?ddPct(c.parsed.y):'—');}}}},
        scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8,autoSkip:true}},
          y:{max:0,grid:{color:'#f1f5f9'},ticks:{callback:function(v){return v+'%';}}}}},
      plugins:[bandsPlugin]});
  }
  return {build:build};
})();
function buildDrawdown(){ try{ DRAWDN.build(); }catch(e){ if(window.DBG)DBG.err('drawdown',e); } }
