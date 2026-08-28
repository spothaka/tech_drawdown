"""Render a per-ticker earnings memo (Markdown) from a data/earnings.json record.

The popup IS the quick read; this is the long-form "Read full memo" the popup links to. Pure
transform over the embedded record — every figure traces back to build_earnings.py, so the memo
can never disagree with the popup. Company name is optional (falls back to the ticker).

Usage:
  python gen_earnings_memo.py --sym GS [--name "Goldman Sachs"] [--out reports/earnings/GS_2026_Q2.md]
"""
import os, sys, json, argparse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EARN = os.path.join(ROOT, 'data', 'earnings.json')


def usd(v):
    if v is None:
        return '—'
    a = abs(v)
    if a >= 1e9:
        return '${:.2f}B'.format(v / 1e9)
    if a >= 1e6:
        return '${:.0f}M'.format(v / 1e6)
    return '${:,.2f}'.format(v)


def pct(v, sign=True):
    if v is None:
        return '—'
    return ('{:+.1f}%' if sign else '{:.1f}%').format(v)


def render(sym, rec, name=None):
    name = name or sym
    e, r = rec['eps'], rec['revenue']
    when = rec.get('reportDate')
    L = []
    L.append('# {} ({}) — {} {} Earnings Digest'.format(name, sym, rec.get('fiscalPeriod'), rec.get('fiscalYear')))
    L.append('')
    L.append('*Reported {}. Prepared {}. Source: Bigdata / FMP connector (structured actuals, statements, estimates), embedded in the dashboard. Rules-based analysis — not investment advice.*'.format(when, rec.get('asOf')))
    L.append('')
    L.append('## Headline')
    L.append('')
    L.append('| Metric | Reported | Consensus | Surprise |')
    L.append('|---|---|---|---|')
    L.append('| Diluted EPS | **{}** | {} | **{}** |'.format(usd(e.get('actual')), usd(e.get('est')), pct(e.get('surprisePct'))))
    L.append('| Net revenue | **{}** | {} | **{}** |'.format(usd(r.get('actual')), usd(r.get('est')), pct(r.get('surprisePct'))))
    if rec.get('netIncome') is not None:
        L.append('| Net income | {} | — | — |'.format(usd(rec['netIncome'])))
    L.append('')
    if rec.get('drivers'):
        L.append('## What drove it')
        L.append('')
        for d in rec['drivers']:
            L.append('- {}'.format(d))
        L.append('')
    tr = rec.get('epsTrend') or []
    if tr:
        L.append('## Diluted EPS trend (last {} quarters)'.format(len(tr)))
        L.append('')
        L.append('| Quarter | ' + ' | '.join(t['label'] for t in tr) + ' |')
        L.append('|' + '---|' * (len(tr) + 1))
        L.append('| EPS | ' + ' | '.join('{:.2f}'.format(t['eps']) for t in tr) + ' |')
        L.append('')
        if rec.get('epsYoYPct') is not None:
            L.append('Year-on-year, diluted EPS moved {}.'.format(pct(rec['epsYoYPct'])))
            L.append('')
    fwd = rec.get('fwd') or {}
    if fwd.get('nextEpsEst'):
        L.append('## The forward read')
        L.append('')
        views = {'normalizing': 'the Street is **not** extrapolating this quarter — it models a step back down',
                 'step-up': 'the Street sees the run-rate **holding**',
                 'in-line': 'the Street sees results **broadly steady**'}
        L.append('Consensus puts **{} EPS at {}** (reported quarter: {}). In other words, {}.'.format(
            fwd.get('nextPeriod'), usd(fwd['nextEpsEst']), usd(e.get('actual')),
            views.get(fwd.get('view'), 'the Street sees results broadly steady')))
        L.append('')
    if rec.get('watch'):
        L.append('## What to watch')
        L.append('')
        for w in rec['watch']:
            L.append('- {}'.format(w))
        L.append('')
    rt = rec.get('rating') or {}
    if rt.get('consensus'):
        L.append('## Analyst stance')
        L.append('')
        L.append('Consensus rating **{}** ({} buy / {} hold / {} sell), consensus price target **{}**.'.format(
            rt.get('consensus'), rt.get('buy'), rt.get('hold'), rt.get('sell'),
            usd(rt.get('targetConsensus')) if rt.get('targetConsensus') else '—'))
        L.append('')
    L.append('---')
    L.append('')
    L.append('*Figures are the embedded values from `data/earnings.json`; for banks/broker-dealers, cash-flow "quality" metrics are omitted as non-meaningful. Not investment advice.*')
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sym', required=True)
    ap.add_argument('--name')
    ap.add_argument('--out')
    a = ap.parse_args()
    data = json.load(open(EARN))
    rec = data.get(a.sym)
    if not rec:
        sys.exit('no earnings record for {}'.format(a.sym))
    out = a.out or os.path.join(ROOT, 'reports', 'earnings',
                                '{}_{}_{}.md'.format(a.sym, rec.get('fiscalYear'), rec.get('fiscalPeriod')))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as fh:
        fh.write(render(a.sym, rec, a.name))
    # The memo is a local deliverable for the project folder only — it is NOT linked from the artifact
    # UI (the sandbox can't open local files). We still record memoPath for provenance.
    rec['memoPath'] = os.path.relpath(out, ROOT).replace(os.sep, '/')
    data[a.sym] = rec
    with open(EARN, 'w') as fh:
        json.dump(data, fh, indent=0)
    print(out)


if __name__ == '__main__':
    main()
