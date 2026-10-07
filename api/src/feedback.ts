import type { Alert } from "./types.js";

export interface Feedback {
  real: number;
  falseAlarms: number;
  unlabelled: number;
  /** Alarm level (x threshold) that best separates the operator's verdicts, or null when there is too little to go on. */
  suggestion: null | { level: number; silenced: number; falseAlarms: number; lost: number; real: number };
  note: string;
}

const MIN_LABELS = 3;

/**
 * Turn operator verdicts into a tuning hint. An alert whose peak stays below a higher alarm level can no longer
 * open, so raising the level to just above a false alarm's peak certainly silences it; a real issue whose peak is
 * below that level is certainly lost. Alerts above the level may still be dropped by the 30-minute persistence rule,
 * so this is a hint to try on the model page, not a promise.
 */
export function feedback(alerts: Alert[]): Feedback {
  const real = alerts.filter((a) => a.label === "real_issue");
  const fa = alerts.filter((a) => a.label === "false_alarm");
  const unlabelled = alerts.length - real.length - fa.length;
  const base = { real: real.length, falseAlarms: fa.length, unlabelled };
  if (real.length + fa.length < MIN_LABELS || fa.length === 0) {
    return { ...base, suggestion: null,
      note: fa.length === 0 && real.length + fa.length >= MIN_LABELS
        ? "No false alarms labelled, so there is nothing to tune away."
        : `Label at least ${MIN_LABELS} alerts and a tuning hint will appear.` };
  }
  let best: Feedback["suggestion"] = null;
  let bestScore = 0;
  for (const level of [...new Set(fa.map((a) => (Math.floor(a.peakRatio * 100 + 1e-6) + 1) / 100))].sort((x, y) => x - y)) {
    const silenced = fa.filter((a) => a.peakRatio < level).length;
    const lost = real.filter((a) => a.peakRatio < level).length;
    const score = silenced - 2 * lost; // missing a real failure costs more than a false alarm
    if (score > bestScore) { bestScore = score; best = { level, silenced, falseAlarms: fa.length, lost, real: real.length }; }
  }
  if (!best) return { ...base, suggestion: null, note: "Real issues and false alarms peak at similar levels, so changing the alarm level would not help. The model needs better features, not a different threshold." };
  const lostTxt = best.lost === 0 ? "without losing any labelled real issue" : `at the cost of ${best.lost} of ${best.real} real issues`;
  return { ...base, suggestion: best,
    note: `Raising the alarm level to ${best.level.toFixed(2)}x would silence ${best.silenced} of ${best.falseAlarms} false alarms ${lostTxt}. Try it on the model page before relying on it.` };
}
