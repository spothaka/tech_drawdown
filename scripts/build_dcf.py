"""DCF bases from RAW FMP data (consensus + statements) -> data/dcf.json  ->  DATA.dcf

Replaces the old approach, which used FMP's pre-baked `custom-dcf-advanced`. That endpoint
projected every ratio as a 5-YEAR HISTORICAL AVERAGE (so NVDA's 65.6% margin "reverted" to 48.1%)
and derived WACC from a raw trailing beta. It was someone else's opinion with hidden assumptions.

Now we build from primary data:
  analyst/financial-estimates   -> forward revenue + EBIT + EBITDA + NET INCOME per FY, analyst counts
                                   (EBIT is sanity-checked against net income and rebuilt if corrupt —
                                    FMP's GAAP ebitAvg can sit impossibly below net income; see below)
  statements/income-statement   -> base revenue/EBIT, effective tax (clamped)
  statements/cashflow-statement -> actual D&A, capex, OCF, FCF
  statements/balance-sheet      -> CORRECT net debt = totalDebt - cash&ST-investments
                                   (FMP's own netDebt field excludes short-term investments)
Beta/cost-of-debt/capital-weights are carried over per symbol (data/dcf_wacc.json) — they are
WACC inputs and remain user-adjustable in the UI anyway.

Usage: python build_dcf.py --sym MSFT --est e.json --inc i.json --cf c.json --bs b.json
"""
import os, sys, json, math, argparse, datetime

HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
OUT=os.path.join(ROOT,'data','dcf.json')
WACC=os.path.join(ROOT,'data','dcf_wacc.json')

# Reconstruct EBIT when the aggregate consensus operating income falls below this fraction of
# consensus NET income. Operating income can't sit under the after-tax bottom line, so a ratio this
# low means FMP's GAAP-based ebitAvg is corrupt/understated (AMZN ~0.59, AMD ~0.37). The gate is
# aggregate (summed over the forecast years) so per-year analyst-set noise — e.g. NVDA's mild
# interest-income wobble, ratio ~0.98 — does NOT trip it. Clean names sit above 1.0 and are untouched.
EBIT_RECON_TRIGGER=0.85

def n(x): return x if isinstance(x,(int,float)) and math.isfinite(x) else None
def L(p):
    v=json.load(open(p,encoding='utf-8'))
    return v if isinstance(v,list) else v.get('result',[])

def build(sym, est, inc, cf, bs, wacc):
    i0=inc[0]; c0=cf[0]; b0=bs[0]
    rev0=n(i0.get('revenue')); ebit0=n(i0.get('ebit')) or n(i0.get('operatingIncome'))
    sh=n(i0.get('weightedAverageShsOutDil')) or n(i0.get('weightedAverageShsOut'))
    if not rev0 or not sh: return None
    baseYear=int(i0.get('fiscalYear') or str(i0.get('date',''))[:4])

    # effective tax, CLAMPED — AMD reported a NEGATIVE rate (-2.5%), which would inflate FCF
    pre=n(i0.get('incomeBeforeTax')); tx=n(i0.get('incomeTaxExpense'))
    tax = (tx/pre) if (pre and tx is not None and pre>0) else None
    taxClamped = not (tax is not None and 0.05 <= tax <= 0.45)
    if taxClamped: tax = 0.21

    # CORRECT net debt (FMP's netDebt field ignores short-term investments)
    td=n(b0.get('totalDebt')) or 0
    cash=n(b0.get('cashAndShortTermInvestments')) or n(b0.get('cashAndCashEquivalents')) or 0
    netDebt = td - cash
    nwc0=(n(b0.get('netReceivables')) or 0)+(n(b0.get('inventory')) or 0)-(n(b0.get('accountPayables')) or 0)

    dna0=n(c0.get('depreciationAndAmortization')) or 0
    capex0=abs(n(c0.get('capitalExpenditure')) or 0)
    ocf0=n(c0.get('operatingCashFlow')); fcf0=n(c0.get('freeCashFlow'))

    rows=[]
    for e in est:
        fy=int(str(e.get('date',''))[:4])
        r=n(e.get('revenueAvg')); eb=n(e.get('ebitAvg')); ed=n(e.get('ebitdaAvg')); ni=n(e.get('netIncomeAvg'))
        if not r or eb is None: continue
        if fy <= baseYear: continue           # drop estimates for years already reported
        rows.append(dict(fy=fy, rev=r, ebit=eb, ni=ni, dna=max(0.0,(ed-eb) if ed is not None else 0.0),
                         nA=int(e.get('numAnalystsRevenue') or 0)))
    rows.sort(key=lambda x:x['fy'])
    rows=rows[:5]
    if len(rows)<2: return None

    rows, ebitRecon, ebitReconRatio = _reconstruct_ebit(rows, tax, dna0, rev0)
    if len(rows)<2: return None               # reconstruction may truncate a no-ni tail

    return dict(symbol=sym, baseYear=baseYear, rev0=rev0, ebit0=ebit0, dna0=dna0, capex0=capex0,
                ocf0=ocf0, fcf0=fcf0, nwc0=nwc0, shares=sh, taxEff=tax, taxClamped=taxClamped,
                totalDebt=td, cash=cash, netDebt=netDebt, netDebtFmp=n(b0.get('netDebt')),
                capexPct0=(capex0/rev0), nwcPct=(nwc0/rev0), est=rows,
                ebitRecon=ebitRecon, ebitReconRatio=ebitReconRatio,
                asOf=datetime.date.today().isoformat(),
                **_wacc_inputs(wacc, td, sh, tax))

