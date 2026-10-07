"""FastAPI scoring service: serves health scores, readings, explanations and evaluation."""
from __future__ import annotations
import json, sys
from pathlib import Path
import pandas as pd
from fastapi import FastAPI, HTTPException, Query

sys.path.insert(0, str(Path(__file__).parent))
from features import load, sensor_cols
from model import PumpModel, ART

app = FastAPI(title="Pump Guardian ML service")
STATE: dict = {}


@app.on_event("startup")
def startup():
    df = load()
    model = PumpModel.load()
    scores = pd.read_parquet(ART / "scores.parquet")
    above = (scores["ratio"] > 1.0).astype(int)
    below = (scores["ratio"] < 0.8).astype(int)
    # consecutive minutes currently above / below threshold (persistence), used for alerting
    scores["run_above"] = above.groupby((above == 0).cumsum()).cumsum()
    scores["run_below"] = below.groupby((below == 0).cumsum()).cumsum()
    STATE.update(df=df, model=model, sensors=sensor_cols(df),
                 scores=scores,
                 evaluation=json.loads((ART / "evaluation.json").read_text()))


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
            "threshold": m.threshold, "evaluation": STATE["evaluation"]}


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
            "run_above": int(row.run_above), "run_below": int(row.run_below)}


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
