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
  evaluation: {
    failures_detected: number;
    failures_total: number;
    healthy_alarm_rate: number;
    healthy_false_alarm_episodes: number;
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

export const ml = {
  failures: () => get<FailureCatalog>("/failures"),
  meta: () => get<Meta>("/meta"),
  at: (t: string) => get<Reading>("/at", { t }),
  scores: (start: string, end: string, step: number) =>
    get<unknown[]>("/scores", { start, end, step }),
  readings: (start: string, end: string, sensors: string, step: number) =>
    get<Record<string, unknown>>("/readings", { start, end, sensors, step }),
  alerts: () => get<unknown[]>("/alerts"),
};
