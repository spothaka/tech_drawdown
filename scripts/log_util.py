"""Tech Drawdown — pipeline run logging (Phase 1, logging & debug).
Leveled, structured, persistent run logs for the daily task + build scripts.

Writes under <project>/logs/:
  run_<YYYYMMDD-HHMMSS>.jsonl   full event stream (one JSON object per line)
  latest_run.md                 human-readable report of the most recent run
  runs.jsonl                    append-only, one summary object per run (history)

Programmatic use (inside a Python script):
    from log_util import RunLogger
    rl = RunLogger()                      # opens a new run file
    rl.event("INFO", "build", "FMP fetched", n=915)
    rl.issue("WARN", "macro", "oil gated", symbol="CLUSD")
    rl.finalize("ok", report_md="...", summary={"universe": {...}})

One-liner event hook for pure-transform scripts (no-op unless TDD_RUN_LOG is set):
    from log_util import ev
    ev("INFO", "build", "sources", fmp=904, shist=11, carry=0)

CLI (usable from the daily task / bash):
    python log_util.py start                                   -> prints run_id + path
    python log_util.py event  --run ID --level INFO --step s --msg "..." [--ctx '{...}']
    python log_util.py issue  --run ID --level WARN --step s --msg "..." [--ctx '{...}']
    python log_util.py finalize --run ID --status ok [--report report.md] [--summary '{...}']
    python log_util.py record  --status ok [--report report.md] [--summary '{...}']   # start+finalize in one
    python log_util.py tail   [--n 5]                          # recent run summaries
"""
from __future__ import annotations
import os, sys, json, io, glob, datetime, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("TDD_BASE") or os.path.dirname(HERE)
LOGS = os.path.join(BASE, "logs")

def _int_env(name, default):
    """Parse an int env var, falling back to default on missing/garbage instead of
    raising at import (a crash here would take down every script that imports log_util)."""
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return int(default)

KEEP_RUNS = _int_env("TDD_LOG_KEEP", 30)                 # run_*.jsonl files to retain
KEEP_HIST = 300                                          # runs.jsonl rows to retain
LEVELS = ("DEBUG", "INFO", "WARN", "ERROR")

def _now():
    return datetime.datetime.now().astimezone()

def _ensure():
    os.makedirs(LOGS, exist_ok=True)

def _run_path(run_id):
    return os.path.join(LOGS, "run_%s.jsonl" % run_id)

