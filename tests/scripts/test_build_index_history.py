"""Tests for scripts/build_index_history.py — index history weekly downsample."""
import datetime
import json

import build_index_history as ih


class TestWeekly:
    def test_keeps_last_per_iso_week(self):
        pts = [{"d": "2024-01-01", "c": 1}, {"d": "2024-01-08", "c": 2},
               {"d": "2024-01-09", "c": 3}]
        out = ih.weekly(pts)
        assert [p["d"] for p in out] == ["2024-01-01", "2024-01-09"]

    def test_sorted_output(self):
        pts = [{"d": "2024-02-05", "c": 2}, {"d": "2024-01-01", "c": 1}]
        out = ih.weekly(pts)
        assert [p["d"] for p in out] == ["2024-01-01", "2024-02-05"]


class TestSeries:
    def test_reads_symbol_and_points(self, tmp_path):
        arr = [{"symbol": "^GSPC", "date": "2024-01-08", "price": 4700.5},
               {"symbol": "^GSPC", "date": "2024-01-09", "price": 4710.25}]
        p = tmp_path / "gspc.json"
        p.write_text(json.dumps(arr), encoding="utf-8")
        sym, pts = ih.series(str(p))
        assert sym == "^GSPC"
        assert pts[-1]["c"] == 4710.25    # rounded to 2dp, last of ISO week

    def test_filters_by_horizon(self, tmp_path):
        recent = "2024-01-09"
        old = (datetime.date.fromisoformat(recent) - datetime.timedelta(days=ih.DAYS + 30)).isoformat()
        arr = [{"symbol": "^DJI", "date": old, "price": 100},
               {"symbol": "^DJI", "date": recent, "price": 200}]
        p = tmp_path / "dji.json"
        p.write_text(json.dumps(arr), encoding="utf-8")
        sym, pts = ih.series(str(p))
        assert sym == "^DJI"
        assert [pt["d"] for pt in pts] == [recent]   # the old point is dropped

    def test_skips_rows_without_price(self, tmp_path):
        arr = [{"symbol": "SPY", "date": "2024-01-09"},
               {"symbol": "SPY", "date": "2024-01-10", "price": 470}]
        p = tmp_path / "spy.json"
        p.write_text(json.dumps(arr), encoding="utf-8")
        _, pts = ih.series(str(p))
        assert [pt["c"] for pt in pts] == [470]
