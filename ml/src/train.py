"""Train the model on healthy data, evaluate lead time before each failure, precompute scores."""
import json, sys
import numpy as np, pandas as pd
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from features import load, sensor_cols, failure_times
from model import PumpModel, ART
from evaluation import LOOKBACK_H, PERSIST_MIN, evaluate, healthy_mask


def train(include=None, exclude=None, quiet=False, df=None):
    """Fit the model and write artifacts. `include` / `exclude` are lists of (start, end) windows from operator
    verdicts: false alarms are added to the healthy training data, real issues are removed from it."""
    df = load() if df is None else df
    ft = failure_times(df)
    S = sensor_cols(df)
    ok = healthy_mask(df, ft, include, exclude)
    train_df = df[ok].iloc[::5]
    model = PumpModel(S).fit(train_df, meta={"train_rows": int(len(train_df)),
                                             "trained_from": str(df.index[0]), "trained_to": str(df.index[-1]),
                                             "windows_included": len(include or []), "windows_excluded": len(exclude or [])})
    model.save()
    scores = model.score(df)
    scores["status"] = df["machine_status"]
    scores.to_parquet(ART / "scores.parquet")

    summary = evaluate(scores["ratio"], df, ft, 1.0)
    for r in summary["failures"]:   # what drove each failure, for the dashboard
        f = pd.Timestamp(r["failure"])
        c = model.contributions(df.loc[f - pd.Timedelta(hours=1): f])
        tot = max(float(c.sum()), 1e-9)
        r["top_sensors"] = [{"sensor": k, "share": round(float(v / tot), 3)} for k, v in c.head(5).items()]
    summary.update(threshold=model.threshold, lookback_hours=LOOKBACK_H, persistence_minutes=PERSIST_MIN)
    (ART / "evaluation.json").write_text(json.dumps(summary, indent=2))
    if not quiet:
        print(json.dumps(summary, indent=2))
    return model, scores, summary


def main():
    train()


if __name__ == "__main__":
    main()
