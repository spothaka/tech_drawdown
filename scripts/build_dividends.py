"""Dividend income calendar — forward 12-month projection across held names.

Two-tier, honest by construction:
  Tier 1 (declared/exact): held STOCKS via the FMP dividends feed (calendar ->
          dividends-company), passed in as raw records. Future declared payments
          are marked "declared"; further quarters are projected from frequency +
          latest amount (marked "estimated").
  Tier 2 (yield-based): ETFs / funds listed in data/dividend_schedule.json —
          annual income = yield x market value, spread over the fund's cadence
          (all "estimated", month-level dates). Yield comes from the universe
          `divyield` (fraction) or the schedule's `yield` override.

Pure transform — no connector calls (the daily task fetches the raw stock feed).
Emits DATA.dividends:
  {asOf, annual, yield, next30, currency:"USD",
   months:[{ym,label,ira,brokerage,total} x12],
   upcoming:[{ticker,account,exDate,payDate,amount,shares,income,freq,declared} ...]}

Usage:
  python build_dividends.py --holdings today_data.json --raw dividends_raw.json \
         --schedule ../data/dividend_schedule.json [--date YYYY-MM-DD]
"""
import os, sys, json, argparse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

def per_year(freq):
    f = (freq or '').lower()
    if 'month' in f: return 12
    if 'semi' in f: return 2
    if 'annual' in f or 'year' in f: return 1
    if 'quarter' in f: return 4
    return 4

def d(s):
    try: return datetime.date.fromisoformat(str(s)[:10])
    except Exception: return None

def divyield_map(D):
    y = {}
    for tab in ('etfs', 'thematic', 'mutualfunds', 'sp', 'nasdaq', 'dow'):
        for r in D.get(tab, []):
            if r.get('ticker') and r.get('divyield') is not None:
                y[r['ticker']] = r['divyield']
    return y

def holdings(D):
    """list of {ticker, account, qty, value}"""
    out = []
    for acct, label in (('ira', 'ira'), ('brokerage', 'brokerage')):
        for r in D.get(acct, []):
            t = r.get('ticker'); ty = r.get('type') or ''
            if not t or ty in ('CD', 'Cash'):
                continue
            out.append({'ticker': t, 'account': label,
                        'qty': float(r.get('qty') or 0), 'value': float(r.get('value') or 0)})
    return out

