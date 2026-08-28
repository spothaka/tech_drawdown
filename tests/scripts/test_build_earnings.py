"""Unit tests for scripts/build_earnings.py — the pure earnings transform.

Exercises shape_from_tearsheet + default_narrative directly (no file I/O, so the real
data/earnings.json is never touched)."""
import build_earnings as be


def _tearsheet():
    """A minimal company-tearsheet slice in the shape the connector returns (newest quarter first)."""
    return {
        "latest_earnings": {
            "reporting_date": "2026-07-14", "fiscal_year": 2026, "reporting_period": "Q2",
            "eps": {"estimated": 14.47, "actual": 20.98, "surprise_pct": 44.99},
            "revenue": {"estimated": 16224980000, "actual": 20338000000, "surprise_pct": 25.35},
        },
        "fundamentals": {"currency": "USD", "income_statement": [
            {"fiscal_year": 2026, "fiscal_period": 2, "eps_diluted": 20.98, "net_income": 6628000000,
             "income_before_tax": 8563000000, "income_tax": 1935000000, "weighted_average_shares_diluted": 304900000},
            {"fiscal_year": 2026, "fiscal_period": 1, "eps_diluted": 17.55, "net_income": 5630000000,
             "income_before_tax": 6486000000, "income_tax": 856000000, "weighted_average_shares_diluted": 308000000},
            {"fiscal_year": 2025, "fiscal_period": 4, "eps_diluted": 14.00, "weighted_average_shares_diluted": 317600000},
            {"fiscal_year": 2025, "fiscal_period": 3, "eps_diluted": 12.25, "weighted_average_shares_diluted": 315000000},
            {"fiscal_year": 2025, "fiscal_period": 2, "eps_diluted": 10.95, "weighted_average_shares_diluted": 318300000},
        ]},
        "analyst_data": {"ratings": {"consensus": "Hold", "buy": 22, "hold": 29, "sell": 4},
                         "price_targets": {"target_consensus": 1142.67}},
        "estimates": {"records": [
            {"metric": "EPS", "fiscal_year": 2026, "fiscal_period": 3, "estimate_mean": 15.31},
            {"metric": "EPS", "fiscal_year": 2026, "fiscal_period": 4, "estimate_mean": 14.72},
        ]},
    }


def test_headline_beat_and_surprise():
    r = be.shape_from_tearsheet("GS", _tearsheet(), memo_path="reports/earnings/GS_2026_Q2.md", today="2026-07-15")
    assert r["reportDate"] == "2026-07-14"
    assert r["fiscalPeriod"] == "Q2" and r["fiscalYear"] == 2026
    assert r["eps"]["actual"] == 20.98 and r["eps"]["est"] == 14.47
    assert round(r["eps"]["surprisePct"], 1) == 45.0
    assert round(r["revenue"]["surprisePct"], 1) == 25.4


def test_surprise_recomputed_when_feed_omits_it():
    t = _tearsheet()
    del t["latest_earnings"]["eps"]["surprise_pct"]
    r = be.shape_from_tearsheet("GS", t)
    # 20.98 / 14.47 - 1 = 44.98%
    assert round(r["eps"]["surprisePct"], 1) == 45.0


def test_eps_trend_is_oldest_to_newest_and_capped():
    r = be.shape_from_tearsheet("GS", _tearsheet())
    trend = r["epsTrend"]
    assert trend[0]["eps"] == 10.95 and trend[-1]["eps"] == 20.98, "oldest -> newest"
    assert len(trend) <= 8


def test_derived_fields():
    r = be.shape_from_tearsheet("GS", _tearsheet())
    assert r["taxRate"] == 22.6                         # 1935/8563
    assert r["dilutedSharesYoYPct"] == -4.2             # 304.9M vs 318.3M
    assert r["epsYoYPct"] == round((20.98 / 10.95 - 1) * 100, 1)


def test_forward_view_is_normalizing_when_next_est_drops():
    r = be.shape_from_tearsheet("GS", _tearsheet())
    assert r["fwd"]["nextPeriod"] == "Q3 2026"
    assert r["fwd"]["nextEpsEst"] == 15.31
    assert r["fwd"]["view"] == "normalizing"            # 15.31 / 20.98 < 0.9


def test_default_narrative_is_factual():
    r = be.shape_from_tearsheet("GS", _tearsheet())
    drivers, watch = be.default_narrative(r)
    assert any("beat" in d.lower() for d in drivers)
    assert any("spike" in w.lower() for w in watch), "normalizing view surfaces the spike caveat"
    assert any("Hold" in w for w in watch)


def test_missing_report_date_yields_no_crash():
    t = _tearsheet()
    t["latest_earnings"]["reporting_date"] = None
    r = be.shape_from_tearsheet("GS", t)
    assert r["reportDate"] is None                      # main() guards on this and skips
