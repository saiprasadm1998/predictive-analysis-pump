"""Replay the recorded history at a given alarm level: which failures would have been caught, and how many false alarms."""
from __future__ import annotations
import numpy as np
import pandas as pd

LOOKBACK_H = 72
PERSIST_MIN = 30


def runs(ratio: pd.Series, level: float) -> tuple[pd.Series, pd.Series]:
    """Consecutive minutes above the alarm level, and below 0.8x of it (the live alerting rule)."""
    above = (ratio > level).astype(int)
    below = (ratio < 0.8 * level).astype(int)
    return (above.groupby((above == 0).cumsum()).cumsum(),
            below.groupby((below == 0).cumsum()).cumsum())


def healthy_mask(df: pd.DataFrame, failures: list[pd.Timestamp], include: list | None = None,
                 exclude: list | None = None) -> pd.Series:
    """Rows treated as healthy for training: NORMAL, away from failures. Operator verdicts adjust it:
    windows marked false alarm are added back in, windows marked real issue are removed."""
    ok = df["machine_status"] == "NORMAL"
    for f in failures:
        ok &= ~((df.index > f - pd.Timedelta(days=4)) & (df.index < f + pd.Timedelta(days=2)))
    for s, e in include or []:
        ok |= (df.index >= pd.Timestamp(s)) & (df.index <= pd.Timestamp(e)) & (df["machine_status"] == "NORMAL")
    for s, e in exclude or []:
        ok &= ~((df.index >= pd.Timestamp(s)) & (df.index <= pd.Timestamp(e)))
    return ok


def evaluate(ratio: pd.Series, df: pd.DataFrame, failures: list[pd.Timestamp], level: float = 1.0) -> dict:
    """Failures caught (an alert would have opened within the look-back) and false alert episodes at `level`.
    Measured on the same history the model learned from, so optimistic."""
    run_above, _ = runs(ratio, level)
    results = []
    for f in failures:
        w = ratio.loc[f - pd.Timedelta(hours=LOOKBACK_H): f]
        a = w[run_above.loc[w.index] >= PERSIST_MIN]
        lead = None if a.empty else round((f - a.index[0]).total_seconds() / 3600, 1)
        results.append({"failure": str(f), "lead_hours": lead})
    base = healthy_mask(df, failures)    # fixed definition, so runs stay comparable after retraining
    mask = base.copy()
    for f in failures:   # alerts around failures are expected, not false
        mask &= ~((df.index > f - pd.Timedelta(hours=LOOKBACK_H)) & (df.index < f + pd.Timedelta(days=2)))
    healthy = base.to_numpy()
    episodes = int(((run_above == PERSIST_MIN) & mask).sum())
    leads = [r["lead_hours"] for r in results if r["lead_hours"] is not None]
    return {"level": round(float(level), 3), "failures_total": len(results), "failures_detected": len(leads),
            "failures": results, "healthy_false_alarm_episodes": episodes,
            "healthy_alarm_rate": round(float((ratio[healthy] > level).mean()), 4),
            "lead_min": min(leads) if leads else None, "lead_max": max(leads) if leads else None}


CURVE_LEVELS = [0.6, 0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]
