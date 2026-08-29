// ---------- Corporate Actions section — rendered inside the Fundamentals popup ----------
// corpActionsSection(ticker) returns an HTML string (or '' if no data for this ticker).
// Sources (all embedded in DATA — no live fetch required):
//   DATA.splits         — recent split / reverse-split facts (also drives splitBadge in the table)
//   DATA.dividends.upcoming — per-ticker upcoming dividend payments (declared or estimated)
//   DATA.corp_actions   — manually-maintained M&A, spin-off, delisting, ticker-change notes
//
// Rendering pattern follows riskSection() in 90_init.js:
//   outer bordered card → <h4> title → rows → .foot disclaimer
// Use `function` declaration (hoisted) so it is visible to 74_fundamentals.js load-time code.

function corpActionsSection(ticker) {
  if (!ticker) return '';

  var rows = [];

  // ── 1. Split / reverse-split ──────────────────────────────────────────────
  var sp = (DATA.splits || {})[ticker];
  if (sp && sp.ratio) {
    var rev = (sp.type === 'reverse');
    var icon = rev ? '⇊' : '⇈';
    var col  = rev ? '#b45309' : '#16a34a';
    var bg   = rev ? '#FFF3CD' : '#E8F5E9';
    var label = (rev ? 'Reverse split' : 'Forward split') + ' · ' + esc(sp.ratio);
    var dateStr = sp.date
      ? new Date(sp.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    var typeChip = '<span style="display:inline-block;font-size:10px;font-weight:700;color:' + col
      + ';background:' + bg + ';border:1px solid ' + col
      + ';border-radius:10px;padding:1px 6px;margin-right:6px;white-space:nowrap">'
      + icon + ' ' + (rev ? 'Reverse Split' : 'Split') + '</span>';
    rows.push(
      '<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)">'
      + '<div style="flex:1">' + typeChip
      + '<span style="font-weight:600">' + esc(sp.ratio) + '</span>'
      + (dateStr ? ('<span style="color:var(--muted);font-size:12px"> · effective ' + esc(dateStr) + '</span>') : '')
      + '</div>'
      + '</div>'
    );
  }

  // ── 2. Upcoming dividends for this ticker ─────────────────────────────────
  var divUpcoming = (DATA.dividends && DATA.dividends.upcoming) ? DATA.dividends.upcoming : [];
  var tickerDivs = divUpcoming.filter(function (u) { return u && u.ticker === ticker; });
  tickerDivs.forEach(function (u) {
    var tag = u.declared
      ? '<span style="color:#16a34a;font-size:11px;font-weight:600">declared</span>'
      : '<span style="color:#b45309;font-size:11px;font-weight:600">est.</span>';
    var exD  = u.exDate  ? u.exDate.slice(5)  : '';
    var payD = u.payDate ? u.payDate.slice(5)  : '';
    var per  = (u.amount != null) ? (' · $' + Number(u.amount).toFixed(2) + '/sh') : '';
    var inc  = (u.income != null) ? (' · $' + Math.round(u.income).toLocaleString() + ' income') : '';
    var typeChip = '<span style="display:inline-block;font-size:10px;font-weight:700;color:#2563eb'
      + ';background:#EFF6FF;border:1px solid #93c5fd'
      + ';border-radius:10px;padding:1px 6px;margin-right:6px;white-space:nowrap">Dividend</span>';
    rows.push(
      '<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)">'
      + '<div style="flex:1">' + typeChip
      + (exD  ? ('<span style="font-size:12px">ex ' + esc(exD) + '</span>') : '')
      + (payD ? ('<span style="color:var(--muted);font-size:12px"> · pay ' + esc(payD) + '</span>') : '')
      + per + inc
      + '<span style="margin-left:6px">' + tag + '</span>'
      + '</div>'
      + '</div>'
    );
  });

  // ── 3. Manual corp-actions notes (M&A, spin-offs, delistings, etc.) ────────
  var TYPE_META = {
    merger:       { label: 'Merger',         col: '#7c3aed', bg: '#F5F3FF', border: '#c4b5fd' },
    acquisition:  { label: 'Acquisition',    col: '#7c3aed', bg: '#F5F3FF', border: '#c4b5fd' },
    spinoff:      { label: 'Spin-off',       col: '#0891b2', bg: '#ECFEFF', border: '#67e8f9' },
    delisting:    { label: 'Delisting',      col: '#dc2626', bg: '#FEF2F2', border: '#fca5a5' },
    ticker_change:{ label: 'Ticker change',  col: '#d97706', bg: '#FFFBEB', border: '#fcd34d' },
    split:        { label: 'Split',          col: '#16a34a', bg: '#F0FDF4', border: '#86efac' },
    other:        { label: 'Corporate action', col: '#6b7280', bg: '#F9FAFB', border: '#d1d5db' }
  };
  var notes = ((DATA.corp_actions || {})[ticker]) || [];
  notes.forEach(function (n) {
    if (!n || !n.note) return;
    var m = TYPE_META[n.type] || TYPE_META['other'];
    var dateStr = n.date
      ? new Date(n.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    var typeChip = '<span style="display:inline-block;font-size:10px;font-weight:700;color:' + m.col
      + ';background:' + m.bg + ';border:1px solid ' + m.border
      + ';border-radius:10px;padding:1px 6px;margin-right:6px;white-space:nowrap">' + m.label + '</span>';
    rows.push(
      '<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)">'
      + '<div style="flex:1">'
      + typeChip
      + (dateStr ? ('<span style="color:var(--muted);font-size:12px">' + esc(dateStr) + ' · </span>') : '')
      + '<span style="font-size:13px">' + esc(n.note) + '</span>'
      + '</div>'
      + '</div>'
    );
  });

  // ── Nothing to show ────────────────────────────────────────────────────────
  if (!rows.length) return '';

  return '<div style="border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px">'
    + '<h4 style="margin:0 0 4px">Corporate actions</h4>'
    + rows.join('')
    + '<div class="foot" style="margin-top:6px">'
    + 'Splits from daily refresh data. Dividends from the dividend feed (declared = confirmed, est. = projected). '
    + 'M&amp;A, spin-off, and delisting notes are manually maintained.'
    + '</div>'
    + '</div>';
}
