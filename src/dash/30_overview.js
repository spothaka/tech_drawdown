const ovUniq=uniqUniverse(); const ovLive=ovUniq.filter(x=>x.off!=null);
(()=>{const c=statusCounts(ovLive),a=avgOff(ovLive);
 document.getElementById('ovKpis').innerHTML=`
   <div class="kpi"><div class="v">${ovUniq.length}</div><div class="l">Unique names</div></div>
   <div class="kpi bear"><div class="v">${c.Bear||0}</div><div class="l">In bear territory</div></div>
   <div class="kpi corr"><div class="v">${c.Correction||0}</div><div class="l">In correction</div></div>
   <div class="kpi"><div class="v">${fmtPct(a)}</div><div class="l">Avg off 52-wk high</div></div>`;
 const isMf=e=>e.tabs.length===1&&e.tabs[0]==='mutualfunds';
 const UNIV=ovLive.filter(e=>!isMf(e));
 function board(cid,color,mode){ const el=document.getElementById(cid); if(!el)return;
   let w=UNIV.slice().filter(x=>typeof x.off==='number');
   if(mode==='best') w=w.sort((a,b)=>b.off-a.off).slice(0,10);
   else if(mode==='corr') w=w.filter(x=>x.off>-0.2&&x.off<=-0.1).sort((a,b)=>a.off-b.off).slice(0,10);
   else w=w.sort((a,b)=>a.off-b.off).slice(0,10);
   if(!w.length){el.innerHTML='<div class="foot">No names in this band.</div>';return;}
   const abs=w.map(x=>Math.abs(x.off)),mn=Math.min.apply(null,abs),mx=Math.max.apply(null,abs)||1,lead=w[0];
   const rows=w.map((x,i)=>{const a=Math.abs(x.off),strength=(mode==='best')?(a?mn/a:1):(a/mx),wd=Math.max(10,Math.round(strength*100));
     return '<tr><td class="wrk">'+(i+1)+'</td>'
       +'<td class="wtk"><a class="tkr" data-tk="'+x.ticker+'" data-etf="'+(x._isetf?1:0)+'">'+x.ticker+'</a>'+tabChips(x.tabs)+'</td>'
       +'<td class="wbar"><div class="wtrk"><div class="wfill" style="width:'+wd+'%;background:'+color+'"></div></div></td>'
       +'<td class="wpct" style="color:'+color+'">'+fmtPct(x.off)+'</td></tr>';}).join('');
   const tag=(mode==='best')?'best':'worst';
   el.innerHTML='<div class="wkpi"><b>'+w.length+'</b> shown · '+tag+' <b>'+lead.ticker+' '+fmtPct(lead.off)+'</b></div><table class="wtab">'+rows+'</table>';
 }
 board('ovBest','#1D9E75','best'); board('ovCorr','#E0A93B','corr'); board('ovWorst','#E24B4A','worst');
})();