class RunLogger:
    def __init__(self, run_id=None):
        _ensure()
        n = _now()
        self.run_id = run_id or (n.strftime("%Y%m%d-%H%M%S-") + ("%03d" % (n.microsecond // 1000)))
        self.path = _run_path(self.run_id)
        self.started = n
        self.issues = []
        # marker line so the file exists even for an empty run
        self.event("INFO", "run", "run started", run_id=self.run_id)

    def event(self, level, step, msg, **ctx):
        return self._emit(level, step, msg, ctx, is_issue=False)

    def issue(self, level, step, msg, **ctx):
        rec = self._emit(level, step, msg, ctx, is_issue=True)
        self.issues.append({"level": rec["level"], "step": step, "msg": msg, "ctx": ctx})
        return rec

    def _emit(self, level, step, msg, ctx, is_issue=False):
        level = level.upper()
        if level not in LEVELS:
            level = "INFO"
        rec = {"ts": _now().isoformat(timespec="seconds"), "level": level,
               "step": step, "msg": msg}
        if ctx:
            rec["ctx"] = ctx
        if is_issue:
            rec["issue"] = True        # marker so a separate finalize process can replay issues
        _ensure()
        # default=str keeps a numpy/pandas/datetime value in ctx from aborting the run
        with io.open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
        if level in ("WARN", "ERROR") or os.environ.get("TDD_LOG_ECHO"):
            sys.stderr.write("[%s] %s: %s\n" % (level, step, msg))
        return rec

    @classmethod
    def reopen(cls, run_id):
        """Reconstruct a logger for an existing run by replaying its on-disk event file:
        started-ts from the first record, issues from records flagged issue=True. Used by
        the CLI event/issue/finalize subcommands, which run as separate processes and would
        otherwise start from an empty in-memory state (reporting issues=0 / duration=0)."""
        self = cls.__new__(cls)
        self.run_id = run_id
        self.path = _run_path(run_id)
        self.issues = []
        self.started = _now()
        _ensure()
        if os.path.exists(self.path):
            first_ts = None
            with io.open(self.path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        r = json.loads(line)
                    except ValueError:
                        continue        # tolerate a partial/corrupt line
                    if first_ts is None and r.get("ts"):
                        first_ts = r["ts"]
                    if r.get("issue"):
                        self.issues.append({"level": r.get("level", "INFO"),
                                            "step": r.get("step", ""),
                                            "msg": r.get("msg", ""),
                                            "ctx": r.get("ctx", {})})
            if first_ts:
                try:
                    self.started = datetime.datetime.fromisoformat(first_ts)
                except ValueError:
                    pass
        return self

    def finalize(self, status="ok", report_md=None, summary=None):
        _ensure()
        ended = _now()
        dur = round((ended - self.started).total_seconds(), 1)
        self.event("INFO", "run", "run finished", status=status, duration_s=dur,
                   issues=len(self.issues))
        # latest_run.md (human report)
        md = ["# Tech Drawdown — run %s" % self.run_id,
              "",
              "- **Status:** %s" % status,
              "- **Started:** %s" % self.started.isoformat(timespec="seconds"),
              "- **Ended:** %s  (%.1fs)" % (ended.isoformat(timespec="seconds"), dur),
              "- **Issues:** %d" % len(self.issues),
              "- **Event log:** logs/%s" % os.path.basename(self.path),
              ""]
        if self.issues:
            md.append("## Issues")
            for i in self.issues:
                md.append("- **%s** [%s] %s" % (i["level"], i["step"], i["msg"]))
            md.append("")
        if report_md:
            md.append("## Report")
            md.append(report_md.rstrip())
            md.append("")
        with io.open(os.path.join(LOGS, "latest_run.md"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(md))
        # runs.jsonl (history row)
        row = {"run_id": self.run_id, "started": self.started.isoformat(timespec="seconds"),
               "ended": ended.isoformat(timespec="seconds"), "duration_s": dur,
               "status": status, "issues": len(self.issues)}
        if summary:
            row["summary"] = summary
        with io.open(os.path.join(LOGS, "runs.jsonl"), "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
        _prune()
        return row

def _prune():
    runs = sorted(glob.glob(os.path.join(LOGS, "run_*.jsonl")))
    keep = KEEP_RUNS if KEEP_RUNS > 0 else 0     # clamp: <=0 means keep none (avoids runs[:-0]==runs[:0] no-op / negative-slice bug)
    old = runs if keep == 0 else runs[:-keep]
    for f in old:
        try: os.remove(f)
        except OSError: pass
    hist = os.path.join(LOGS, "runs.jsonl")
    if os.path.exists(hist):
        with io.open(hist, encoding="utf-8") as fh:
            lines = fh.readlines()
        if len(lines) > KEEP_HIST:
            with io.open(hist, "w", encoding="utf-8") as fh:
                fh.writelines(lines[-KEEP_HIST:])

# env-gated one-liner for pure-transform scripts: no-op unless TDD_RUN_LOG points at a run file
def ev(level, step, msg, **ctx):
    p = os.environ.get("TDD_RUN_LOG")
    if not p:
        return
    level = level.upper()
    rec = {"ts": _now().isoformat(timespec="seconds"), "level": level,
           "step": step, "msg": msg}
    if ctx:
        rec["ctx"] = ctx
    try:
        os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
        # default=str keeps a numpy/pandas/datetime ctx value from raising here
        with io.open(p, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
    except (OSError, TypeError, ValueError) as e:
        # don't crash a pure-transform build, but don't lose a WARN/ERROR silently either
        sys.stderr.write("[log_util.ev] dropped %s %s: %s (%s)\n" % (level, step, msg, e))

def _cli():
    ap = argparse.ArgumentParser(prog="log_util.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("start")
    for name in ("event", "issue"):
        p = sub.add_parser(name)
        p.add_argument("--run", required=True); p.add_argument("--level", default="INFO")
        p.add_argument("--step", required=True); p.add_argument("--msg", required=True)
        p.add_argument("--ctx", default=None)
    for name in ("finalize", "record"):
        p = sub.add_parser(name)
        if name == "finalize": p.add_argument("--run", required=True)
        p.add_argument("--status", default="ok"); p.add_argument("--report", default=None)
        p.add_argument("--summary", default=None)
    pt = sub.add_parser("tail"); pt.add_argument("--n", type=int, default=5)
    a = ap.parse_args()

    def _load(v):
        if not v: return None
        if os.path.exists(v):
            with io.open(v, encoding="utf-8") as fh:
                return fh.read()
        return v

    if a.cmd == "start":
        rl = RunLogger(); print(rl.run_id); print(rl.path)
    elif a.cmd in ("event", "issue"):
        rl = RunLogger.reopen(a.run)
        ctx = json.loads(a.ctx) if a.ctx else {}
        (rl.issue if a.cmd == "issue" else rl.event)(a.level, a.step, a.msg, **ctx)
    elif a.cmd == "finalize":
        rl = RunLogger.reopen(a.run)     # replays started-ts + logged issues from the run file
        summary = json.loads(a.summary) if a.summary else None
        print(json.dumps(rl.finalize(a.status, _load(a.report), summary)))
    elif a.cmd == "record":
        rl = RunLogger()
        summary = json.loads(a.summary) if a.summary else None
        print(json.dumps(rl.finalize(a.status, _load(a.report), summary)))
    elif a.cmd == "tail":
        hist = os.path.join(LOGS, "runs.jsonl")
        if not os.path.exists(hist): print("(no runs yet)"); return
        with io.open(hist, encoding="utf-8") as fh:
            rows = fh.readlines()[-a.n:]
        for r in rows:
            try:
                d = json.loads(r)
            except ValueError:
                continue     # skip a partial/corrupt history line rather than aborting
            print("%s  %-5s  %.1fs  issues=%d" % (
                d.get("run_id", "?"), d.get("status", "?"),
                d.get("duration_s", 0), d.get("issues", 0)))

if __name__ == "__main__":
    _cli()
