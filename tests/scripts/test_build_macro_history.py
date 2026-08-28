"""Tests for scripts/build_macro_history.py — macro series downsampling."""
import build_macro_history as mh


class TestNum:
    def test_prefers_first_available_field(self):
        assert mh._num({"price": "10.5"}) == 10.5
        assert mh._num({"value": 3}) == 3.0
        assert mh._num({"close": None, "value": 5}) == 5.0

    def test_missing(self):
        assert mh._num({}) is None
        assert mh._num("not-a-dict") is None


class TestRows:
    def test_normalizes_and_sorts(self):
        raw = [{"date": "2024-01-08", "price": 2}, {"date": "2024-01-01", "price": 1}]
        rows = mh._rows(raw)
        assert [r["d"] for r in rows] == ["2024-01-01", "2024-01-08"]
        assert rows[0]["v"] == 1.0

    def test_unwraps_historical_key(self):
        raw = {"historical": [{"date": "2024-01-01", "value": 7}]}
        assert mh._rows(raw) == [{"d": "2024-01-01", "v": 7.0}]

    def test_drops_incomplete(self):
        raw = [{"date": "2024-01-01"}, {"price": 5}, "junk"]
        assert mh._rows(raw) == []


class TestBucket:
    def test_weekly_keeps_last_per_iso_week(self):
        rows = [{"d": "2024-01-01", "v": 1}, {"d": "2024-01-08", "v": 2},
                {"d": "2024-01-09", "v": 3}]
        out = mh._bucket(rows, mh.WK_DAYS, monthly=False)
        # 2024-01-01 = ISO week 1; 01-08 and 01-09 = ISO week 2 -> keep 01-09
        assert [r["d"] for r in out] == ["2024-01-01", "2024-01-09"]

    def test_empty(self):
        assert mh._bucket([], mh.WK_DAYS, monthly=False) == []


class TestBuild:
    def test_price_series(self):
        data = {"CLUSD": [{"date": "2024-01-01", "price": 70},
                          {"date": "2024-01-08", "price": 72},
                          {"date": "2024-01-09", "price": 73}]}
        out = mh.build(data)
        cl = next(s for s in out["series"] if s["key"] == "CLUSD")
        assert cl["name"] == "Oil · WTI"
        assert cl["points"][-1]["c"] == 73
        assert "asof" in out

    def test_fx_inversion(self):
        data = {"EURUSD": [{"date": "2024-01-09", "price": 1.25}]}
        out = mh.build(data)
        eur = next(s for s in out["series"] if s["key"] == "USDEUR")
        assert eur["points"][0]["c"] == 0.8   # 1 / 1.25, USD strength orientation

    def test_skips_missing_sources(self):
        out = mh.build({})
        assert out["series"] == []
