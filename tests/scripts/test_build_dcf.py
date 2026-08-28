"""Tests for scripts/build_dcf.py — DCF base builder from raw FMP data."""
import math

import build_dcf as dcf


class TestN:
    def test_finite_numbers(self):
        assert dcf.n(5) == 5
        assert dcf.n(3.14) == 3.14

    def test_non_finite_and_non_numbers(self):
        assert dcf.n(float("nan")) is None
        assert dcf.n(float("inf")) is None
        assert dcf.n("10") is None
        assert dcf.n(None) is None


def _inc(**over):
    base = {"revenue": 1000.0, "ebit": 200.0, "operatingIncome": 200.0,
            "weightedAverageShsOutDil": 100.0, "fiscalYear": 2023,
            "incomeBeforeTax": 180.0, "incomeTaxExpense": 36.0}
    base.update(over)
    return base


def _cf(**over):
    base = {"depreciationAndAmortization": 50.0, "capitalExpenditure": -30.0,
            "operatingCashFlow": 150.0, "freeCashFlow": 120.0}
    base.update(over)
    return base


def _bs(**over):
    base = {"totalDebt": 100.0, "cashAndShortTermInvestments": 40.0,
            "netReceivables": 60.0, "inventory": 20.0, "accountPayables": 30.0,
            "netDebt": 70.0}
    base.update(over)
    return base


def _est():
    return [
        {"date": "2024-12-31", "revenueAvg": 1100.0, "ebitAvg": 220.0,
         "ebitdaAvg": 280.0, "numAnalystsRevenue": 10},
        {"date": "2025-12-31", "revenueAvg": 1200.0, "ebitAvg": 240.0,
         "ebitdaAvg": 300.0, "numAnalystsRevenue": 8},
    ]


class TestBuild:
    def test_core_fields(self):
        b = dcf.build("MSFT", _est(), [_inc()], [_cf()], [_bs()], {})
        assert b["symbol"] == "MSFT"
        assert b["baseYear"] == 2023
        assert b["rev0"] == 1000.0
        assert b["shares"] == 100.0
        assert b["dna0"] == 50.0
        assert b["capex0"] == 30.0        # abs of -30
        assert b["ocf0"] == 150.0
        assert b["fcf0"] == 120.0

    def test_net_debt_uses_short_term_investments(self):
        b = dcf.build("MSFT", _est(), [_inc()], [_cf()], [_bs()], {})
        assert b["netDebt"] == 60.0       # 100 debt - 40 cash&ST
        assert b["netDebtFmp"] == 70.0    # FMP's own field carried for comparison
        assert b["nwc0"] == 50.0          # 60 + 20 - 30

    def test_effective_tax_within_range_not_clamped(self):
        b = dcf.build("MSFT", _est(), [_inc()], [_cf()], [_bs()], {})
        assert b["taxEff"] == 36.0 / 180.0
        assert b["taxClamped"] is False

    def test_negative_tax_is_clamped(self):
        inc = _inc(incomeTaxExpense=-5.0)   # negative effective rate
        b = dcf.build("MSFT", _est(), [inc], [_cf()], [_bs()], {})
        assert b["taxClamped"] is True
        assert b["taxEff"] == 0.21

    def test_estimates_capped_and_sorted(self):
        b = dcf.build("MSFT", _est(), [_inc()], [_cf()], [_bs()], {})
        assert len(b["est"]) == 2
        assert [r["fy"] for r in b["est"]] == [2024, 2025]
        assert b["est"][0]["dna"] == 60.0   # ebitda - ebit = 280 - 220

    def test_drops_estimates_at_or_before_base_year(self):
        est = _est() + [{"date": "2023-12-31", "revenueAvg": 999.0,
                         "ebitAvg": 100.0, "ebitdaAvg": 150.0}]
        b = dcf.build("MSFT", est, [_inc()], [_cf()], [_bs()], {})
        assert all(r["fy"] > 2023 for r in b["est"])

    def test_returns_none_without_revenue(self):
        assert dcf.build("X", _est(), [_inc(revenue=None)], [_cf()], [_bs()], {}) is None

    def test_returns_none_with_too_few_estimates(self):
        assert dcf.build("X", _est()[:1], [_inc()], [_cf()], [_bs()], {}) is None


def _est_ni(ebits, nis, revs=(1100.0, 1200.0)):
    """Two forward estimate years with explicit ebitAvg and netIncomeAvg."""
    return [
        {"date": "2024-12-31", "revenueAvg": revs[0], "ebitAvg": ebits[0],
         "ebitdaAvg": ebits[0] + 60.0, "netIncomeAvg": nis[0], "numAnalystsRevenue": 10},
        {"date": "2025-12-31", "revenueAvg": revs[1], "ebitAvg": ebits[1],
         "ebitdaAvg": ebits[1] + 60.0, "netIncomeAvg": nis[1], "numAnalystsRevenue": 8},
    ]


