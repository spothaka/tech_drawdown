"""integrity_guard.py — data-quality guard for the Tech Drawdown dashboard.

Scans/sanitizes the assembled DATA (or FMP-built rows) for impossible values.
Corrupt rows get their DERIVED signals suppressed and are tagged dq:"error" so a
bad source cell never surfaces a bogus number. Raw price/high kept for diagnosis.

Detection: prefers a true 52-week band check when year_low is present (connector
rows); falls back to a max/min ratio heuristic for STOCKHISTORY rows (no low).
"""
from __future__ import annotations
import copy, json, sys, os

UNIVERSE_KEYS = ["sp", "nasdaq", "dow", "etfs", "thematic", "mutualfunds"]
FUND_KEYS = {"etfs", "thematic", "mutualfunds"}
TAB = {"sp": "S&P 500", "nasdaq": "Nasdaq-100", "dow": "Dow Jones 100",
       "etfs": "Top 100 ETFs", "thematic": "Thematic ETFs", "mutualfunds": "Mutual Funds"}

RATIO_MAX = 3.0        # fallback (no year_low): max/min across price fields above this => outlier
BAND_MARGIN = 0.05     # preferred: value corrupt if outside [year_low, year_high] by more than this

_DERIVED_NUM = ["off", "recover", "smapct", "sma50pct"]
_DERIVED_TXT = ["status", "signal", "cross"]


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if s in ("", "—", "#N/A") or "N/A" in s:
            return None
        try:
            return float(s.replace(",", ""))
        except ValueError:
            return None
    return None


def _classify(row):
    """Return (severity, problem) or (None, None). severity in
    {CORRUPT, MISSING (price/high), MISSING}."""
    price, high = _num(row.get("price")), _num(row.get("high"))
    sma, sma50 = _num(row.get("sma")), _num(row.get("sma50"))
    low = _num(row.get("low"))  # 52-wk low — present on connector rows (FMP year_low)

    present = [v for v in (price, high, sma, sma50, low) if v is not None]
    if any(v <= 0 for v in present):
        return "CORRUPT", "non-positive price/high/SMA/low value"
    if price is not None and high is not None and high < price * 0.999:
        return "CORRUPT", "52-wk high is below current price (impossible)"

    if low is not None and high is not None and low <= high:
        lo, hi = low * (1 - BAND_MARGIN), high * (1 + BAND_MARGIN)
        for name, v in (("price", price), ("sma", sma), ("sma50", sma50)):
            if v is not None and not (lo <= v <= hi):
                return "CORRUPT", f"{name}={v} outside 52-wk band [{low}, {high}]"
    else:
        p2 = [v for v in (price, high, sma, sma50) if v is not None]
        if len(p2) >= 2 and min(p2) > 0 and max(p2) / min(p2) > RATIO_MAX:
            return "CORRUPT", f"one field is a wild outlier (max/min {max(p2)/min(p2):.1f}x)"

    missing = [n for n, v in (("price", price), ("high", high), ("sma", sma), ("sma50", sma50)) if v is None]
    if missing:
        hard = [m for m in missing if m in ("price", "high")]
        return ("MISSING (price/high)" if hard else "MISSING"), "#N/A in: " + ", ".join(missing)
    return None, None


def scan(data):
    findings = []
    for key in UNIVERSE_KEYS:
        for row in data.get(key, []) or []:
            sev, prob = _classify(row)
            if sev is None:
                continue
            findings.append({"ticker": row.get("ticker"), "tab": TAB.get(key, key), "key": key,
                             "severity": sev, "problem": prob,
                             "price": _num(row.get("price")), "high": _num(row.get("high")),
                             "sma": _num(row.get("sma")), "sma50": _num(row.get("sma50"))})
    order = {"CORRUPT": 0, "MISSING (price/high)": 1, "MISSING": 2}
    findings.sort(key=lambda f: (order.get(f["severity"], 3), f["tab"], f["ticker"] or ""))
    return findings


def sanitize(data):
    d = copy.deepcopy(data)
    findings = scan(d)
    flagged = {(f["key"], f["ticker"]): f for f in findings}
    for key in UNIVERSE_KEYS:
        for row in d.get(key, []) or []:
            f = flagged.get((key, row.get("ticker")))
            if not f:
                continue
            if f["severity"] == "CORRUPT":
                for c in _DERIVED_NUM:
                    if c in row:
                        row[c] = None
                for c in _DERIVED_TXT:
                    if c in row:
                        row[c] = "—"
                row["dq"] = "error"
            else:
                row["dq"] = "missing"
    return d, findings


def format_report(findings):
    if not findings:
        return "DATA-INTEGRITY: none — all universe rows passed."
    from collections import Counter
    c = Counter(f["severity"] for f in findings)

    def names(sev):
        return sorted({f["ticker"] for f in findings if f["severity"] == sev})

    return "\n".join([
        "DATA-INTEGRITY (STOCKHISTORY guard):",
        f"  CORRUPT (signals suppressed): {c.get('CORRUPT', 0)} -> " + (", ".join(names("CORRUPT")) or "none"),
        f"  MISSING price/high (blank rows): {c.get('MISSING (price/high)', 0)} -> " + (", ".join(names("MISSING (price/high)")) or "none"),
        f"  MISSING secondary SMA (low priority): {c.get('MISSING', 0)} -> " + (", ".join(names("MISSING")) or "none"),
    ])


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "dash_data_live.json")
    data = json.load(open(src))
    findings = scan(data)
    print(format_report(findings))
    print(f"\n(total flagged rows: {len(findings)}; source: {src})")