def add_month(base, n):
    y = base.year + (base.month - 1 + n) // 12
    m = (base.month - 1 + n) % 12 + 1
    return datetime.date(y, m, 1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--holdings', required=True)
    ap.add_argument('--raw', default=None)
    ap.add_argument('--schedule', default=os.path.join(ROOT, 'data', 'dividend_schedule.json'))
    ap.add_argument('--date', default=datetime.date.today().isoformat())
    a = ap.parse_args()

    D = json.load(open(a.holdings, encoding='utf-8'))
    RAW = {}
    if a.raw and os.path.exists(a.raw):
        try: RAW = json.load(open(a.raw, encoding='utf-8')) or {}
        except Exception: RAW = {}
    SCHED = {}
    try:
        SCHED = {k: v for k, v in json.load(open(a.schedule, encoding='utf-8')).items() if not k.startswith('_')}
    except Exception:
        SCHED = {}

    asOf = d(a.date)
    yields = divyield_map(D)
    holds = holdings(D)
    household = sum(h['value'] for h in holds) or 1.0

    # forward 12-month buckets (current month .. +11)
    m0 = datetime.date(asOf.year, asOf.month, 1)
    months = []
    midx = {}
    for i in range(12):
        mm = add_month(m0, i)
        ym = '%04d-%02d' % (mm.year, mm.month)
        midx[ym] = i
        months.append({'ym': ym, 'label': MONTHS[mm.month - 1] + " '" + ('%02d' % (mm.year % 100)),
                       'ira': 0.0, 'brokerage': 0.0, 'total': 0.0})
    horizon = add_month(m0, 12)  # exclusive upper bound (first day of month 13)

    # per-ticker holdings grouped
    by_tkr = {}
    for h in holds:
        by_tkr.setdefault(h['ticker'], []).append(h)

    upcoming = []

    def emit(ticker, exd, payd, amt, freq, declared):
        """amt = $/share. Splits income across the ticker's accounts; buckets by pay month."""
        if payd is None or not (m0 <= payd < horizon):
            return
        ym = '%04d-%02d' % (payd.year, payd.month)
        if ym not in midx:
            return
        tot_sh = 0.0
        for h in by_tkr.get(ticker, []):
            inc = amt * h['qty']
            if inc <= 0:
                continue
            months[midx[ym]][h['account']] += inc
            months[midx[ym]]['total'] += inc
            tot_sh += h['qty']
        if tot_sh > 0:
            acct = by_tkr[ticker][0]['account'] if len(by_tkr[ticker]) == 1 else 'Both'
            upcoming.append({'ticker': ticker, 'account': acct,
                             'exDate': exd.isoformat() if exd else None,
                             'payDate': payd.isoformat(),
                             'amount': round(amt, 4), 'shares': round(tot_sh, 3),
                             'income': round(amt * tot_sh, 2), 'freq': freq, 'declared': declared})

    for ticker, hs in by_tkr.items():
        # ---- Tier 2: ETF / fund (schedule-listed OR has a universe yield and looks fund-like) ----
        sc = SCHED.get(ticker)
        if sc is not None:
            y = yields.get(ticker)
            if y is None:
                y = sc.get('yield', 0.0)
            if not y:
                continue
            n = per_year(sc.get('freq'))
            if 'month' in (sc.get('freq') or '').lower():
                pay_months = list(range(1, 13))
            else:
                pay_months = sc.get('months') or [3, 6, 9, 12][:n]
            per_period_rate = y / max(1, len(pay_months))  # fraction of value per distribution
            for i in range(13):
                mm = add_month(m0, i)
                if mm.month in pay_months and m0 <= mm < horizon:
                    payd = datetime.date(mm.year, mm.month, 15)
                    exd = datetime.date(mm.year, mm.month, 12)
                    # emit per-account using value-based income (not per-share)
                    ym = '%04d-%02d' % (mm.year, mm.month)
                    tot_inc = 0.0
                    for h in hs:
                        inc = per_period_rate * h['value']
                        months[midx[ym]][h['account']] += inc
                        months[midx[ym]]['total'] += inc
                        tot_inc += inc
                    if tot_inc > 0:
                        acct = hs[0]['account'] if len(hs) == 1 else 'Both'
                        upcoming.append({'ticker': ticker, 'account': acct,
                                         'exDate': exd.isoformat(), 'payDate': payd.isoformat(),
                                         'amount': None, 'shares': round(sum(h['qty'] for h in hs), 3),
                                         'income': round(tot_inc, 2), 'freq': sc.get('freq'), 'declared': False})
            continue
        # ---- Tier 1: stock via FMP dividends feed ----
        recs = RAW.get(ticker) or []
        recs = [r for r in recs if r.get('dividend') and d(r.get('date'))]
        if not recs:
            continue
        recs.sort(key=lambda r: d(r['date']), reverse=True)
        latest = recs[0]
        amt = float(latest['dividend'])
        freq = latest.get('frequency') or 'Quarterly'
        step = max(1, round(365 / per_year(freq)))
        # pay lag from latest record
        ex0, pay0 = d(latest['date']), d(latest.get('paymentDate'))
        lag = (pay0 - ex0).days if (ex0 and pay0 and 0 < (pay0 - ex0).days < 45) else 14
        # declared future payments straight from the feed
        declared_ex = set()
        for r in recs:
            pex, ppay = d(r.get('date')), d(r.get('paymentDate'))
            if ppay and ppay >= asOf and m0 <= ppay < horizon:
                emit(ticker, pex, ppay, float(r['dividend']), freq, True)
                if pex: declared_ex.add(pex)
        # project forward from the latest ex date
        cur = ex0
        guard = 0
        while cur and cur < horizon and guard < 60:
            cur = cur + datetime.timedelta(days=step)
            guard += 1
            if cur < asOf:
                continue
            if any(abs((cur - de).days) <= 10 for de in declared_ex):
                continue
            emit(ticker, cur, cur + datetime.timedelta(days=lag), amt, freq, False)

    for mo in months:
        mo['ira'] = round(mo['ira'], 2); mo['brokerage'] = round(mo['brokerage'], 2); mo['total'] = round(mo['total'], 2)
    annual = round(sum(mo['total'] for mo in months), 2)
    horizon30 = asOf + datetime.timedelta(days=30)
    next30 = round(sum(u['income'] for u in upcoming if d(u['payDate']) and asOf <= d(u['payDate']) <= horizon30), 2)
    upcoming.sort(key=lambda u: u['payDate'])
    upcoming = [u for u in upcoming if d(u['payDate']) >= asOf][:10]

    out = {'asOf': a.date, 'currency': 'USD', 'annual': annual,
           'yield': round(annual / household, 4), 'next30': next30,
           'months': months, 'upcoming': upcoming}
    sys.stderr.write('dividends: annual $%.0f  yield %.2f%%  next30 $%.0f  upcoming %d\n'
                     % (annual, 100 * annual / household, next30, len(upcoming)))
    print(json.dumps(out, separators=(',', ':')))

if __name__ == '__main__':
    main()
