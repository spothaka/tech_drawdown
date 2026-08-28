"""Earnings digest builder — per held/universe STOCK, the latest reported quarter.

Pure transform (no connector calls; the daily task fetches the raw tearsheet). Shapes a
Bigdata/FMP company-tearsheet slice into one compact, embed-ready record per ticker and
merges it into data/earnings.json -> DATA.earnings.

The client (src/dash/53_earnings.js) shows the inline memo badge + popup ONLY while the report
is <=30 days old; that freshness test is evaluated client-side against `reportDate`, so records
can accumulate here and simply age out of the UI on their own.

Record shape (per ticker):
  {symbol, reportDate, fiscalYear, fiscalPeriod, currency,
   eps:{actual, est, surprisePct}, revenue:{actual, est, surprisePct},
   netIncome, roe, taxRate, dilutedSharesYoYPct,
   epsTrend:[{label, eps} ...up to 8],        # oldest -> newest
   fwd:{nextPeriod, nextEpsEst, view},         # view: 'step-up' | 'normalizing' | 'in-line'
   rating:{consensus, buy, hold, sell, targetConsensus},
   drivers:[str ...], watch:[str ...],
   memoPath, asOf}

Usage:
  python build_earnings.py --sym GS --tearsheet scripts/gs_tearsheet.json [--memo reports/earnings/GS_2026_Q2.md] [--date YYYY-MM-DD]
  python build_earnings.py --sym GS --record scripts/gs_record.json   # inject a fully-formed record (seeding/tests)
"""
import os, sys, json, argparse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'data', 'earnings.json')
QLABEL = {1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4'}


def _load(p):
    with open(p) as fh:
        return json.load(fh)


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _pct(actual, est):
    a, e = _num(actual), _num(est)
    if a is None or e is None or e == 0:
        return None
    return round((a / e - 1) * 100, 2)


def _round(x, n=2):
    v = _num(x)
    return None if v is None else round(v, n)


def shape_from_tearsheet(sym, t, memo_path=None, today=None):
    """Build the compact record from a company-tearsheet slice (the shape the connector returns)."""
    today = today or datetime.date.today().isoformat()
    le = t.get('latest_earnings') or {}
    fund = t.get('fundamentals') or {}
    ismt = fund.get('income_statement') or []
    ad = t.get('analyst_data') or {}
    ratings = (ad.get('ratings') or {})
    ptar = (ad.get('price_targets') or {})
    est = (t.get('estimates') or {}).get('records') or []

    eps = le.get('eps') or {}
    rev = le.get('revenue') or {}
    fy = le.get('fiscal_year')
    per = le.get('reporting_period')  # e.g. "Q2"

    # --- income-statement trend (newest first in the feed) -> oldest->newest, last 8 ---
    def _q(rec):
        p = rec.get('fiscal_period')
        return QLABEL.get(p, p) if isinstance(p, int) else p
    trend = []
    for rec in ismt[:8]:
        e = _num(rec.get('eps_diluted'))
        if e is None:
            continue
        yr = rec.get('fiscal_year')
        lab = '{} {}'.format(str(yr)[-2:], _q(rec)) if yr else _q(rec)
        trend.append({'label': lab, 'eps': round(e, 2)})
    trend.reverse()  # oldest -> newest

    # --- headline quarter derived fields (latest income-statement row = the reported quarter) ---
    top = ismt[0] if ismt else {}
    net_income = _num(top.get('net_income'))
    pre_tax = _num(top.get('income_before_tax'))
    tax = _num(top.get('income_tax'))
    tax_rate = round(tax / pre_tax * 100, 1) if (tax is not None and pre_tax) else None
    # diluted shares YoY: latest vs 4 quarters prior
    shares_yoy = None
    if len(ismt) >= 5:
        s0 = _num(ismt[0].get('weighted_average_shares_diluted'))
        s4 = _num(ismt[4].get('weighted_average_shares_diluted'))
        if s0 and s4:
            shares_yoy = round((s0 / s4 - 1) * 100, 1)

    # --- forward: next fiscal period EPS estimate + a plain-language view ---
    fwd = {'nextPeriod': None, 'nextEpsEst': None, 'view': None}
    eps_actual = _num(eps.get('actual'))
    if fy and per:
        pnum = {'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4}.get(per)
        if pnum:
            ny, nq = (fy, pnum + 1) if pnum < 4 else (fy + 1, 1)
            cand = [r for r in est if r.get('metric') == 'EPS'
                    and r.get('fiscal_year') == ny and str(r.get('fiscal_period')) in (str(nq), QLABEL.get(nq))]
            if cand:
                ne = _num(cand[0].get('estimate_mean'))
                fwd['nextPeriod'] = '{} {}'.format(QLABEL.get(nq), ny)
                fwd['nextEpsEst'] = round(ne, 2) if ne is not None else None
                if ne is not None and eps_actual:
                    ratio = ne / eps_actual
                    fwd['view'] = 'normalizing' if ratio < 0.9 else ('step-up' if ratio > 1.1 else 'in-line')

    rec = {
        'symbol': sym,
        'reportDate': le.get('reporting_date'),
        'fiscalYear': fy,
        'fiscalPeriod': per,
        'currency': fund.get('currency') or 'USD',
        'eps': {'actual': _round(eps.get('actual')), 'est': _round(eps.get('estimated')),
                'surprisePct': _round(eps.get('surprise_pct')) if eps.get('surprise_pct') is not None else _pct(eps.get('actual'), eps.get('estimated'))},
        'revenue': {'actual': _num(rev.get('actual')), 'est': _num(rev.get('estimated')),
                    'surprisePct': _round(rev.get('surprise_pct')) if rev.get('surprise_pct') is not None else _pct(rev.get('actual'), rev.get('estimated'))},
        'netIncome': net_income,
        'taxRate': tax_rate,
        'dilutedSharesYoYPct': shares_yoy,
        'epsTrend': trend,
        'fwd': fwd,
        'rating': {'consensus': ratings.get('consensus'),
                   'buy': ratings.get('buy'), 'hold': ratings.get('hold'), 'sell': ratings.get('sell'),
                   'targetConsensus': _round(ptar.get('target_consensus'))},
        'memoPath': memo_path,
        'asOf': today,
    }
    # EPS YoY (newest vs 4 back in the trend) for the popup
    if len(trend) >= 5 and trend[-5]['eps']:
        rec['epsYoYPct'] = round((trend[-1]['eps'] / trend[-5]['eps'] - 1) * 100, 1)
    return rec


def default_narrative(rec):
    """Auto-generate drivers/watch text from the numbers if the caller didn't supply richer prose.
    Kept deliberately factual — the judgment-heavy prose lives in the memo file."""
    d, w = [], []
    ep = rec.get('eps', {}).get('surprisePct')
    rp = rec.get('revenue', {}).get('surprisePct')
    if ep is not None and rp is not None:
        d.append('EPS beat consensus by {:+.0f}% and revenue by {:+.0f}%.'.format(ep, rp)
                 if ep >= 0 else 'EPS missed by {:.0f}% and revenue by {:.0f}%.'.format(ep, rp))
    if rec.get('epsYoYPct') is not None:
        d.append('Diluted EPS {:+.0f}% year-on-year.'.format(rec['epsYoYPct']))
    if rec.get('dilutedSharesYoYPct') is not None and rec['dilutedSharesYoYPct'] < 0:
        d.append('Buybacks cut the diluted share count {:.1f}% year-on-year.'.format(rec['dilutedSharesYoYPct']))
    fwd = rec.get('fwd') or {}
    if fwd.get('view') == 'normalizing' and fwd.get('nextEpsEst'):
        w.append('Consensus models {} EPS back to ${:.2f} — the Street treats this quarter as a spike, not a new baseline.'.format(fwd.get('nextPeriod'), fwd['nextEpsEst']))
    elif fwd.get('view') == 'step-up' and fwd.get('nextEpsEst'):
        w.append('Consensus keeps {} EPS elevated at ${:.2f} — the Street sees the run-rate holding.'.format(fwd.get('nextPeriod'), fwd['nextEpsEst']))
    r = rec.get('rating') or {}
    if r.get('consensus') and r.get('targetConsensus'):
        w.append('Analyst consensus: {} · target ${:,.0f}.'.format(r['consensus'], r['targetConsensus']))
    return d, w


def merge(rec):
    data = {}
    if os.path.exists(OUT):
        try:
            data = _load(OUT)
        except Exception:
            data = {}
    if not rec.get('drivers') or not rec.get('watch'):
        d, w = default_narrative(rec)
        rec.setdefault('drivers', d)
        rec.setdefault('watch', w)
    data[rec['symbol']] = rec
    with open(OUT, 'w') as fh:
        json.dump(data, fh, indent=0)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sym', required=True)
    ap.add_argument('--tearsheet')
    ap.add_argument('--record')
    ap.add_argument('--memo')
    ap.add_argument('--date')
    a = ap.parse_args()
    if a.record:
        rec = _load(a.record)
        rec['symbol'] = a.sym
        if a.memo:
            rec['memoPath'] = a.memo
    elif a.tearsheet:
        rec = shape_from_tearsheet(a.sym, _load(a.tearsheet), memo_path=a.memo, today=a.date)
    else:
        sys.exit('need --tearsheet or --record')
    if not rec.get('reportDate'):
        sys.exit('no reportDate parsed for {} — skipping'.format(a.sym))
    data = merge(rec)
    sys.stderr.write('{}: {} {} reported {} · EPS {} vs {} ({:+}%)\n'.format(
        a.sym, rec.get('fiscalPeriod'), rec.get('fiscalYear'), rec.get('reportDate'),
        rec['eps']['actual'], rec['eps']['est'], rec['eps']['surprisePct']))
    print(json.dumps(data))


if __name__ == '__main__':
    main()
