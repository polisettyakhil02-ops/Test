import { useState } from "react";
import { useDialysisMachines, useDialysisSessions } from "@/hooks/useDialysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/cn";
import { DialysisSessionStatus, DialysisShift } from "@/types/common.types";
import type { DialysisSession } from "@/types/dialysis.types";
import { ScheduleSessionModal } from "./ScheduleSessionModal";
import { NephrologyEmrModal } from "./NephrologyEmrModal";

function patientLabel(session: DialysisSession): string {
  if (typeof session.patientId === "string") return session.patientId;
  return `${session.patientId.firstName} ${session.patientId.lastName}`;
}

const STATUS_TONE: Record<DialysisSessionStatus, BadgeTone> = {
  SCHEDULED: "blue",
  IN_PROGRESS: "yellow",
  COMPLETED: "green",
  CANCELLED: "gray",
  ABORTED: "red",
};

const SHIFT_TONE: Record<DialysisShift, BadgeTone> = {
  MORNING: "yellow",
  AFTERNOON: "blue",
  EVENING: "purple",
  NIGHT: "gray",
};

/** Dialysis Scheduler: pick a machine, see every booked shift on its calendar, and open any session's Nephrology EMR chart. */
export function DialysisScheduler() {
  const machinesQuery = useDialysisMachines();
  const [selectedMachineId, setSelectedMachineId] = useState<string | undefined>(undefined);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [emrTarget, setEmrTarget] = useState<DialysisSession | null>(null);

  const sessionsQuery = useDialysisSessions({ machineAssetId: selectedMachineId });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dialysis Scheduler</h1>
          <p className="text-sm text-slate-500">Book patients onto machines across shifts and chart every session.</p>
        </div>
        <Button onClick={() => setIsScheduleOpen(true)}>+ Schedule Session</Button>
      </div>

      {machinesQuery.isLoading && <FullPageSpinner />}
      {machinesQuery.isError && <ErrorState message={getApiErrorMessage(machinesQuery.error)} />}
      {machinesQuery.data && machinesQuery.data.length === 0 && (
        <EmptyState
          title="No dialysis machines registered"
          description="Add a DIALYSIS_MACHINE asset via the Biomedical registry to schedule sessions."
        />
      )}

      {machinesQuery.data && machinesQuery.data.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedMachineId(undefined)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              !selectedMachineId ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50",
            )}
          >
            All Machines
          </button>
          {machinesQuery.data.map((machine) => (
            <button
              key={machine._id}
              type="button"
              onClick={() => setSelectedMachineId(machine._id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium",
                selectedMachineId === machine._id
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50",
              )}
            >
              {machine.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sessionsQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {sessionsQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(sessionsQuery.error)} />
            </div>
          )}
          {sessionsQuery.data && sessionsQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No sessions booked" description="Schedule a session to see it here." />
            </div>
          )}
          {sessionsQuery.data && sessionsQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {sessionsQuery.data.map((session) => (
                <button
                  key={session._id}
                  type="button"
                  onClick={() => setEmrTarget(session)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {session.sessionNumber} · {patientLabel(session)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(session.scheduledStart).toLocaleString()} — {new Date(session.scheduledEnd).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={SHIFT_TONE[session.shift]}>{session.shift}</Badge>
                    <Badge tone={STATUS_TONE[session.status]}>{session.status.replace("_", " ")}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isScheduleOpen && <ScheduleSessionModal onClose={() => setIsScheduleOpen(false)} />}
      {emrTarget && <NephrologyEmrModal session={emrTarget} onClose={() => setEmrTarget(null)} />}
    </div>
  );
}
