import { BedStatus } from "@/types/common.types";
import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Color coding for the bed grid. The spec calls out three states
 * (Available/green, Occupied/red-or-blue, Maintenance/gray-or-yellow);
 * this covers all six `BedStatus` values the backend actually models,
 * choosing blue for OCCUPIED (reserving red for BLOCKED, the more
 * urgent/needs-attention state) and yellow for CLEANING (a turnaround
 * state distinct from MAINTENANCE).
 */
export const BED_STATUS_STYLE: Record<BedStatus, { tone: BadgeTone; cellClassName: string; label: string }> = {
  [BedStatus.VACANT]: {
    tone: "green",
    cellClassName: "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100",
    label: "Available",
  },
  [BedStatus.OCCUPIED]: {
    tone: "blue",
    cellClassName: "bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100",
    label: "Occupied",
  },
  [BedStatus.RESERVED]: {
    tone: "purple",
    cellClassName: "bg-purple-50 border-purple-300 text-purple-800",
    label: "Reserved",
  },
  [BedStatus.CLEANING]: {
    tone: "yellow",
    cellClassName: "bg-amber-50 border-amber-300 text-amber-800",
    label: "Cleaning",
  },
  [BedStatus.MAINTENANCE]: {
    tone: "gray",
    cellClassName: "bg-slate-100 border-slate-300 text-slate-600",
    label: "Maintenance",
  },
  [BedStatus.BLOCKED]: {
    tone: "red",
    cellClassName: "bg-red-50 border-red-300 text-red-800",
    label: "Blocked",
  },
};
