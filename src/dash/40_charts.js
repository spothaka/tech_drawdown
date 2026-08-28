(function buildIndexChart(){
  const IH=DATA.indexHistory, grid=document.getElementById('ovIdxGrid'); if(!IH||!grid)return;
  const keys=Object.keys(IH); if(!keys.length){const c=document.getElementById('ovIdxCard'); if(c)c.style.display='none'; return;}
  const COL={'Dow Jones':'#2E75B6','Nasdaq':'#7C3AED','S&P 500':'#1D9E75','Russell 2000':'#D85A30'};
  const W=240,H=64, fmt=v=>(v>=1000?Math.round(v).toLocaleString():(v!=null?v.toFixed(2):''));
  grid.innerHTML=keys.map(function(k){
    const nm=IH[k].name,pts=IH[k].points,col=COL[nm]||'#6b7280';
    const cs=pts.map(p=>p.c),lo=Math.min.apply(null,cs),hi=Math.max.apply(null,cs),rng=(hi-lo)||1,n=cs.length;
    const y=c=>+(H-4-((c-lo)/rng)*(H-10)).toFixed(1),x=i=>+(i*W/(n-1)).toFixed(1);
    const line=cs.map((c,i)=>x(i)+','+y(c)).join(' ');
    const last=cs[n-1],first=cs[0],chg=first?(last/first-1):0,up=chg>=0;
    const pill='background:'+(up?'#e7f5ee':'#fdecec')+';color:'+(up?'#1d9e75':'#e24b4a');
    return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:7px 9px">'
      +'<div style="display:flex;justify-content:space-between;align-items:baseline">'
      +'<span style="font-weight:500;font-size:12.5px">'+nm+'</span>'
      +'<span style="font-size:11px;font-weight:500;border-radius:8px;padding:1px 7px;'+pill+'">'+(up?'+':'')+(chg*100).toFixed(1)+'%</span></div>'
      +'<div style="font-size:16px;font-weight:600;margin:1px 0 2px">'+fmt(last)+'</div>'
      +'<svg viewBox="0 0 '+W+' '+H+'" style="display:block;width:100%">'
      +'<polygon points="0,'+H+' '+line+' '+W+','+H+'" fill="'+col+'" fill-opacity="0.12"/>'
      +'<polyline points="'+line+'" fill="none" stroke="'+col+'" stroke-width="2"/>'
      +'<circle cx="'+W+'" cy="'+y(last)+'" r="2.6" fill="'+col+'"/></svg></div>';
  }).join('');
  const ld=document.getElementById('ovIdxLegend'); if(ld)ld.innerHTML='Each panel scaled to its own 1-year high/low · Nasdaq = Composite (Nasdaq-100 needs an FMP upgrade)';
})();

(function buildMacro(){
  const MH=DATA.macroHistory, grid=document.getElementById('ovMacroGrid'), card=document.getElementById('ovMacroCard');
  if(!MH||!MH.series||!MH.series.length){ if(card)card.style.display='none'; return; }
  const COL={CLUSD:'#6B7280',GCUSD:'#C79A3B',SIUSD:'#9CA3AF',HGUSD:'#B5651D',REMX:'#7C3AED',USDEUR:'#1F6FB2',USDJPY:'#1F6FB2',USDGBP:'#1F6FB2',USDCNY:'#1F6FB2',SENT:'#1D9E75'};
  const W=240,H=64, fmt=v=>{ if(v==null)return''; const a=Math.abs(v); return a>=1000?Math.round(v).toLocaleString():a>=10?v.toFixed(2):v.toFixed(4); };
  grid.innerHTML=MH.series.map(function(s){
    const col=COL[s.key]||'#6b7280', pts=s.points, cs=pts.map(p=>p.c);
    const lo=Math.min.apply(null,cs),hi=Math.max.apply(null,cs),rng=(hi-lo)||1,n=cs.length;
    const y=c=>+(H-4-((c-lo)/rng)*(H-10)).toFixed(1), x=i=>+(i*W/(n-1)).toFixed(1);
    const line=cs.map((c,i)=>x(i)+','+y(c)).join(' ');
    const last=cs[n-1],first=cs[0],chg=first?(last/first-1):0,up=chg>=0;
    const pill='background:'+(up?'#e7f5ee':'#fdecec')+';color:'+(up?'#1d9e75':'#e24b4a');
    return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:7px 9px">'
      +'<div style="display:flex;justify-content:space-between;align-items:baseline">'
      +'<span style="font-weight:500;font-size:11.5px">'+s.name+'</span>'
      +'<span style="font-size:10.5px;font-weight:500;border-radius:8px;padding:1px 6px;'+pill+'">'+(up?'+':'')+(chg*100).toFixed(1)+'%</span></div>'
      +'<div style="font-size:15px;font-weight:600;margin:1px 0 2px">'+fmt(last)+(s.unit?' <span style="font-size:9px;color:#9ca3af;font-weight:400">'+s.unit+'</span>':'')+'</div>'
      +'<svg viewBox="0 0 '+W+' '+H+'" style="display:block;width:100%">'
      +'<polygon points="0,'+H+' '+line+' '+W+','+H+'" fill="'+col+'" fill-opacity="0.12"/>'
      +'<polyline points="'+line+'" fill="none" stroke="'+col+'" stroke-width="2"/>'
      +'<circle cx="'+W+'" cy="'+y(last)+'" r="2.6" fill="'+col+'"/></svg></div>';
  }).join('');
  const lg=document.getElementById('ovMacroLegend'); if(lg)lg.innerHTML='Each tile on its own scale · weekly (sentiment monthly) · rare earths = REMX ETF proxy';
})();
