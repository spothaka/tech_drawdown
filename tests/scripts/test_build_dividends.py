"""Tests for scripts/build_dividends.py — forward dividend calendar helpers."""
import datetime

import build_dividends as bd


class TestPerYear:
    def test_known_frequencies(self):
        assert bd.per_year("Monthly") == 12
        assert bd.per_year("Semi-Annual") == 2
        assert bd.per_year("Annual") == 1
        assert bd.per_year("Yearly") == 1
        assert bd.per_year("Quarterly") == 4

    def test_default_is_quarterly(self):
        assert bd.per_year("") == 4
        assert bd.per_year(None) == 4
        assert bd.per_year("whatever") == 4


class TestDateParse:
    def test_iso_and_datetime(self):
        assert bd.d("2024-01-15") == datetime.date(2024, 1, 15)
        assert bd.d("2024-01-15T00:00:00") == datetime.date(2024, 1, 15)

    def test_bad_values(self):
        assert bd.d("nonsense") is None
        assert bd.d(None) is None


class TestAddMonth:
    def test_within_year(self):
        assert bd.add_month(datetime.date(2024, 1, 1), 0) == datetime.date(2024, 1, 1)
        assert bd.add_month(datetime.date(2024, 1, 1), 11) == datetime.date(2024, 12, 1)

    def test_rolls_over_year(self):
        assert bd.add_month(datetime.date(2024, 1, 1), 12) == datetime.date(2025, 1, 1)
        assert bd.add_month(datetime.date(2024, 11, 1), 3) == datetime.date(2025, 2, 1)


class TestDivyieldMap:
    def test_collects_from_all_tabs(self):
        D = {
            "etfs": [{"ticker": "SPY", "divyield": 0.013}],
            "sp": [{"ticker": "AAPL", "divyield": 0.005}, {"ticker": "NODIV"}],
        }
        y = bd.divyield_map(D)
        assert y == {"SPY": 0.013, "AAPL": 0.005}

    def test_ignores_none_yield(self):
        D = {"sp": [{"ticker": "X", "divyield": None}]}
        assert bd.divyield_map(D) == {}


class TestHoldings:
    def test_labels_accounts_and_coerces_numbers(self):
        D = {
            "ira": [{"ticker": "AAPL", "type": "Equity/ETF", "qty": "10", "value": "1500"}],
            "brokerage": [{"ticker": "MSFT", "qty": 5, "value": 2000}],
        }
        holds = bd.holdings(D)
        assert {h["ticker"]: h["account"] for h in holds} == {"AAPL": "ira", "MSFT": "brokerage"}
        aapl = next(h for h in holds if h["ticker"] == "AAPL")
        assert aapl["qty"] == 10.0 and aapl["value"] == 1500.0

    def test_skips_cash_and_cd(self):
        D = {"ira": [{"ticker": "CASH", "type": "Cash", "qty": 1, "value": 100},
                     {"ticker": "CD1", "type": "CD", "qty": 1, "value": 100},
                     {"ticker": "AAPL", "type": "Equity/ETF", "qty": 1, "value": 100}]}
        holds = bd.holdings(D)
        assert [h["ticker"] for h in holds] == ["AAPL"]
