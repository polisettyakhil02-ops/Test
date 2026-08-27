import { useState } from "react";
import { useIvfCycles } from "@/hooks/useSpecialtyEmr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { IvfCycleStatus } from "@/types/common.types";
import type { IvfCycle } from "@/types/specialtyEmr.types";
import { CreateIvfCycleModal } from "./CreateIvfCycleModal";
import { IvfCycleDetailModal } from "./IvfCycleDetailModal";

function patientLabel(cycle: IvfCycle): string {
  if (typeof cycle.patientId === "string") return cycle.patientId;
  return `${cycle.patientId.firstName} ${cycle.patientId.lastName}`;
}

const STATUS_TONE: Record<IvfCycleStatus, BadgeTone> = {
  STIMULATION: "blue",
  TRIGGERED: "purple",
  RETRIEVAL_DONE: "purple",
  FERTILIZATION_DONE: "purple",
  EMBRYO_TRANSFERRED: "yellow",
  LUTEAL_SUPPORT: "yellow",
  PREGNANCY_CONFIRMED: "green",
  NOT_PREGNANT: "gray",
  CANCELLED: "red",
};

/** IVF EMR: every ART cycle, its current pipeline stage, and a detail modal that walks it stage by stage from stimulation through the beta-hCG test. */
export function IvfEmrPanel() {
  const cyclesQuery = useIvfCycles();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<IvfCycle | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">IVF EMR</h1>
          <p className="text-sm text-slate-500">Stimulation protocols, retrieval counts, and embryo transfer cycles.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>+ Start Cycle</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cycles</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cyclesQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {cyclesQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(cyclesQuery.error)} />
            </div>
          )}
          {cyclesQuery.data && cyclesQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No IVF cycles yet" description="Start a cycle to begin tracking a patient's ART attempt." />
            </div>
          )}
          {cyclesQuery.data && cyclesQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {cyclesQuery.data.map((cycle) => (
                <button
                  key={cycle._id}
                  type="button"
                  onClick={() => setDetailTarget(cycle)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {cycle.cycleNumber} · {patientLabel(cycle)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {cycle.protocolType.replace(/_/g, " ")} · started {new Date(cycle.stimulationStartDate).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[cycle.status]}>{cycle.status.replace(/_/g, " ")}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isCreateOpen && <CreateIvfCycleModal onClose={() => setIsCreateOpen(false)} />}
      {detailTarget && <IvfCycleDetailModal cycle={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}
