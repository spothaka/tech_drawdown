"""Tests for scripts/build_lookthrough.py — fund look-through decomposition."""
import build_lookthrough as lt


def _rows():
    return [
        {"weightPercentage": 10.0, "asset": "AAPL", "name": "Apple", "updatedAt": "2024-01-01T00:00:00"},
        {"weightPercentage": 5.0, "asset": "", "name": "Cash & Other"},   # empty asset -> cash bucket
        {"weightPercentage": 8.0, "asset": "MSFT", "name": "Microsoft"},
        {"weightPercentage": "bad", "asset": "IBM", "name": "IBM"},        # non-numeric weight -> skipped
    ]


class TestBuild:
    def test_decomposition(self):
        f = lt.build("QQQ", _rows())
        assert f["n"] == 2                       # AAPL, MSFT (IBM skipped)
        assert [h["sym"] for h in f["top"]] == ["AAPL", "MSFT"]   # sorted by weight desc
        assert f["topW"] == 18.0
        assert f["residualW"] == 0.0             # nothing beyond top-50
        assert f["cashW"] == 5.0
        assert f["disclosedW"] == 23.0           # equity + cash
        assert f["asOf"] == "2024-01-01"
        assert f["synthetic"] is False

    def test_synthetic_flag(self):
        f = lt.build("JEPI", _rows(), synthetic=True)
        assert f["synthetic"] is True

    def test_residual_when_over_topn(self):
        rows = [{"weightPercentage": float(i + 1), "asset": "S%d" % i, "name": "n"}
                for i in range(lt.TOPN + 5)]
        f = lt.build("BIG", rows)
        assert len(f["top"]) == lt.TOPN
        assert f["residualW"] > 0                 # long tail preserved, never dropped

    def test_no_equity_returns_none(self):
        assert lt.build("X", [{"weightPercentage": 100.0, "asset": ""}]) is None
