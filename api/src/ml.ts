import { config } from "./config.js";
import type { Reading } from "./types.js";

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, config.mlUrl);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ML ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export interface Meta {
  sensors: string[];
  start: string;
  end: string;
  threshold: number;
  level: number;
  train: { train_rows: number; trained_from: string; trained_to: string; windows_included: number; windows_excluded: number };
  evaluation: {
    failures_detected: number;
    failures_total: number;
    healthy_alarm_rate: number;
    healthy_false_alarm_episodes: number;
    lead_min: number | null;
    lead_max: number | null;
    failures: { failure: string; lead_hours: number | null; top_sensors: { sensor: string; share: number }[] }[];
  };
}

export interface FailureCatalog {
  thresholds: { possible: number; strong: number };
  failures: {
    failure: string;
    lead_hours: number | null;
    fingerprint: { sensor: string; z: number }[];
    most_similar: { failure: string; similarity: number } | null;
  }[];
}

export interface Preview {
  level: number; failures_total: number; failures_detected: number; healthy_false_alarm_episodes: number;
  healthy_alarm_rate: number; lead_min: number | null; lead_max: number | null;
  failures: { failure: string; lead_hours: number | null }[];
}
export interface CurveRow { level: number; failures_detected: number; failures_total: number; false_alarm_episodes: number }

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(new URL(path, config.mlUrl), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ML ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const ml = {
  preview: (level: number) => get<Preview>("/sensitivity/preview", { level }),
  curve: () => get<CurveRow[]>("/sensitivity/curve"),
  setLevel: (level: number) => post<Meta>("/sensitivity", { level }),
  retrain: (include: [string, string][], exclude: [string, string][]) =>
    post<{ before: { threshold: number; failures_detected: number; failures_total: number; healthy_false_alarm_episodes: number }; meta: Meta }>(
      "/retrain", { include, exclude }),
  failures: () => get<FailureCatalog>("/failures"),
  meta: () => get<Meta>("/meta"),
  at: (t: string) => get<Reading>("/at", { t }),
  scores: (start: string, end: string, step: number) =>
    get<unknown[]>("/scores", { start, end, step }),
  readings: (start: string, end: string, sensors: string, step: number) =>
    get<Record<string, unknown>>("/readings", { start, end, sensors, step }),
  alerts: () => get<unknown[]>("/alerts"),
};
