"""Tests for scripts/build_history.py — portfolio value history append + parse."""
import json

import build_history as bh


class TestAppend:
    def test_append_creates_record(self, tmp_path, monkeypatch):
        monkeypatch.setattr(bh, "HIST", str(tmp_path / "history.json"))
        rec, rows = bh.append("2024-01-01", 100.0, 200.0)
        assert rec == {"date": "2024-01-01", "total": 300.0, "ira": 100.0, "brokerage": 200.0}
        assert rows == [rec]

    def test_append_is_idempotent_per_date(self, tmp_path, monkeypatch):
        monkeypatch.setattr(bh, "HIST", str(tmp_path / "history.json"))
        bh.append("2024-01-01", 100.0, 200.0)
        _, rows = bh.append("2024-01-01", 150.0, 250.0)   # same date overwrites
        assert len(rows) == 1
        assert rows[0]["total"] == 400.0

    def test_append_sorts_by_date(self, tmp_path, monkeypatch):
        monkeypatch.setattr(bh, "HIST", str(tmp_path / "history.json"))
        bh.append("2024-03-01", 1, 1)
        bh.append("2024-01-01", 1, 1)
        _, rows = bh.append("2024-02-01", 1, 1)
        assert [r["date"] for r in rows] == ["2024-01-01", "2024-02-01", "2024-03-01"]

    def test_append_caps_at_max_points(self, tmp_path, monkeypatch):
        monkeypatch.setattr(bh, "HIST", str(tmp_path / "history.json"))
        monkeypatch.setattr(bh, "MAX_POINTS", 3)
        for day in range(1, 6):
            _, rows = bh.append("2024-01-%02d" % day, day, 0)
        assert len(rows) == 3
        assert [r["date"] for r in rows] == ["2024-01-03", "2024-01-04", "2024-01-05"]


class TestTotalsFromDashboard:
    def test_parses_embedded_data(self, tmp_path):
        html = (
            "<html><script>\n"
            'const DATA = {"ira":[{"value":100},{"value":50}],'
            '"brokerage":[{"value":25.5}]};\n'
            "</script></html>"
        )
        p = tmp_path / "dash.html"
        p.write_text(html, encoding="utf-8")
        ira, bk = bh.totals_from_dashboard(str(p))
        assert ira == 150.0
        assert bk == 25.5

    def test_ignores_missing_values(self, tmp_path):
        html = 'x const DATA = {"ira":[{"value":null},{"foo":1}],"brokerage":[]}; y'
        p = tmp_path / "dash.html"
        p.write_text(html, encoding="utf-8")
        ira, bk = bh.totals_from_dashboard(str(p))
        assert ira == 0.0 and bk == 0.0