def _reconstruct_ebit(rows, tax, dna0, rev0):
    """If consensus operating income (ebitAvg) sits impossibly below consensus net income, rebuild it.

    FMP's ebitAvg is GAAP-based and, for some names, so understated it falls BELOW consensus net income
    — impossible, since operating income is above the after-tax bottom line. We detect it in aggregate
    and rebuild EBIT from the reliable net-income line:
        EBIT ≈ netIncome / (1 - tax)          (net interest is immaterial for the affected net-cash names)
    D&A is re-based to the base-year cash intensity because the corrupt EBITDA line can't be trusted for
    an ebitda−ebit split.

    Guards (each keeps the base UNIFORM — the model must never run on mixed corrupt/rebuilt rows,
    because the LAST est row alone seeds the fade and terminal margin):
      - the ratio compares matched subsets only: rows where ni is not None (a missing later-year
        estimate must not dilute the gate; ni == 0.0 is a real estimate and counts);
      - sum_ni must be positive — for a loss-maker, net loss above operating loss is normal GAAP
        (the tax benefit), not corruption, and the >= comparison would invert on negative sums;
      - on firing, the row list is truncated at the first row lacking ni, so every surviving row is
        reconstructed on the same basis; if that leaves <2 rows, nothing is rebuilt (the raw base
        ships uniformly, and the recorded ratio < trigger marks it suspect for the monitor).

    Rows keep their 'ni' so the gate stays re-auditable offline from data/dcf.json alone.
    Returns (rows, ebitRecon: bool, ratio: float|None).
    """
    have=[x for x in rows if x.get('ni') is not None]
    if len(have)<2: return rows, False, None
    sum_ebit=sum(x['ebit'] for x in have)
    sum_ni=sum(x['ni'] for x in have)
    if sum_ni<=0: return rows, False, None
    ratio=round(sum_ebit/sum_ni,4)
    if sum_ebit >= EBIT_RECON_TRIGGER*sum_ni: return rows, False, ratio
    k=0
    while k<len(rows) and rows[k].get('ni') is not None: k+=1
    kept=rows[:k]
    if len(kept)<2: return rows, False, ratio
    dnaPct0=(dna0/rev0) if rev0 else 0.08
    for x in kept:
        x['ebit']=x['ni']/(1.0-tax); x['dna']=dnaPct0*x['rev']
    return kept, True, ratio

def _wacc_inputs(w, totalDebt, shares, tax):
    """Capital weights derived from the balance sheet + market cap (no vendor DCF endpoint needed).
    beta/price come from company/profile-symbol; after-tax cost of debt from a pre-tax Kd assumption."""
    price=w.get('price'); beta=w.get('beta',1.0); kd=w.get('kd',5.0)   # pre-tax cost of debt %
    mcap=(price or 0)*shares
    tot=mcap+(totalDebt or 0)
    wE=(mcap/tot) if tot else 1.0
    wD=1.0-wE
    return dict(beta=beta, kdAT=round(kd*(1-tax),3), wE=round(wE,5), wD=round(wD,5), price=price)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--sym',required=True); ap.add_argument('--est',required=True)
    ap.add_argument('--inc',required=True); ap.add_argument('--cf',required=True); ap.add_argument('--bs',required=True)
    a=ap.parse_args()
    store={}
    if os.path.exists(OUT):
        try: store=json.load(open(OUT,encoding='utf-8'))
        except Exception: store={}
    w={}
    if os.path.exists(WACC):
        try: w=json.load(open(WACC,encoding='utf-8'))
        except Exception: w={}
    b=build(a.sym, L(a.est), L(a.inc), L(a.cf), L(a.bs), w.get(a.sym,{}))
    if not b:
        sys.stderr.write('%s -> no usable model\n'%a.sym); sys.exit(1)
    store[a.sym]=b
    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    json.dump(store,open(OUT,'w',encoding='utf-8'),separators=(',',':'))
    sys.stderr.write('%-5s base FY%d rev $%.1fB  netDebt $%.1fB (fmp said $%.1fB)  tax %.1f%%%s  est %d yrs%s\n' % (
        a.sym, b['baseYear'], b['rev0']/1e9, b['netDebt']/1e9, (b['netDebtFmp'] or 0)/1e9,
        b['taxEff']*100, ' [CLAMPED]' if b['taxClamped'] else '', len(b['est']),
        (' [EBIT RECONSTRUCTED: consensus ebit was %.0f%% of net income]'%(b['ebitReconRatio']*100)) if b.get('ebitRecon') else ''))

if __name__=='__main__': main()
