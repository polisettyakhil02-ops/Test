import { usePhlebotomyQueue } from "@/hooks/usePhlebotomy";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/cn";
import { LabOrderPriority } from "@/types/common.types";
import type { Specimen } from "@/types/phlebotomy.types";

function patientName(specimen: Specimen): string {
  if (typeof specimen.patientId === "string") return specimen.patientId;
  return `${specimen.patientId.firstName} ${specimen.patientId.lastName}`;
}
function orderPriority(specimen: Specimen): LabOrderPriority {
  return typeof specimen.labOrderId === "string" ? LabOrderPriority.ROUTINE : specimen.labOrderId.priority;
}
function waitMinutes(specimen: Specimen): number {
  return Math.max(0, Math.round((Date.now() - new Date(specimen.createdAt).getTime()) / 60000));
}

const PRIORITY_STYLE: Record<LabOrderPriority, string> = {
  STAT: "bg-red-600 text-white",
  URGENT: "bg-amber-500 text-white",
  ROUTINE: "bg-slate-700 text-white",
};

/**
 * TV-style waiting-room board: large type, high contrast, meant to run on
 * an unattended display in the phlebotomy waiting area (a staff-signed-in
 * kiosk session, same auth model as every other screen in this app — not
 * a public unauthenticated endpoint). Auto-refreshes; no interactive
 * controls at all, by design.
 */
export function PhlebotomyQueueBoard() {
  const queueQuery = usePhlebotomyQueue();

  if (queueQuery.isLoading) return <FullPageSpinner />;
  if (queueQuery.isError) return <ErrorState message={getApiErrorMessage(queueQuery.error)} />;

  const queue = queueQuery.data ?? [];

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">Phlebotomy — Now Serving</h1>
        <span className="text-lg text-slate-400">{queue.length} waiting</span>
      </div>

      {queue.length === 0 ? (
        <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
          <p className="text-3xl text-slate-500">No patients waiting</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {queue.map((specimen, index) => {
            const priority = orderPriority(specimen);
            const minutes = waitMinutes(specimen);
            return (
              <div
                key={specimen._id}
                className={cn(
                  "flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5",
                  index === 0 && "ring-2 ring-emerald-400",
                )}
              >
                <div className="flex items-center gap-5">
                  <span className="text-3xl font-black text-slate-600">#{index + 1}</span>
                  <div>
                    <p className="text-2xl font-semibold">{patientName(specimen)}</p>
                    <p className="text-sm text-slate-400">
                      {specimen.specimenType} · waiting {minutes}m
                    </p>
                  </div>
                </div>
                <span className={cn("rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wide", PRIORITY_STYLE[priority])}>
                  {priority}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