class TestEbitReconstruction:
    def test_reconstructs_when_ebit_below_net_income(self):
        # ebit sum 460 vs ni sum 900 -> ratio 0.51 < 0.85: physically impossible, rebuild it
        est = _est_ni(ebits=(220.0, 240.0), nis=(400.0, 500.0))
        b = dcf.build("AMZNISH", est, [_inc()], [_cf()], [_bs()], {})
        assert b["ebitRecon"] is True
        assert b["ebitReconRatio"] == round(460.0 / 900.0, 4)
        tax = b["taxEff"]                        # 36/180 = 0.2
        assert math.isclose(b["est"][0]["ebit"], 400.0 / (1 - tax))   # ni / (1-tax)
        assert math.isclose(b["est"][1]["ebit"], 500.0 / (1 - tax))
        # D&A re-based to base-year cash intensity (dna0/rev0 = 50/1000 = 5%), not the corrupt ebitda-ebit
        assert math.isclose(b["est"][0]["dna"], 0.05 * 1100.0)
        # ni retained so the gate is re-auditable offline from the stored base
        assert b["est"][0]["ni"] == 400.0
        assert "ebitRaw" not in b["est"][0]      # no unused payload in the deployed DATA

    def test_no_reconstruction_when_ebit_above_net_income(self):
        # ebit sum 460 vs ni sum 300 -> ratio 1.53: clean, leave it exactly as consensus reports
        est = _est_ni(ebits=(220.0, 240.0), nis=(140.0, 160.0))
        b = dcf.build("MSFTISH", est, [_inc()], [_cf()], [_bs()], {})
        assert b["ebitRecon"] is False
        assert b["est"][0]["ebit"] == 220.0
        assert b["est"][0]["dna"] == 60.0        # ebitda - ebit, unchanged
        assert b["est"][0]["ni"] == 140.0

    def test_boundary_mild_wobble_not_tripped(self):
        # NVDA-like: ni slightly above ebit (ratio ~0.98) from interest income / analyst-set noise.
        # Aggregate gate must NOT reconstruct a fundamentally sound EBIT line.
        est = _est_ni(ebits=(480.0, 490.0), nis=(490.0, 500.0))  # 970 / 990 = 0.98
        b = dcf.build("NVDAISH", est, [_inc()], [_cf()], [_bs()], {})
        assert b["ebitRecon"] is False
        assert b["est"][0]["ebit"] == 480.0

    def test_missing_net_income_is_a_no_op(self):
        b = dcf.build("MSFT", _est(), [_inc()], [_cf()], [_bs()], {})  # fixtures carry no netIncomeAvg
        assert b["ebitRecon"] is False
        assert b["ebitReconRatio"] is None
        assert b["est"][0]["ni"] is None

    def test_loss_maker_negative_sums_never_fire(self):
        # Net loss smaller than operating loss is normal GAAP (tax benefit), not corruption.
        # With negative sums the >= comparison would invert; the sum_ni>0 guard must keep the gate shut.
        est = _est_ni(ebits=(-220.0, -240.0), nis=(-140.0, -160.0))
        b = dcf.build("LOSSY", est, [_inc()], [_cf()], [_bs()], {})
        assert b["ebitRecon"] is False
        assert b["ebitReconRatio"] is None       # gate not evaluable on non-positive net income
        assert b["est"][0]["ebit"] == -220.0     # correct EBIT line untouched

    def test_partial_ni_gate_uses_matched_subset_and_truncates_tail(self):
        # 3rd year lacks netIncomeAvg. The gate must compare ONLY the matched rows (460 vs 900,
        # not 720 vs 900 which would clear 0.85), and on firing must truncate the no-ni tail so
        # the surviving rows are uniformly reconstructed — never a mixed corrupt/rebuilt series.
        est = _est_ni(ebits=(220.0, 240.0), nis=(400.0, 500.0))
        est.append({"date": "2026-12-31", "revenueAvg": 1300.0, "ebitAvg": 260.0,
                    "ebitdaAvg": 320.0, "numAnalystsRevenue": 4})   # no netIncomeAvg
        b = dcf.build("PARTIAL", est, [_inc()], [_cf()], [_bs()], {})
        assert b["ebitRecon"] is True
        assert b["ebitReconRatio"] == round(460.0 / 900.0, 4)       # matched subset, not all-rows ebit
        assert len(b["est"]) == 2                                   # no-ni tail year dropped
        tax = b["taxEff"]
        assert math.isclose(b["est"][1]["ebit"], 500.0 / (1 - tax))

    def test_zero_ni_is_a_real_estimate_not_missing(self):
        # A breakeven consensus year (ni=0.0) must count in the gate and be rebuilt to EBIT 0.
        est = _est_ni(ebits=(220.0, 240.0), nis=(0.0, 600.0))       # 460/600 = 0.77 < 0.85 -> fires
        b = dcf.build("BREAKEVEN", est, [_inc()], [_cf()], [_bs()], {})
        assert b["ebitRecon"] is True
        assert b["est"][0]["ebit"] == 0.0                           # rebuilt from the zero estimate
        assert math.isclose(b["est"][1]["ebit"], 600.0 / (1 - b["taxEff"]))

    def test_base_carries_asof_stamp(self):
        import datetime
        b = dcf.build("MSFT", _est(), [_inc()], [_cf()], [_bs()], {})
        assert b["asOf"] == datetime.date.today().isoformat()


class TestWaccInputs:
    def test_no_price_all_debt_weight(self):
        w = dcf._wacc_inputs({}, totalDebt=100.0, shares=100.0, tax=0.2)
        assert w["wE"] == 0.0      # market cap 0 -> all weight on debt
        assert w["wD"] == 1.0
        assert w["kdAT"] == 4.0    # 5.0 * (1 - 0.2)
        assert w["beta"] == 1.0

    def test_with_price(self):
        w = dcf._wacc_inputs({"price": 10.0, "beta": 1.3, "kd": 4.0},
                             totalDebt=100.0, shares=100.0, tax=0.25)
        # mcap = 1000, total = 1100
        assert w["wE"] == round(1000.0 / 1100.0, 5)
        assert w["wD"] == round(100.0 / 1100.0, 5)
        assert w["kdAT"] == 3.0    # 4.0 * (1 - 0.25)
        assert w["beta"] == 1.3
        assert w["price"] == 10.0
