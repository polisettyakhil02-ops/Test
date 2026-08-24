import { useState } from "react";
import { useObstetricRecords } from "@/hooks/useSpecialtyEmr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { ObstetricRecordStatus } from "@/types/common.types";
import type { ObstetricRecord } from "@/types/specialtyEmr.types";
import { CreateObstetricRecordModal } from "./CreateObstetricRecordModal";
import { ObstetricRecordDetailModal } from "./ObstetricRecordDetailModal";

function patientLabel(record: ObstetricRecord): string {
  if (typeof record.patientId === "string") return record.patientId;
  return `${record.patientId.firstName} ${record.patientId.lastName}`;
}

const STATUS_TONE: Record<ObstetricRecordStatus, BadgeTone> = {
  ANTENATAL: "blue",
  IN_LABOR: "red",
  DELIVERED: "green",
  POSTNATAL_DISCHARGED: "gray",
};

/** Obstetric EMR: ANC visits, gravidity/parity, and the digital partograph — from booking through delivery and postnatal discharge. */
export function ObstetricEmrPanel() {
  const recordsQuery = useObstetricRecords();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ObstetricRecord | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Obstetric EMR</h1>
          <p className="text-sm text-slate-500">ANC visits, gravidity/parity, and the digital partograph.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>+ New Record</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pregnancies</CardTitle>
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
              <EmptyState title="No obstetric records yet" description="Create a record at the first ANC booking visit." />
            </div>
          )}
          {recordsQuery.data && recordsQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {recordsQuery.data.map((record) => (
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
                    <p className="text-xs text-slate-500">
                      G{record.gravida}P{record.para} · EDD {new Date(record.eddDate).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[record.status]}>{record.status.replace(/_/g, " ")}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isCreateOpen && <CreateObstetricRecordModal onClose={() => setIsCreateOpen(false)} />}
      {detailTarget && <ObstetricRecordDetailModal record={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}
