import type { ReportResolution } from "@web/ReportResolution";

export type Tier = ReportResolution;

export function pickTier(windowDays: number): Tier {
  if (windowDays <= 1) return "q15";
  if (windowDays <= 7) return "h1";
  return "d1";
}
