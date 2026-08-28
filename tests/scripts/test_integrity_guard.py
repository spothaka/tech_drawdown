"""Tests for scripts/integrity_guard.py — data-quality guard for universe rows."""
import integrity_guard as ig


class TestNum:
    def test_passthrough_numbers(self):
        assert ig._num(5) == 5.0
        assert ig._num(3.5) == 3.5

    def test_none_and_bool(self):
        assert ig._num(None) is None
        assert ig._num(True) is None      # bools must not count as numbers
        assert ig._num(False) is None

    def test_string_numbers_and_commas(self):
        assert ig._num("1,234.5") == 1234.5
        assert ig._num("  42 ") == 42.0

    def test_string_sentinels(self):
        assert ig._num("") is None
        assert ig._num("—") is None
        assert ig._num("#N/A") is None
        assert ig._num("N/A (gated)") is None
        assert ig._num("not-a-number") is None


class TestClassify:
    def test_clean_row_within_band(self):
        row = {"price": 100, "high": 120, "low": 80, "sma": 110, "sma50": 105}
        assert ig._classify(row) == (None, None)

    def test_non_positive_is_corrupt(self):
        sev, prob = ig._classify({"price": -1, "high": 120})
        assert sev == "CORRUPT"
        assert "non-positive" in prob

    def test_high_below_price_is_corrupt(self):
        sev, prob = ig._classify({"price": 100, "high": 50})
        assert sev == "CORRUPT"
        assert "below current price" in prob

    def test_value_outside_52wk_band_is_corrupt(self):
        # high >= price so the high-below-price check does not fire first
        sev, prob = ig._classify({"price": 100, "high": 120, "low": 80, "sma": 300})
        assert sev == "CORRUPT"
        assert "outside 52-wk band" in prob

    def test_ratio_outlier_without_low(self):
        sev, prob = ig._classify({"price": 100, "high": 110, "sma": 10})
        assert sev == "CORRUPT"
        assert "wild outlier" in prob

    def test_missing_secondary(self):
        sev, prob = ig._classify({"price": 100, "high": 120, "low": 80})
        assert sev == "MISSING"
        assert "sma" in prob

    def test_missing_price_high_is_hard(self):
        sev, prob = ig._classify({"high": 120, "low": 80, "sma": 110, "sma50": 105})
        assert sev == "MISSING (price/high)"
        assert "price" in prob


def _corrupt_row():
    return {"ticker": "BAD", "price": 100, "high": 50, "off": -0.5,
            "recover": 1.0, "status": "Bear", "signal": "x",
            "sma": 60, "smapct": 0.1, "sma50": 55, "sma50pct": 0.2,
            "cross": "Golden Cross"}


def _clean_row():
    return {"ticker": "GOOD", "price": 100, "high": 120, "low": 80,
            "sma": 110, "sma50": 105, "off": -0.1667}


class TestScanSanitize:
    def test_scan_flags_only_corrupt(self):
        data = {"sp": [_clean_row(), _corrupt_row()]}
        findings = ig.scan(data)
        assert len(findings) == 1
        assert findings[0]["ticker"] == "BAD"
        assert findings[0]["severity"] == "CORRUPT"
        assert findings[0]["tab"] == "S&P 500"

    def test_sanitize_suppresses_derived_on_corrupt(self):
        data = {"sp": [_clean_row(), _corrupt_row()]}
        cleaned, findings = ig.sanitize(data)
        bad = next(r for r in cleaned["sp"] if r["ticker"] == "BAD")
        assert bad["dq"] == "error"
        for numeric in ("off", "recover", "smapct", "sma50pct"):
            assert bad[numeric] is None
        for text in ("status", "signal", "cross"):
            assert bad[text] == "—"

    def test_sanitize_does_not_touch_clean_row(self):
        data = {"sp": [_clean_row(), _corrupt_row()]}
        cleaned, _ = ig.sanitize(data)
        good = next(r for r in cleaned["sp"] if r["ticker"] == "GOOD")
        assert "dq" not in good
        assert good["off"] == -0.1667

    def test_sanitize_is_non_mutating(self):
        data = {"sp": [_corrupt_row()]}
        ig.sanitize(data)
        assert data["sp"][0]["status"] == "Bear"   # original untouched (deepcopy)


class TestFormatReport:
    def test_empty(self):
        assert ig.format_report([]) == "DATA-INTEGRITY: none — all universe rows passed."

    def test_counts_and_names(self):
        findings = ig.scan({"sp": [_corrupt_row()]})
        report = ig.format_report(findings)
        assert "CORRUPT (signals suppressed): 1" in report
        assert "BAD" in report
