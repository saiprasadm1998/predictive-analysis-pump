"""Data loading and cleaning for the pump sensor dataset."""
from pathlib import Path
import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "data" / "sensor.csv"
DROP = ["Unnamed: 0", "sensor_15"]  # sensor_15 is entirely empty


def load(path: Path = DATA) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.drop(columns=[c for c in DROP if c in df.columns])
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.set_index("timestamp").sort_index()
    sensors = [c for c in df.columns if c.startswith("sensor_")]
    # short gaps: carry last reading forward; long gaps: fill with the sensor median
    df[sensors] = df[sensors].ffill(limit=30)
    df[sensors] = df[sensors].fillna(df[sensors].median())
    return df


def sensor_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c.startswith("sensor_")]


def failure_times(df: pd.DataFrame) -> list[pd.Timestamp]:
    return list(df.index[df["machine_status"] == "BROKEN"])
