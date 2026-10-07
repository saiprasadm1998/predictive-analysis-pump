import type { TopSensor } from "./types.js";

/** Plain-English alert summary from the sensors driving the anomaly. Deterministic, no LLM needed. */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const nice = (t: string) => `${Number(t.slice(8, 10))} ${MONTHS[Number(t.slice(5, 7)) - 1]}, ${t.slice(11, 16)}`;

export function summarise(severity: string, peakRatio: number, top: TopSensor[], t: string): string {
  const lead = top.slice(0, 3).map((s) => `${s.sensor.replace("sensor_", "Sensor ")} (${Math.round(s.share * 100)}%)`);
  const level =
    severity === "critical"
      ? "Readings are well outside normal operating behaviour"
      : "Readings are drifting away from normal operating behaviour";
  const driver = lead.length ? ` The largest contributors are ${lead.join(", ")}.` : "";
  const action =
    severity === "critical"
      ? " Recommended: inspect the pump now and plan a controlled shutdown if the trend continues."
      : " Recommended: schedule an inspection and keep watching the trend.";
  return `${level} as of ${nice(t)} (${peakRatio.toFixed(1)}x the alarm threshold).${driver}${action}`;
}
