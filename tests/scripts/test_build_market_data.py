"""Tests for scripts/build_market_data.py — FMP quote -> canonical row derivation."""
import build_market_data as bmd


class TestDeriveRow:
    def test_full_quote(self):
        q = {"price": 90, "yearHigh": 120, "yearLow": 80,
             "priceAvg200": 100, "priceAvg50": 95}
        r = bmd.derive_row("AAPL", q)
        assert r["ticker"] == "AAPL"
        assert r["off"] == round(90 / 120 - 1, 6)
        assert r["recover"] == round(120 / 90 - 1, 6)
        assert r["status"] == "Bear"                 # -25% off high
        assert r["signal"] == "Bear (-20% to -50%)"
        assert r["smapct"] == round(90 / 100 - 1, 6)
        assert r["sma50pct"] == round(90 / 95 - 1, 6)
        assert r["cross"] == "Death Cross"           # sma50 (95) < sma200 (100)
        assert r["source"] == "FMP"

    def test_golden_cross_and_normal_status(self):
        q = {"price": 118, "yearHigh": 120, "priceAvg200": 100, "priceAvg50": 110}
        r = bmd.derive_row("MSFT", q)
        assert r["status"] == "Normal"               # <10% off high
        assert r["cross"] == "Golden Cross"          # sma50 (110) >= sma200 (100)

    def test_no_price_returns_none(self):
        assert bmd.derive_row("X", {"yearHigh": 120}) is None


class TestShapeDataRow:
    def test_fund_row_uses_category_and_divyield(self):
        m = {"ticker": "SPY", "price": 470, "high": 480, "off": -0.02, "status": "Normal",
             "signal": "s", "recover": 0.02, "sma": 450, "smapct": 0.04,
             "sma50": 460, "sma50pct": 0.02, "cross": "Golden Cross", "dq": None, "low": 400}
        wr = {"company": "SPDR", "category": "Large Blend", "divyield": 0.013}
        d = bmd.shape_data_row(m, wr, is_fund=True, snap={})
        assert d["category"] == "Large Blend"
        assert "sector" not in d
        assert d["divyield"] == 0.013
        assert d["price"] == 470

    def test_stock_row_uses_sector_and_consensus(self):
        m = {"ticker": "AAPL", "price": 90, "dq": None}
        wr = {"company": "Apple", "sector": "Technology", "consensus": "Buy", "fwdpe": 28.0}
        d = bmd.shape_data_row(m, wr, is_fund=False, snap={})
        assert d["sector"] == "Technology"
        assert d["consensus"] == "Buy"
        assert d["fwdpe"] == 28.0

    def test_snapshot_overrides_workbook(self):
        m = {"ticker": "AAPL", "dq": None}
        wr = {"sector": "Technology", "consensus": "Hold", "fwdpe": 20}
        snap = {"AAPL": {"consensus": "Strong Buy", "fwdpe": 30}}
        d = bmd.shape_data_row(m, wr, is_fund=False, snap=snap)
        assert d["consensus"] == "Strong Buy"
        assert d["fwdpe"] == 30


class TestBuildTab:
    def test_fmp_quote_produces_row_and_stats(self):
        wb_rows = [{"ticker": "AAPL", "price": 100, "high": 120, "sma": 110, "sma50": 105}]
        qmap = {"AAPL": {"symbol": "AAPL", "price": 90, "yearHigh": 120, "yearLow": 80,
                         "priceAvg200": 100, "priceAvg50": 95}}
        built, stats = bmd.build_tab("sp", qmap, wb_rows, None)
        assert len(built) == 1
        assert built[0]["ticker"] == "AAPL"
        assert stats["fmp"] == 1
        assert stats["n"] == 1

    def test_true_gap_when_no_data_anywhere(self):
        wb_rows = [{"ticker": "ZZZ"}]     # no workbook price, no quote, no prior
        built, stats = bmd.build_tab("sp", {}, wb_rows, None)
        assert built[0]["source"] == "none"
        assert stats["gaps"] == ["ZZZ"]
