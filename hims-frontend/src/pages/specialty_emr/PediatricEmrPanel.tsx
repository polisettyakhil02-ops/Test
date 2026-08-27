import { useState } from "react";
import { usePediatricRecords } from "@/hooks/useSpecialtyEmr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { VaccinationDoseStatus } from "@/types/common.types";
import type { PediatricRecord } from "@/types/specialtyEmr.types";
import { CreatePediatricRecordModal } from "./CreatePediatricRecordModal";
import { PediatricRecordDetailModal } from "./PediatricRecordDetailModal";

function patientLabel(record: PediatricRecord): string {
  if (typeof record.patientId === "string") return record.patientId;
  return `${record.patientId.firstName} ${record.patientId.lastName}`;
}

/** Pediatric EMR: childhood vaccination schedules (due/administered/batch) and WHO growth-chart tracking (weight, height, head circumference), one record per child. */
export function PediatricEmrPanel() {
  const recordsQuery = usePediatricRecords();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PediatricRecord | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pediatric EMR</h1>
          <p className="text-sm text-slate-500">Vaccination schedules and WHO growth-chart tracking.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>+ New Record</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Children</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recordsQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {recordsQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(recordsQuery.error)} />
            </div>
          )}
          {recordsQuery.data && recordsQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No pediatric records yet" description="Create a record to seed the child's immunization schedule." />
            </div>
          )}
          {recordsQuery.data && recordsQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {recordsQuery.data.map((record) => {
                const dueCount = record.vaccinationSchedule.filter(
                  (d) => d.status === VaccinationDoseStatus.DUE && new Date(d.dueDate) <= new Date(),
                ).length;
                return (
                  <button
                    key={record._id}
                    type="button"
                    onClick={() => setDetailTarget(record)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {record.recordNumber} · {patientLabel(record)}
                      </p>
                      <p className="text-xs text-slate-500">{record.growthChartEntries.length} growth measurement(s)</p>
                    </div>
                    {dueCount > 0 && <span className="text-xs font-medium text-amber-700">{dueCount} dose(s) due</span>}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isCreateOpen && <CreatePediatricRecordModal onClose={() => setIsCreateOpen(false)} />}
      {detailTarget && <PediatricRecordDetailModal record={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}
