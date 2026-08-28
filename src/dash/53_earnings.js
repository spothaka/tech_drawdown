// ---------- Latest-earnings memo: inline badge + popup ----------
// A small document badge sits next to the ticker (portfolio + universe tables) and opens an
// Earnings popup with the reported-vs-consensus beat/miss, an EPS trend, the drivers, the forward
// read, and a link to the full saved memo. Data is PRECOMPUTED (scripts/build_earnings.py ->
// DATA.earnings) and embedded — the artifact never calls the connector.
//
// FRESHNESS RULE (client-side, so badges age out on their own without a rebuild): the badge shows
// only while the report is <=30 days old. earnMemoBadge is a hoisted function declaration so
// tkrCell can call it during the eager panel build (see 10_helpers load-order note).
var EARN_WINDOW_DAYS = 30;

function earnData(tk){ return (DATA.earnings || {})[tk] || null; }

function _earnAgeDays(rec){
  if(!rec || !rec.reportDate) return null;
  var d = new Date(rec.reportDate + 'T00:00:00');
  if(isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function _earnFresh(rec){
  var a = _earnAgeDays(rec);
  return a != null && a >= 0 && a <= 30;   // 30-day window inlined (see EARN_WINDOW_DAYS note; must not
                                           // depend on this module's body having executed — tkrCell calls
                                           // earnMemoBadge during the eager panel build at load)
}
function _earnAgo(a){
  if(a == null) return '';
  if(a <= 0) return 'today';
  if(a === 1) return '1d ago';
  return a + 'd ago';
}

// hoisted — called by tkrCell (10_helpers) during eager panel build. Returns '' unless fresh.
function earnMemoBadge(tk){
  var rec = earnData(tk);
  if(!rec || !_earnFresh(rec)) return '';
  var per = ((rec.fiscalPeriod || '') + ' ' + (rec.fiscalYear || '')).trim();
  var ttl = ('Earnings memo · ' + per + ' · reported ' + _earnAgo(_earnAgeDays(rec))).replace(/["<>]/g, '');
  return ' <span class="earnb" role="button" tabindex="0" data-earn="' + esc(tk) + '" title="' + ttl + '"'
    + ' style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;'
    + 'border-radius:5px;margin-left:5px;vertical-align:1px;cursor:pointer;color:var(--accent);'
    + 'background:#eef2ff;border:1px solid var(--accent);font-size:10px;line-height:1;font-weight:700">M</span>';
}

// ---------- popup ----------
function _earnUsd(v){
  if(v == null) return '—';
  var a = Math.abs(v);
  if(a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if(a >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
  return '$' + (+v).toFixed(2);
}
function _earnPct(v){ return (v == null) ? '—' : ((v >= 0 ? '+' : '') + (+v).toFixed(1) + '%'); }

function _earnTrend(tr){
  if(!tr || !tr.length) return '';
  var W = 560, H = 84, n = tr.length, gap = 8, bw = (W - gap * (n - 1)) / n;
  var mx = Math.max.apply(null, tr.map(function(t){ return t.eps; })); if(!(mx > 0)) mx = 1;
  var bars = tr.map(function(t, i){
    var h = Math.max(3, (t.eps / mx) * (H - 20)), x = i * (bw + gap), y = (H - 4) - h;
    var last = i === n - 1;
    return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1)
      + '" rx="3" fill="' + (last ? '#0F6E56' : 'rgba(29,158,117,0.35)') + '"></rect>';
  }).join('');
  var lastT = tr[n - 1];
  var lx = (n - 1) * (bw + gap) + bw / 2;
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Diluted EPS trend">'
    + bars + '<text x="' + lx.toFixed(1) + '" y="10" text-anchor="middle" font-size="10" fill="var(--ink,#111)">$'
    + lastT.eps.toFixed(2) + '</text></svg>';
}

function openEarnings(tk){
  var r = earnData(tk); if(!r) return;
  var per = ((r.fiscalPeriod || '') + ' ' + (r.fiscalYear || '')).trim();
  mTitle.innerHTML = esc(tk) + ' · earnings <span style="font-weight:400;color:var(--muted);font-size:13px">· '
    + esc(per) + ' · reported ' + esc(r.reportDate || '') + ' (' + _earnAgo(_earnAgeDays(r)) + ')</span>';

  var e = r.eps || {}, rev = r.revenue || {};
  function beatCard(label, actual, est, sp){
    var good = (sp == null) ? true : sp >= 0;
    var col = good ? '#16a34a' : '#dc2626';
    return '<div style="background:var(--soft,#f6f8fb);border-radius:8px;padding:10px 12px;border-left:3px solid ' + col + '">'
      + '<div class="foot" style="margin:0">' + label + ' · actual vs est</div>'
      + '<div style="font-size:22px;font-weight:800">' + _earnUsd(actual)
      + ' <span style="font-size:13px;color:var(--muted);font-weight:400">vs ' + _earnUsd(est) + '</span></div>'
      + '<div style="font-size:13px;font-weight:700;color:' + col + '">'
      + (sp == null ? '—' : (good ? 'beat ' : 'miss ') + _earnPct(sp)) + '</div></div>';
  }
  var cards = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + beatCard('EPS', e.actual, e.est, e.surprisePct)
    + beatCard('Net revenue', rev.actual, rev.est, rev.surprisePct) + '</div>';

  var stats = [];
  if(r.netIncome != null) stats.push(['Net income', _earnUsd(r.netIncome)]);
  if(r.epsYoYPct != null) stats.push(['EPS YoY', _earnPct(r.epsYoYPct)]);
  if(r.dilutedSharesYoYPct != null) stats.push(['Shares YoY', _earnPct(r.dilutedSharesYoYPct)]);
  if(r.taxRate != null) stats.push(['Tax rate', r.taxRate.toFixed(1) + '%']);
  var statRow = stats.length ? ('<div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px">'
    + stats.map(function(s){ return '<div><span class="foot" style="margin:0">' + s[0] + '</span> <b>' + s[1] + '</b></div>'; }).join('')
    + '</div>') : '';

  var trend = (r.epsTrend && r.epsTrend.length)
    ? ('<div class="foot" style="margin:2px 0 6px">Diluted EPS · last ' + r.epsTrend.length + ' quarters</div>'
       + '<div style="margin-bottom:12px">' + _earnTrend(r.epsTrend) + '</div>') : '';

  var drv = (r.drivers && r.drivers.length)
    ? ('<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:13px;color:#92400e">'
       + '<b>What drove it.</b> ' + r.drivers.map(esc).join(' ') + '</div>') : '';

  var fwd = r.fwd || {};
  var fwdHtml = fwd.nextEpsEst != null
    ? ('<div class="foot" style="margin:0 0 10px"><b>Forward read:</b> consensus puts ' + esc(fwd.nextPeriod || 'next quarter')
       + ' EPS at ' + _earnUsd(fwd.nextEpsEst) + ' (this quarter ' + _earnUsd(e.actual) + ') — '
       + (fwd.view === 'normalizing' ? 'the Street models a step back down, i.e. a spike, not a new baseline.'
          : fwd.view === 'step-up' ? 'the Street sees the run-rate holding.' : 'broadly steady.') + '</div>') : '';

  var watch = (r.watch && r.watch.length)
    ? ('<div class="foot" style="margin:0 0 6px">Watch next quarter</div>'
       + '<ul style="margin:0 0 12px 18px;padding:0;font-size:13px;line-height:1.6">'
       + r.watch.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>') : '';

  var rt = r.rating || {};
  var ratingTxt = rt.consensus
    ? ('Consensus: ' + esc(rt.consensus) + (rt.targetConsensus ? ' · target ' + _earnUsd(rt.targetConsensus) : '')
       + (rt.buy != null ? ' · ' + rt.buy + ' buy / ' + rt.hold + ' hold / ' + rt.sell + ' sell' : '')) : '';
  var footer = '<div style="border-top:1px solid var(--line);padding-top:12px;margin-top:4px">'
    + '<span class="foot" style="margin:0">' + ratingTxt + ' · as of ' + esc(r.asOf || '') + '</span></div>';

  var disc = '<div class="foot" style="margin-top:10px">Reported figures vs. consensus from the embedded snapshot. '
    + 'For banks/broker-dealers, cash-flow “quality” metrics are omitted as non-meaningful. Informational — <b>not advice</b>.</div>';

  mBody.innerHTML = cards + statRow + trend + drv + fwdHtml + watch + footer + disc;
  ov.classList.add('open');
}

document.addEventListener('click', function(e){
  var t = e.target && e.target.closest && e.target.closest('.earnb');
  if(t){ e.preventDefault(); openEarnings(t.getAttribute('data-earn')); }
});
document.addEventListener('keydown', function(e){
  if(e.key !== 'Enter' && e.key !== ' ') return;
  var el = document.activeElement;
  if(el && el.classList && el.classList.contains('earnb')){ e.preventDefault(); openEarnings(el.getAttribute('data-earn')); }
});
