/* Loop 5 · DCF drift monitor (the continuous-monitoring control loop).
 *
 * Runs the SAME client DCF functions (src/dash/51_dcf.js) in Node against the embedded bases +
 * external anchors, and records — per anchored name — the model fair value, the % gap to the anchor,
 * whether a single plausible assumption reconciles them, and a FLAG when the gap exceeds tolerance
 * AND nothing reconciles (the "model regressed or the thesis genuinely changed" signal).
 *
 * Pure/deterministic; no connector calls. Writes data/dcf_monitor.json and prints a one-line summary
 * to stderr for the daily run report. This does NOT force anything — it only observes and flags.
 *
 * Usage:  node scripts/dcf_monitor.js            (DCF_DRIFT_TOL=% overrides the default 12% gate)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// Minimal stubs so 51_dcf.js (which registers a document click handler at load) evaluates in Node.
global.document = { addEventListener() {} };
global.fmtUsd = (v) => '$' + (+v).toFixed(2);
global.esc = (s) => String(s);

const DCF = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dcf.json'), 'utf8'));
let ANCH = {};
try { ANCH = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dcf_anchor.json'), 'utf8')); } catch (e) {}
for (const k of Object.keys(ANCH)) if (DCF[k]) DCF[k].anchor = ANCH[k];
global.DATA = { dcf: DCF };

vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'src', 'dash', '51_dcf.js'), 'utf8'), { filename: '51_dcf.js' });

const TOL = Number(process.env.DCF_DRIFT_TOL || 12); // % gap that, if unreconcilable, is flagged
const out = { asOf: new Date().toISOString().slice(0, 10), tol: TOL, names: {} };

for (const sym of Object.keys(DCF)) {
  const b = DCF[sym];
  if (!b.anchor || !(b.anchor.value > 0)) continue;
  const st = _dcfNewState(b);
  const m = dcfModel(b, st);
  if (!m || m.err) { out.names[sym] = { error: (m && m.err) || 'model unavailable', anchor: b.anchor.value }; continue; }
  const c = dcfCalibrate(b, st);
  out.names[sym] = {
    modelFv: +m.fv.toFixed(2),
    anchor: b.anchor.value,
    anchorSource: b.anchor.source || 'anchor',
    gapPct: +c.gapPct.toFixed(1),
    reconcilable: c.reconcilable,
    best: c.best ? { param: c.best.param, label: c.best.label, value: +c.best.value.toFixed(2) } : null,
    // FLAG = the honesty signal: the model diverges beyond tolerance AND no plausible lever closes it.
    flag: Math.abs(c.gapPct) > TOL && !c.reconcilable,
    // feed-repair visibility: which bases run on reconstructed EBIT, when their consensus snapshot
    // was taken, and whether a base looks corrupt (ratio < gate) but could NOT be uniformly rebuilt.
    ebitRecon: !!b.ebitRecon,
    ebitReconRatio: b.ebitReconRatio == null ? null : b.ebitReconRatio,
    ebitSuspect: b.ebitReconRatio != null && b.ebitReconRatio < 0.85 && !b.ebitRecon,
    baseAsOf: b.asOf || null,
  };
}

fs.writeFileSync(path.join(ROOT, 'data', 'dcf_monitor.json'), JSON.stringify(out));
const names = Object.keys(out.names);
const flagged = names.filter((k) => out.names[k].flag);
const worst = names.filter((k) => typeof out.names[k].gapPct === 'number')
  .sort((a, b2) => Math.abs(out.names[b2].gapPct) - Math.abs(out.names[a].gapPct))[0];
const recon = names.filter((k) => out.names[k].ebitRecon);
const suspect = names.filter((k) => out.names[k].ebitSuspect);
process.stderr.write(
  'DCF monitor: ' + names.length + ' anchored · ' + flagged.length + ' flagged' +
  (flagged.length ? ' (' + flagged.join(', ') + ')' : '') +
  (worst ? ' · widest gap ' + worst + ' ' + out.names[worst].gapPct + '%' : '') +
  (recon.length ? ' · ' + recon.length + ' on reconstructed EBIT (' + recon.join(', ') + ')' : '') +
  (suspect.length ? ' · SUSPECT unreconstructed: ' + suspect.join(', ') : '') + '\n'
);
console.log(JSON.stringify(out));
