"""Failure fingerprints: compare what the pump looks like now with how it looked before each recorded failure.

A fingerprint is the average whitened deviation from normal in the 5 hours ending 1 hour before a failure.
Whitening removes the correlation between sensors, which is what makes different failures separable: without it,
ordinary healthy drift looks similar to every failure. A failure only counts as 'known' once it has happened,
so replaying history never lets the library see the future.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

H = pd.Timedelta(hours=1)
PROBE = pd.Timedelta(minutes=30)


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


class PatternLibrary:
    def __init__(self, df: pd.DataFrame, model, scores: pd.DataFrame, failures: list[pd.Timestamp],
                 lead_hours: dict[str, float | None] | None = None):
        self.df, self.model, self.sensors = df, model, model.sensors
        self.failures = sorted(failures)
        vals, vecs = np.linalg.eigh(model.cov.precision_)
        self._ph = vecs @ np.diag(np.sqrt(np.clip(vals, 0, None))) @ vecs.T   # precision^(1/2)
        self._loc = model.cov.location_
        self.sigs: list[np.ndarray] = []
        self.fingerprints: list[list[dict]] = []
        for f in self.failures:
            win = df.loc[f - 6 * H: f - H]
            self.sigs.append(self._whiten(win).mean(axis=0))
            raw = (model._z(win) - self._loc).mean(axis=0)
            top = np.argsort(-np.abs(raw))[:4]
            self.fingerprints.append([{"sensor": self.sensors[i], "z": round(float(raw[i]), 2)} for i in top])
        self.lead_hours = lead_hours or {}
        self.possible, self.strong = self._calibrate(scores)

    def _whiten(self, frame: pd.DataFrame) -> np.ndarray:
        return (self.model._z(frame) - self._loc) @ self._ph

    def _calibrate(self, scores: pd.DataFrame) -> tuple[float, float]:
        """Thresholds from false alarms: how well do healthy-but-flagged windows resemble a failure by chance?"""
        ok = (self.df["machine_status"] == "NORMAL").to_numpy().copy()
        for f in self.failures:
            ok &= ~((self.df.index > f - 72 * H) & (self.df.index < f + pd.Timedelta(days=2)))
        idx = scores.index[ok & (scores["ratio"].to_numpy() > 1.0)]
        if len(idx) == 0 or not self.sigs:
            return 0.5, 0.65
        rng = np.random.default_rng(1)
        pick = idx[rng.choice(len(idx), min(300, len(idx)), replace=False)]
        best = [max(_cos(self._whiten(self.df.loc[t - PROBE: t]).mean(axis=0), s) for s in self.sigs) for t in pick]
        p90, p99 = np.percentile(best, [90, 99])
        return float(max(p90, 0.4)), float(max(p99, 0.5))

    def level(self, sim: float) -> str:
        return "strong" if sim >= self.strong else "possible" if sim >= self.possible else "weak"

    def match(self, t: pd.Timestamp) -> dict | None:
        """Closest failure that had already happened by time t, or None if none had."""
        known = [i for i, f in enumerate(self.failures) if f < t]
        if not known:
            return None
        probe = self._whiten(self.df.loc[t - PROBE: t]).mean(axis=0)
        sims = sorted(((_cos(probe, self.sigs[i]), i) for i in known), reverse=True)
        s, i = sims[0]
        return {"failure": str(self.failures[i]), "similarity": round(max(s, 0.0), 3), "level": self.level(s),
                "fingerprint": self.fingerprints[i], "known_failures": len(known)}

    def catalog(self) -> dict:
        rows = []
        for i, f in enumerate(self.failures):
            others = [(max(_cos(self.sigs[i], self.sigs[j]), 0.0), j) for j in range(len(self.failures)) if j != i]
            s, j = max(others) if others else (0.0, None)
            rows.append({"failure": str(f), "lead_hours": self.lead_hours.get(str(f)),
                         "fingerprint": self.fingerprints[i],
                         "most_similar": None if j is None else {"failure": str(self.failures[j]), "similarity": round(s, 3)}})
        return {"thresholds": {"possible": round(self.possible, 3), "strong": round(self.strong, 3)}, "failures": rows}
