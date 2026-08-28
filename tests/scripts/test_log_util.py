"""Tests for scripts/log_util.py — structured run logging."""
import io
import json
import os

import log_util


def _read_jsonl(path):
    with io.open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


class TestRunLogger:
    def test_new_run_writes_marker(self, tmp_path, monkeypatch):
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        rl = log_util.RunLogger(run_id="test-run")
        recs = _read_jsonl(rl.path)
        assert recs[0]["step"] == "run"
        assert recs[0]["msg"] == "run started"
        assert recs[0]["ctx"]["run_id"] == "test-run"

    def test_event_levels_and_ctx(self, tmp_path, monkeypatch):
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        rl = log_util.RunLogger(run_id="lvl")
        rec = rl.event("bogus", "build", "hi", n=5)
        assert rec["level"] == "INFO"        # unknown level normalized to INFO
        assert rec["ctx"] == {"n": 5}
        rec2 = rl.event("warn", "x", "y")
        assert rec2["level"] == "WARN"

    def test_issue_is_tracked(self, tmp_path, monkeypatch):
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        rl = log_util.RunLogger(run_id="iss")
        rl.issue("ERROR", "guard", "bad cell", ticker="ZZZ")
        assert len(rl.issues) == 1
        assert rl.issues[0]["level"] == "ERROR"

    def test_finalize_writes_report_and_history(self, tmp_path, monkeypatch):
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        rl = log_util.RunLogger(run_id="fin")
        rl.issue("WARN", "macro", "oil gated")
        row = rl.finalize("ok", report_md="all good", summary={"universe": 915})
        assert row["status"] == "ok"
        assert row["issues"] == 1
        assert row["summary"] == {"universe": 915}

        md = (tmp_path / "latest_run.md").read_text(encoding="utf-8")
        assert "**Status:** ok" in md
        assert "oil gated" in md
        assert "all good" in md

        hist = _read_jsonl(str(tmp_path / "runs.jsonl"))
        assert hist[-1]["run_id"] == "fin"


class TestEv:
    def test_noop_without_env(self, tmp_path, monkeypatch):
        monkeypatch.delenv("TDD_RUN_LOG", raising=False)
        assert log_util.ev("INFO", "build", "x") is None

    def test_writes_when_env_set(self, tmp_path, monkeypatch):
        target = tmp_path / "run.jsonl"
        monkeypatch.setenv("TDD_RUN_LOG", str(target))
        log_util.ev("INFO", "build", "sources", fmp=904)
        recs = _read_jsonl(str(target))
        assert recs[0]["msg"] == "sources"
        assert recs[0]["ctx"] == {"fmp": 904}


class TestPrune:
    def test_prunes_old_run_files(self, tmp_path, monkeypatch):
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        monkeypatch.setattr(log_util, "KEEP_RUNS", 2)
        for i in range(5):
            (tmp_path / ("run_2024010%d-000000.jsonl" % i)).write_text("{}", encoding="utf-8")
        log_util._prune()
        remaining = sorted(p.name for p in tmp_path.glob("run_*.jsonl"))
        assert remaining == ["run_20240103-000000.jsonl", "run_20240104-000000.jsonl"]

    def test_keep_zero_deletes_all(self, tmp_path, monkeypatch):
        # regression: runs[:-0] == runs[:0] used to keep everything for KEEP_RUNS<=0
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        monkeypatch.setattr(log_util, "KEEP_RUNS", 0)
        for i in range(3):
            (tmp_path / ("run_2024010%d-000000.jsonl" % i)).write_text("{}", encoding="utf-8")
        log_util._prune()
        assert list(tmp_path.glob("run_*.jsonl")) == []


class TestReopen:
    def test_reopen_restores_issues_and_started(self, tmp_path, monkeypatch):
        # regression: CLI finalize ran in a fresh process and reported issues=0 / duration~0
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        rl = log_util.RunLogger(run_id="rr")
        rl.issue("ERROR", "guard", "bad cell", ticker="ZZZ")
        rl.event("INFO", "build", "did work")

        reborn = log_util.RunLogger.reopen("rr")
        assert len(reborn.issues) == 1
        assert reborn.issues[0]["level"] == "ERROR"
        assert reborn.issues[0]["msg"] == "bad cell"
        # started-ts replayed from the "run started" marker (seconds precision), not set to now()
        assert reborn.started == rl.started.replace(microsecond=0)

    def test_reopen_finalize_records_issues(self, tmp_path, monkeypatch):
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        log_util.RunLogger(run_id="rf").issue("WARN", "macro", "oil gated")
        row = log_util.RunLogger.reopen("rf").finalize("ok")
        assert row["issues"] == 1
        md = (tmp_path / "latest_run.md").read_text(encoding="utf-8")
        assert "oil gated" in md

    def test_reopen_tolerates_corrupt_line(self, tmp_path, monkeypatch):
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        rl = log_util.RunLogger(run_id="rc")
        with io.open(rl.path, "a", encoding="utf-8") as fh:
            fh.write("{not valid json\n")
        rl.issue("ERROR", "x", "still counted")
        reborn = log_util.RunLogger.reopen("rc")
        assert len(reborn.issues) == 1


class TestSerializationGuard:
    def test_event_survives_non_json_ctx(self, tmp_path, monkeypatch):
        # regression: json.dumps on a set/datetime used to raise TypeError and abort the run
        monkeypatch.setattr(log_util, "LOGS", str(tmp_path))
        rl = log_util.RunLogger(run_id="ser")
        rl.event("INFO", "build", "sources", weird={1, 2, 3})   # a set is not JSON-serializable
        recs = _read_jsonl(rl.path)
        assert recs[-1]["msg"] == "sources"

    def test_ev_survives_non_json_ctx(self, tmp_path, monkeypatch):
        target = tmp_path / "run.jsonl"
        monkeypatch.setenv("TDD_RUN_LOG", str(target))
        log_util.ev("WARN", "build", "gaps", tickers={"AAA", "BBB"})
        recs = _read_jsonl(str(target))
        assert recs[-1]["msg"] == "gaps"


class TestEnvParse:
    def test_int_env_falls_back_on_garbage(self, monkeypatch):
        monkeypatch.setenv("TDD_LOG_KEEP", "30d")
        assert log_util._int_env("TDD_LOG_KEEP", 30) == 30
        monkeypatch.delenv("TDD_LOG_KEEP", raising=False)
        assert log_util._int_env("TDD_LOG_KEEP", 30) == 30
