# Pump Guardian

Predictive-maintenance dashboard for oil & gas pumps. Learns what healthy operation looks like from
51 sensors, scores every reading, and warns before failures.

Stack: React + TypeScript (web), Node + TypeScript (api), Python + scikit-learn + FastAPI (ml).

Dataset: Kaggle "Pump Sensor Data" (`sensor.csv`, place in `ml/data/`, not committed).

## Run

```
# 1. ML service (first time: train)
cd ml && pip install -r requirements.txt
python src/train.py                      # writes ml/artifacts/
uvicorn --app-dir src server:app --port 8000

# 2. API
cd api && npm install && npm run dev     # :4000, demo login operator / pumps123 (set DEMO_USER, DEMO_PASS, JWT_SECRET)
```

## Model results (honest numbers)

Mahalanobis distance (Ledoit-Wolf) on 51 scaled sensors, 30-minute smoothing, alarm at the 99th
percentile of healthy training data. Alerts open after 30 consecutive minutes above threshold.
Detects 6 of 7 recorded failures 47-72h ahead (look-back capped at 72h); the 25 July failure
is missed. About 19 alert episodes occur during healthy operation over four months.
Threshold and training data come from the same period, so treat results as optimistic.

Status: work in progress (React dashboard next).
