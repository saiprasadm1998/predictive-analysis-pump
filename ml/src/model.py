"""Mahalanobis-distance anomaly model (Ledoit-Wolf covariance) with per-sensor attribution."""
from __future__ import annotations
import numpy as np, pandas as pd, joblib
from pathlib import Path
from sklearn.preprocessing import RobustScaler
from sklearn.covariance import LedoitWolf

ART = Path(__file__).resolve().parents[1] / "artifacts"
WINDOW = 30          # minutes of smoothing
QUANTILE = 0.99      # alarm threshold quantile on healthy training data
CLIP = 10.0


class PumpModel:
    def __init__(self, sensors: list[str]):
        self.sensors = sensors
        self.scaler = RobustScaler()
        self.cov = LedoitWolf()
        self.threshold = 1.0
        self.meta: dict = {}

    def _z(self, frame: pd.DataFrame) -> np.ndarray:
        return np.clip(self.scaler.transform(frame[self.sensors]), -CLIP, CLIP)

    def fit(self, healthy: pd.DataFrame, meta: dict | None = None) -> "PumpModel":
        self.scaler.fit(healthy[self.sensors])
        z = self._z(healthy)
        self.cov.fit(z)
        raw = pd.Series(self.cov.mahalanobis(z), index=healthy.index)
        smooth = raw.rolling(WINDOW, min_periods=1).mean()
        self.threshold = float(smooth.quantile(QUANTILE))
        self.meta = meta or {}
        return self

    def score(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Return anomaly distance, ratio to threshold and 0-100 health score per row."""
        z = self._z(frame)
        d = pd.Series(self.cov.mahalanobis(z), index=frame.index)
        d = d.rolling(WINDOW, min_periods=1).mean()
        ratio = d / self.threshold
        health = 100.0 / (1.0 + ratio ** 2)
        return pd.DataFrame({"distance": d, "ratio": ratio, "health": health})

    def contributions(self, frame: pd.DataFrame) -> pd.Series:
        """Per-sensor share of the squared Mahalanobis distance for the mean of `frame`.
        Contributions sum to the total, so they rank which sensors drive an anomaly."""
        z = self._z(frame).mean(axis=0)
        diff = z - self.cov.location_
        contrib = diff * (self.cov.precision_ @ diff)
        return pd.Series(contrib, index=self.sensors).sort_values(ascending=False)

    def save(self, path: Path = ART / "model.joblib"):
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: Path = ART / "model.joblib") -> "PumpModel":
        return joblib.load(path)
