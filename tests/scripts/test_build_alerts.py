"""Tests for scripts/build_alerts.py — status/cross/low transition alerts."""
import build_alerts as ba


class TestHeld:
    def test_union_and_dedupe_preserving_order(self):
        D = {
            "ira": [{"ticker": "AAPL", "type": "Equity/ETF"},
                    {"ticker": "CASH", "type": "Cash"}],
            "brokerage": [{"ticker": "MSFT"}, {"ticker": "AAPL"}],
        }
        assert ba._held(D) == ["AAPL", "MSFT"]


class TestAccount:
    def test_resolution(self):
        D = {"ira": [{"ticker": "AAPL"}], "brokerage": [{"ticker": "MSFT"}, {"ticker": "AAPL"}]}
        assert ba._account(D, "AAPL") == "Both"
        assert ba._account(D, "MSFT") == "Brokerage"
        assert ba._account({"ira": [{"ticker": "AAPL"}], "brokerage": []}, "AAPL") == "IRA"


class TestPctOff:
    def test_none(self):
        assert ba._pctoff(None) == "—"

    def test_sign_and_rounding(self):
        assert ba._pctoff(-0.153) == "−15% off high"   # U+2212 minus
        assert ba._pctoff(0.05) == "+5% off high"


class TestWithin:
    def test_in_and_out_of_window(self):
        assert ba._within("2024-01-01", "2024-01-10", 14) is True
        assert ba._within("2024-01-01", "2024-02-01", 14) is False

    def test_future_event_is_out(self):
        assert ba._within("2024-01-20", "2024-01-10", 14) is False

    def test_bad_date_defaults_true(self):
        assert ba._within("garbage", "2024-01-10", 14) is True


class TestTransitions:
    def test_worsening_bear_deathcross_and_new_low(self):
        prev = {"status": "Normal", "off": -0.05, "cross": "Golden Cross", "low": 100, "price": 90}
        cur = {"status": "Bear", "off": -0.25, "cross": "Death Cross", "low": 80, "price": 70}
        evs = ba._transitions(prev, cur, "2024-01-10", "AAPL", "IRA")
        kinds = {e["kind"] for e in evs}
        assert kinds == {"bear", "death", "low52"}
        for e in evs:
            assert e["date"] == "2024-01-10"
            assert e["ticker"] == "AAPL"
            assert e["account"] == "IRA"
            assert e["to"]["status"] == "Bear"

    def test_recovery_event(self):
        prev = {"status": "Bear", "off": -0.25, "cross": "Death Cross", "low": 80}
        cur = {"status": "Normal", "off": -0.02, "cross": "Death Cross", "low": 80}
        evs = ba._transitions(prev, cur, "2024-01-10", "AAPL", "IRA")
        assert [e["kind"] for e in evs] == ["recover"]

    def test_no_change_no_events(self):
        snap = {"status": "Normal", "off": -0.01, "cross": "Golden Cross", "low": 100}
        assert ba._transitions(snap, dict(snap), "2024-01-10", "AAPL", "IRA") == []


class TestBuildMap:
    def test_primary_by_priority_and_history(self):
        store = [
            {"ticker": "AAPL", "date": "2024-01-05", "kind": "correction", "sev": "warn",
             "label": "entered Correction", "text": "t1", "from": {}, "to": {}, "cross": None},
            {"ticker": "AAPL", "date": "2024-01-08", "kind": "bear", "sev": "warn",
             "label": "entered Bear", "text": "t2", "from": {}, "to": {}, "cross": None},
        ]
        out = ba.build_map(store, "2024-01-10")
        assert out["AAPL"]["kind"] == "bear"      # bear outranks correction
        assert [h["date"] for h in out["AAPL"]["history"]] == ["2024-01-08", "2024-01-05"]

    def test_events_outside_window_dropped(self):
        store = [
            {"ticker": "AAPL", "date": "2020-01-01", "kind": "bear", "sev": "warn",
             "label": "old", "text": "t", "from": {}, "to": {}, "cross": None},
        ]
        assert ba.build_map(store, "2024-01-10") == {}
