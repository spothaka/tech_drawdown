const fs = require('fs');
const html = fs.readFileSync('dashboard/tech_drawdown_dashboard.html', 'utf8');
const key = 'const DATA = ';
const start = html.indexOf(key) + key.length;
let depth = 0, i = start, inStr = false, q = '', esc2 = false;
for (; i < html.length; i++) {
  const c = html[i];
  if (inStr) {
    if (esc2) esc2 = false;
    else if (c === '\\') esc2 = true;
    else if (c === q) inStr = false;
  } else if (c === '"' || c === "'") { inStr = true; q = c; }
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
}
const D = JSON.parse(html.slice(start, i));
console.log('corp_actions present:', 'corp_actions' in D);
console.log('corp_actions tickers:', Object.keys(D.corp_actions || {}).length);
console.log('dividends.annual:', D.dividends && D.dividends.annual);
console.log('DATA key count:', Object.keys(D).length);
console.log('DATA keys:', Object.keys(D).join(', '));
