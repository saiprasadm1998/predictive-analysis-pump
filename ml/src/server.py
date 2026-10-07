"""FastAPI scoring service: serves health scores, readings, explanations and evaluation."""
from __future__ import annotations
import json, sys, threading
from pathlib import Path
import pandas as pd
from fastapi import FastAPI, HTTPException, Query

sys.path.insert(0, str(Path(__file__).parent))
from features import load, sensor_cols
from model import PumpModel, ART
from patterns import PatternLibrary
from evaluation import CURVE_LEVELS, LOOKBACK_H, PERSIST_MIN, evaluate, runs
from pydantic import BaseModel, Field
from features import failure_times

app = FastAPI(title="Pump Guardian ML service")
STATE: dict = {}


SETTINGS = ART / "settings.json"
LEVEL_MIN, LEVEL_MAX = 0.3, 5.0
LOCK = threading.Lock()


def _saved_level() -> float:
    try:
        return float(json.loads(SETTINGS.read_text())["level"])
    except Exception:
        return 1.0


def load_state(level: float | None = None) -> None:
    """(Re)build everything the API serves from the saved model. The alarm level rescales the anomaly ratio, so
    health, status, alerts and the chart's alarm line all follow it without any other code knowing."""
    level = _saved_level() if level is None else level
    df = STATE.get("df")
    if df is None:   # the recorded history never changes, so read the 124 MB CSV once
        df = load()
    model = PumpModel.load()
    raw = pd.read_parquet(ART / "scores.parquet")
    ft = failure_times(df)
    scores = raw.copy()
    scores["raw_ratio"] = raw["ratio"]
    scores["ratio"] = raw["ratio"] / level
    scores["health"] = 100.0 / (1.0 + scores["ratio"] ** 2)
    scores["run_above"], scores["run_below"] = runs(scores["raw_ratio"], level)
    ev = evaluate(raw["ratio"], df, ft, level)
    saved = json.loads((ART / "evaluation.json").read_text())
    tops = {f["failure"]: f.get("top_sensors", []) for f in saved["failures"]}
    for f in ev["failures"]:
        f["top_sensors"] = tops.get(f["failure"], [])
    ev.update(threshold=model.threshold, lookback_hours=LOOKBACK_H, persistence_minutes=PERSIST_MIN)
    leads = {f["failure"]: f["lead_hours"] for f in ev["failures"]}
    STATE.update(df=df, model=model, sensors=sensor_cols(df), scores=scores, raw_ratio=raw["ratio"], failures=ft,
                 level=level, evaluation=ev, curve=None)
    STATE["patterns"] = PatternLibrary(df, model, scores, ft, leads)


@app.on_event("startup")
def startup():
    load_state()


def _ts(value: str) -> pd.Timestamp:
    try:
        return pd.Timestamp(value)
    except Exception:
        raise HTTPException(400, f"bad timestamp: {value}")


@app.get("/health")
def health():
    return {"ok": True, "rows": len(STATE["df"])}


@app.get("/meta")
def meta():
    df, m = STATE["df"], STATE["model"]
    return {"sensors": STATE["sensors"], "start": str(df.index[0]), "end": str(df.index[-1]),
            "threshold": m.threshold, "level": STATE["level"], "train": m.meta, "evaluation": STATE["evaluation"]}


@app.get("/scores")
def scores(start: str, end: str, step: int = Query(60, ge=1, le=1440)):
    """Health series between two timestamps, downsampled to every `step` minutes (min health per bucket)."""
    s = STATE["scores"].loc[_ts(start):_ts(end)]
    if s.empty:
        return []
    out = s.resample(f"{step}min").agg({"health": "min", "ratio": "max", "status": "last"}).dropna()
    return [{"t": str(i), "health": round(r.health, 1), "ratio": round(r.ratio, 3), "status": r.status}
            for i, r in out.iterrows()]


@app.get("/readings")
def readings(start: str, end: str, sensors: str, step: int = Query(15, ge=1, le=1440)):
    cols = [c for c in sensors.split(",") if c in STATE["sensors"]]
    if not cols:
        raise HTTPException(400, "no valid sensors")
    d = STATE["df"].loc[_ts(start):_ts(end), cols].resample(f"{step}min").mean().dropna(how="all")
    return {"t": [str(i) for i in d.index], **{c: [round(v, 4) for v in d[c]] for c in cols}}


