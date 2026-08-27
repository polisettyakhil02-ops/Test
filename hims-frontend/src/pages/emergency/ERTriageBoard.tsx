import { useState } from "react";
import { useErVisits } from "@/hooks/useEmergency";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/cn";
import type { ERVisit } from "@/types/emergency.types";
import { TRIAGE_COLUMN_STYLE, TRIAGE_ORDER, minutesSince } from "./triageStyle";
import { RegisterErVisitModal } from "./RegisterErVisitModal";
import { ErVisitDetailModal } from "./ErVisitDetailModal";

function patientName(visit: ERVisit): string {
  if (typeof visit.patientId === "string") return visit.patientId;
  return `${visit.patientId.firstName} ${visit.patientId.lastName}`;
}

function VisitCard({ visit, onSelect }: { visit: ERVisit; onSelect: (visit: ERVisit) => void }) {
  const style = TRIAGE_COLUMN_STYLE[visit.triagePriority];
  const waitedMinutes = minutesSince(visit.arrivedAt);
  const isLongWait = waitedMinutes >= 30 && visit.status === "WAITING";

  return (
    <button
      type="button"
      onClick={() => onSelect(visit)}
      className={cn(
        "w-full rounded-lg border-2 p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md",
        style.cardClassName,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{patientName(visit)}</p>
          <p className="text-xs text-slate-600">{visit.chiefComplaint}</p>
        </div>
        {visit.isMedicoLegalCase && <Badge tone="purple">MLC</Badge>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span className={cn("font-semibold", isLongWait && "text-red-700")}>{waitedMinutes}m waiting</span>
        <span>·</span>
        <span>{visit.status.replace("_", " ")}</span>
        {visit.erBayId && typeof visit.erBayId !== "string" && (
          <>
            <span>·</span>
            <span>Bay {visit.erBayId.bayNumber}</span>
          </>
        )}
      </div>
    </button>
  );
}

/** Fast, high-contrast dashboard for the ER floor: four colour-coded triage columns, a one-click "New Arrival" button, and every card opening straight into the actions that move a case forward — including the one-click convert-to-IPD-admission. */
export function ERTriageBoard() {
  const visitsQuery = useErVisits(true);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<ERVisit | null>(null);

  const visitsByPriority = TRIAGE_ORDER.map((priority) => ({
    priority,
    visits: visitsQuery.data?.filter((visit) => visit.triagePriority === priority) ?? [],
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">ER Triage Board</h1>
          <p className="text-sm text-slate-500">Live acuity-ranked view of every active emergency case.</p>
        </div>
        <Button variant="danger" onClick={() => setIsRegisterOpen(true)}>
          + New Arrival
        </Button>
      </div>

      {visitsQuery.isLoading && <FullPageSpinner />}
      {visitsQuery.isError && <ErrorState message={getApiErrorMessage(visitsQuery.error)} />}

      {visitsQuery.data && visitsQuery.data.length === 0 && (
        <EmptyState title="ER is clear" description="No active emergency visits right now." />
      )}

      {visitsQuery.data && visitsQuery.data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visitsByPriority.map(({ priority, visits }) => {
            const style = TRIAGE_COLUMN_STYLE[priority];
            return (
              <div key={priority} className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className={cn("flex items-center justify-between rounded-t-lg px-3 py-2", style.headerClassName)}>
                  <span className="text-sm font-bold uppercase tracking-wide">{style.label}</span>
                  <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{visits.length}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {visits.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-slate-400">No patients</p>
                  ) : (
                    visits.map((visit) => <VisitCard key={visit._id} visit={visit} onSelect={setSelectedVisit} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isRegisterOpen && <RegisterErVisitModal onClose={() => setIsRegisterOpen(false)} />}
      {selectedVisit && <ErVisitDetailModal visit={selectedVisit} onClose={() => setSelectedVisit(null)} />}
    </div>
  );
}
