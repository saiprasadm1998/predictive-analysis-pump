# Pump Guardian

![Dashboard replaying the run-up to a recorded failure](docs/dashboard.png)

Predictive-maintenance dashboard for oil & gas pumps. Learns what healthy operation looks like from
51 sensors, scores every reading, and warns before failures.

## Features

- Live replay of recorded sensor history, with a health score, root-cause bars and sensor drill-down.
- Failure pattern matching: each alert is compared with the fingerprints of failures that already happened.
- Alert workflow: operators move alerts through New, Investigating and Resolved, add notes, and mark each one as a
  real issue or a false alarm. Once three or more alerts are labelled, a hint suggests an alarm level that would have
  silenced the false alarms without losing the real issues. It is a suggestion to test, not applied automatically.
- Model page: replay the recorded history at a different alarm level to see which failures would be missed and how many
  false alerts you would get, apply the level (admins), retrain using operator verdicts, and see a history of model runs.

Stack: React + TypeScript (web), Node + TypeScript (api), Python + scikit-learn + FastAPI (ml).

Dataset: Kaggle "Pump Sensor Data" (`sensor.csv`, about 124 MB). It is not committed: GitHub rejects files over
100 MB, and the data belongs to its Kaggle author. Download it from Kaggle (search "Pump Sensor Data" by nphantawee)
and place it at `ml/data/sensor.csv` before running `python src/train.py`.

## Run

```
# 1. ML service (first time: train)
cd ml && pip install -r requirements.txt
python src/train.py                      # writes ml/artifacts/
uvicorn --app-dir src server:app --port 8000

# 2. API
cd api && cp .env.example .env && npm install && npm run dev
#    :4000. Alerts, notes and users are kept in memory, so they reset when the API restarts.
#    First start creates an admin from ADMIN_USER / ADMIN_PASS (default operator / pumps123).

# 3. Dashboard
cd web && npm install && npm run dev     # :5173, proxies /api and /ws to :4000
```

## Model results (honest numbers)

Mahalanobis distance (Ledoit-Wolf) on 51 scaled sensors, 30-minute smoothing, alarm at the 99th
percentile of healthy training data. Alerts open after 30 consecutive minutes above threshold.
Detects 6 of 7 recorded failures 47-72h ahead (look-back capped at 72h); the 25 July failure
is missed. About 16 alerts open during healthy operation over four months.
Threshold and training data come from the same period, so treat results as optimistic.

Roles: `viewer` (read only), `operator` (replay control, alert status, verdicts and notes), `admin` (also apply a new alarm level, retrain, and manage users via `POST /api/users`).

Runs locally. Data is held in memory and resets when the API restarts.
