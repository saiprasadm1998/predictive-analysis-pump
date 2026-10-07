import type { TopSensor } from "./types.js";

/** Plain-English alert summary from the sensors driving the anomaly. Deterministic, no LLM needed. */
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
  return `${level} as of ${t} (${peakRatio.toFixed(1)}x the alarm threshold).${driver}${action}`;
}
