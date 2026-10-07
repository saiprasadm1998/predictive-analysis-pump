"""Train the model on healthy data, evaluate lead time before each failure, precompute scores."""
import json, sys
import numpy as np, pandas as pd
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
from features import load, sensor_cols, failure_times
from model import PumpModel, ART

LOOKBACK_H = 72


def healthy_mask(df, ft):
    ok = df["machine_status"] == "NORMAL"
    for f in ft:  # exclude the run-up to and recovery after each failure
        ok &= ~((df.index > f - pd.Timedelta(days=4)) & (df.index < f + pd.Timedelta(days=2)))
    return ok


def main():
    df, ft = load(), None
    ft = failure_times(df)
    S = sensor_cols(df)
    ok = healthy_mask(df, ft)
    train = df[ok].iloc[::5]
    model = PumpModel(S).fit(train, meta={"train_rows": int(len(train)),
                                          "trained_from": str(df.index[0]), "trained_to": str(df.index[-1])})
    model.save()
    scores = model.score(df)
    scores["status"] = df["machine_status"]
    scores.to_parquet(ART / "scores.parquet")
    # persistence rule used by the live alerting: ratio above 1 for 30 consecutive minutes
    above = (scores["ratio"] > 1.0).astype(int)
    run_above = above.groupby((above == 0).cumsum()).cumsum()
    PERSIST_MIN = 30

    # lead-time evaluation
    results = []
    for f in ft:
        w = scores.loc[f - pd.Timedelta(hours=LOOKBACK_H): f]
        a = w[run_above.loc[w.index] >= PERSIST_MIN]   # moment an alert would actually open
        lead = None if a.empty else round((f - a.index[0]).total_seconds() / 3600, 1)
        top = model.contributions(df.loc[f - pd.Timedelta(hours=1): f]).head(5)
        results.append({"failure": str(f), "lead_hours": lead,
                        "top_sensors": [{"sensor": k, "share": round(float(v / max(model.contributions(df.loc[f - pd.Timedelta(hours=1): f]).sum(), 1e-9)), 3)} for k, v in top.items()]})
    mask = ok.copy()
    for f in ft:  # ignore the run-up to and recovery after failures; those alerts are expected
        mask &= ~((df.index > f - pd.Timedelta(hours=72)) & (df.index < f + pd.Timedelta(days=2)))
    opens = (run_above == PERSIST_MIN) & mask      # one event per alert opening
    episodes = int(opens.sum())
    r = scores[ok]["ratio"]
    summary = {"threshold": model.threshold, "lookback_hours": LOOKBACK_H, "persistence_minutes": PERSIST_MIN,
               "failures_detected": sum(1 for x in results if x["lead_hours"] is not None),
               "failures_total": len(results),
               "healthy_alarm_rate": round(float((r > 1.0).mean()), 4),
               "healthy_false_alarm_episodes": episodes, "failures": results}
    (ART / "evaluation.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
