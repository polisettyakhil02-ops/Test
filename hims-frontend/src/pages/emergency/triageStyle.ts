import { TriagePriority } from "@/types/common.types";

/** High-contrast colour coding for the Triage Board — deliberately saturated (not the soft pastel tones used elsewhere in the app) since this screen has to be readable at a glance from across a busy ER floor. */
export const TRIAGE_COLUMN_STYLE: Record<
  TriagePriority,
  { label: string; shortLabel: string; headerClassName: string; cardClassName: string }
> = {
  [TriagePriority.RED]: {
    label: "Red — Immediate",
    shortLabel: "RED",
    headerClassName: "bg-red-600 text-white",
    cardClassName: "border-red-400 bg-red-50",
  },
  [TriagePriority.YELLOW]: {
    label: "Yellow — Urgent",
    shortLabel: "YELLOW",
    headerClassName: "bg-amber-500 text-white",
    cardClassName: "border-amber-400 bg-amber-50",
  },
  [TriagePriority.GREEN]: {
    label: "Green — Non-Urgent",
    shortLabel: "GREEN",
    headerClassName: "bg-emerald-600 text-white",
    cardClassName: "border-emerald-400 bg-emerald-50",
  },
  [TriagePriority.BLACK]: {
    label: "Black — Deceased/Expectant",
    shortLabel: "BLACK",
    headerClassName: "bg-slate-900 text-white",
    cardClassName: "border-slate-500 bg-slate-100",
  },
};

export const TRIAGE_ORDER: TriagePriority[] = [
  TriagePriority.RED,
  TriagePriority.YELLOW,
  TriagePriority.GREEN,
  TriagePriority.BLACK,
];

export function minutesSince(isoDate: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 60000));
}