@app.get("/at")
def at(t: str):
    """Current state of the pump at a timestamp: health, status, and top driving sensors."""
    ts = _ts(t)
    sc = STATE["scores"]
    if ts < sc.index[0] or ts > sc.index[-1]:
        raise HTTPException(404, "outside data range")
    row = sc.loc[:ts].iloc[-1]
    win = STATE["df"].loc[ts - pd.Timedelta(minutes=30):ts]
    c = STATE["model"].contributions(win)
    total = float(c.clip(lower=0).sum()) or 1.0
    top = [{"sensor": k, "share": round(float(max(v, 0)) / total, 3)} for k, v in c.head(6).items()]
    status = "critical" if row.ratio > 2 else "warning" if row.ratio > 1 else "watch" if row.ratio > 0.7 else "healthy"
    return {"t": str(sc.loc[:ts].index[-1]), "health": round(float(row.health), 1),
            "ratio": round(float(row.ratio), 3), "state": status,
            "label": row.status, "top_sensors": top,
            "run_above": int(row.run_above), "run_below": int(row.run_below),
            "match": STATE["patterns"].match(ts) if row.ratio > 1 else None}


@app.get("/alerts")
def alerts(min_gap_hours: int = 6):
    """Alert episodes: contiguous stretches where the anomaly ratio exceeded 1."""
    sc = STATE["scores"]
    hit = sc[sc.ratio > 1.0]
    if hit.empty:
        return []
    gaps = hit.index.to_series().diff() > pd.Timedelta(hours=min_gap_hours)
    ep = gaps.cumsum()
    out = []
    for _, g in hit.groupby(ep.values):
        out.append({"start": str(g.index[0]), "end": str(g.index[-1]),
                    "peak_ratio": round(float(g.ratio.max()), 2),
                    "minutes": int(len(g)),
                    "severity": "critical" if g.ratio.max() > 2 else "warning"})
    return out


@app.get("/failures")
def failures():
    """Catalogue of recorded failures: fingerprints, lead times and how alike they are."""
    return STATE["patterns"].catalog()


@app.get("/sensitivity/preview")
def preview(level: float = Query(..., ge=LEVEL_MIN, le=LEVEL_MAX)):
    """What the recorded history would have looked like at this alarm level (nothing is changed)."""
    ev = evaluate(STATE["raw_ratio"], STATE["df"], STATE["failures"], level)
    return {k: v for k, v in ev.items() if k != "failures"} | {
        "failures": [{"failure": f["failure"], "lead_hours": f["lead_hours"]} for f in ev["failures"]]}


@app.get("/sensitivity/curve")
def curve():
    """Missed failures and false alarms across a range of alarm levels, for choosing one."""
    if STATE.get("curve") is None:
        rows = []
        for lv in CURVE_LEVELS:
            ev = evaluate(STATE["raw_ratio"], STATE["df"], STATE["failures"], lv)
            rows.append({"level": lv, "failures_detected": ev["failures_detected"], "failures_total": ev["failures_total"],
                         "false_alarm_episodes": ev["healthy_false_alarm_episodes"]})
        STATE["curve"] = rows
    return STATE["curve"]


class Sensitivity(BaseModel):
    level: float = Field(ge=LEVEL_MIN, le=LEVEL_MAX)


@app.post("/sensitivity")
def apply_sensitivity(body: Sensitivity):
    with LOCK:
        SETTINGS.write_text(json.dumps({"level": body.level}))
        load_state(body.level)
    return meta()


Window = tuple[str, str]


class Retrain(BaseModel):
    include: list[Window] = Field(default_factory=list, max_length=500)
    exclude: list[Window] = Field(default_factory=list, max_length=500)


@app.post("/retrain")
def retrain(body: Retrain):
    """Refit on the healthy data, adjusted by operator verdicts, then reload. Keeps the chosen alarm level."""
    from train import train
    before = STATE["evaluation"]
    with LOCK:
        train(body.include, body.exclude, quiet=True, df=STATE["df"])
        load_state()
    return {"before": {k: before[k] for k in ("threshold", "failures_detected", "failures_total", "healthy_false_alarm_episodes")},
            "meta": meta()}
