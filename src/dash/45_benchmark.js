// ---------- Benchmark: portfolio vs Dow / Nasdaq / S&P 500 ----------
// Uses only REAL data: DATA.indexHistory (weekly 1-yr index curves) and
// DATA.history (accumulating daily household totals from build_history.py).
// Day 1 (history < 2 pts): "context" mode — draws the 3 real index 1-yr curves
// + trailing returns, with a banner that the portfolio overlay starts today.
// Once >= 2 portfolio points exist: "compare" mode — rebases portfolio + the
// same-window index curves to 100 and shows a real alpha readout. No fabricated
// back-cast (per-holding 1-yr returns are not sourceable — FMP quote-change is
// plan-gated), so the head-to-head is honest and builds over the coming weeks.
var BENCH = (function(){
  var IDX = [
    {key:'^GSPC', label:'S&P 500',  col:'#1D9E75'},
    {key:'^IXIC', label:'Nasdaq',   col:'#7C3AED'},
    {key:'^DJI',  label:'Dow Jones',col:'#2E75B6'}
  ];
  var PORT = {label:'Your portfolio', col:'#0f2440'};

  function idxPts(key){ var e=(DATA.indexHistory||{})[key]; return (e&&e.points)||[]; }
  function pct(a,b){ return b? (100*(a/b-1)) : 0; }
  function sgn(n){ return (n>=0?'+':'')+n.toFixed(1)+'%'; }
  function fmtDate(d){ try{var p=String(d).split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(+p[1]||1)-1]+" '"+p[0].slice(2);}catch(e){return d;} }

  // nearest portfolio record on/before a given date
  function portOnOrBefore(hist, d){ var out=null; for(var i=0;i<hist.length;i++){ if(hist[i].date<=d) out=hist[i]; else break; } return out; }

  function build(){
    var host=document.getElementById('benchCard'); if(!host) return;
    var hist=(DATA.history||[]).slice().sort(function(a,b){return a.date<b.date?-1:1;});
    var haveCompare = hist.length>=2;

    // ----- trailing 1-yr returns (always real, full window) -----
    var trail=IDX.map(function(x){ var p=idxPts(x.key); return {label:x.label,col:x.col,r: p.length? pct(p[p.length-1].c,p[0].c):0}; });

    var datasets=[], labels=[], sub='', alphaHtml='';

    if(haveCompare){
      // compare window starts at first portfolio date
      var start=hist[0].date;
      // axis = index weekly dates within [start, today]
      var base=idxPts(IDX[0].key).filter(function(pt){return pt.d>=start;});
      labels=base.map(function(pt){return pt.d;});
      // index lines rebased to 100 at window start
      IDX.forEach(function(x){
        var p=idxPts(x.key).filter(function(pt){return pt.d>=start;});
        var b=p.length?p[0].c:1;
        datasets.push({label:x.label,data:p.map(function(pt){return +(100*pt.c/b).toFixed(2);}),
          borderColor:x.col,backgroundColor:'transparent',fill:false,tension:0.25,pointRadius:0,borderWidth:2});
      });
      // portfolio rebased to 100 at start, mapped onto same axis (step: nearest on/before)
      var pb=hist[0].total||1;
      var pdata=labels.map(function(d){ var r=portOnOrBefore(hist,d); return r? +(100*r.total/pb).toFixed(2):null; });
      datasets.push({label:PORT.label,data:pdata,borderColor:PORT.col,backgroundColor:withAlpha(PORT.col,0.08),
        fill:true,tension:0.25,pointRadius:0,borderWidth:3.5,order:0});
      // alpha over the covered window
      var pRet=pct(hist[hist.length-1].total, hist[0].total);
      var chips=IDX.map(function(x){
        var p=idxPts(x.key).filter(function(pt){return pt.d>=start;}); var ir=p.length?pct(p[p.length-1].c,p[0].c):0;
        var a=pRet-ir, up=a>=0;
        return '<span class="balpha"><b style="color:'+(up?'#16a34a':'#dc2626')+'">'+(up?'▲':'▼')+' '+sgn(a)+'</b> vs '+x.label+'</span>';
      }).join('');
      alphaHtml='<div class="brow"><span class="bport">Portfolio '+sgn(pRet)+'</span>'+chips+'</div>';
      sub='since tracking began · '+fmtDate(start)+' → today';
    } else {
      // context mode — full-year index curves, no portfolio line yet
      var full=idxPts(IDX[0].key);
      labels=full.map(function(pt){return pt.d;});
      IDX.forEach(function(x){
        var p=idxPts(x.key); var b=p.length?p[0].c:1;
        datasets.push({label:x.label,data:p.map(function(pt){return +(100*pt.c/b).toFixed(2);}),
          borderColor:x.col,backgroundColor:'transparent',fill:false,tension:0.25,pointRadius:0,borderWidth:2.5});
      });
      var tchips=trail.map(function(t){return '<span class="balpha"><b style="color:'+(t.r>=0?'#16a34a':'#dc2626')+'">'+sgn(t.r)+'</b> '+t.label+' 1-yr</span>';}).join('');
      alphaHtml='<div class="brow"><span class="bport" style="background:'+withAlpha(PORT.col,0.10)+';color:'+PORT.col+'">Portfolio overlay starts today</span>'+tchips+'</div>';
      sub='market 1-year · weekly · indexed to 100';
    }

    host.innerHTML='<div class="card"><h3>Portfolio vs the market '
      +'<span class="'+"hcol"+'" tabindex="0" role="button" data-g="benchmark" aria-label="Benchmark: your household value indexed to 100 and compared against the Dow, Nasdaq and S&amp;P 500 over the same period.">benchmark<span class="hci" aria-hidden="true">&#9432;</span></span>'
      +' <span style="font-weight:400;color:#6b7280;font-size:12.5px">· '+sub+'</span></h3>'
      +alphaHtml
      +'<div class="chartbox tall"><canvas id="benchCanvas"></canvas></div>'
      +'<div class="foot">'+(haveCompare
          ? 'Your household value (IRA + Brokerage) and each index are set to 100 at the start of tracking, so the lines show growth from the same footing. The gap to each index is your alpha above. Time-weighted view is a later refinement; contributions/withdrawals shift the portfolio line.'
          : 'Tracking started today. The three index curves are their real one-year paths (each set to 100 a year ago). Your portfolio line begins accruing now and a head-to-head with matched index windows appears here once a few days of history build up.')
      +' Informational, not advice.</div></div>';

    var ctx=document.getElementById('benchCanvas'); if(!ctx||typeof Chart==='undefined') return;
    new Chart(ctx,{type:'line',
      data:{labels:labels.map(fmtDate),datasets:datasets},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8}},
          tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+(c.parsed.y!=null?c.parsed.y.toFixed(1):'—');}}}},
        scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8,autoSkip:true}},
          y:{grid:{color:'#f1f5f9'},ticks:{callback:function(v){return v;}}}}}});
  }
  return {build:build};
})();
function buildBenchmark(){ try{ BENCH.build(); }catch(e){ if(window.DBG)DBG.err('benchmark',e); } }
