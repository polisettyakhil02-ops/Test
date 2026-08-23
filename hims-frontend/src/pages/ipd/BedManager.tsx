import { useState } from "react";
import { useWards } from "@/hooks/useBeds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/cn";
import { BedStatus } from "@/types/common.types";
import type { WardBedSummary, WardMapEntry } from "@/types/ipd.types";
import { BED_STATUS_STYLE } from "./bedStatus";
import { AdmitPatientModal } from "./AdmitPatientModal";
import { BedDetailDrawer } from "./BedDetailDrawer";

function BedCell({ bed, onSelect }: { bed: WardBedSummary; onSelect: (bed: WardBedSummary) => void }) {
  const style = BED_STATUS_STYLE[bed.status];
  const isInteractive = bed.status === BedStatus.VACANT || bed.status === BedStatus.OCCUPIED;

  return (
    <button
      type="button"
      disabled={!isInteractive}
      onClick={() => onSelect(bed)}
      title={`${bed.bedNumber} — ${style.label}`}
      className={cn(
        "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border p-1 text-center transition-colors",
        style.cellClassName,
        !isInteractive && "cursor-not-allowed opacity-70",
      )}
    >
      <span className="text-xs font-semibold">{bed.bedNumber}</span>
      <span className="text-[10px] leading-tight">{style.label}</span>
      {(bed.hasVentilator || bed.hasOxygenSupply) && (
        <span className="text-[10px]" aria-hidden="true">
          {bed.hasVentilator ? "vent" : "O₂"}
        </span>
      )}
    </button>
  );
}

function WardCard({ entry, onSelectBed }: { entry: WardMapEntry; onSelectBed: (bed: WardBedSummary) => void }) {
  const occupied = entry.occupancySummary[BedStatus.OCCUPIED] ?? 0;
  const vacant = entry.occupancySummary[BedStatus.VACANT] ?? 0;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{entry.ward.name}</CardTitle>
          <p className="text-xs text-slate-500">
            {entry.ward.category} · Floor {entry.ward.floor}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Badge tone="green">{vacant} free</Badge>
          <Badge tone="blue">{occupied} occupied</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {entry.beds.length === 0 ? (
          <p className="text-xs text-slate-400">No beds configured in this ward.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {entry.beds.map((bed) => (
              <BedCell key={bed.id} bed={bed} onSelect={onSelectBed} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Visual, color-coded ward/bed occupancy grid — clicking a VACANT bed opens the admit modal, clicking an OCCUPIED bed opens the patient detail drawer. */
export function BedManager() {
  const wardsQuery = useWards();
  const [admitTarget, setAdmitTarget] = useState<WardBedSummary | null>(null);
  const [detailTarget, setDetailTarget] = useState<WardBedSummary | null>(null);

  function handleSelectBed(bed: WardBedSummary) {
    if (bed.status === BedStatus.VACANT) {
      setAdmitTarget(bed);
    } else if (bed.status === BedStatus.OCCUPIED) {
      setDetailTarget(bed);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Bed Manager</h1>
          <p className="text-sm text-slate-500">Live ward occupancy — click a bed to admit or view details.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {Object.entries(BED_STATUS_STYLE).map(([status, style]) => (
            <span key={status} className="flex items-center gap-1">
              <span className={cn("h-2.5 w-2.5 rounded-full border", style.cellClassName)} />
              {style.label}
            </span>
          ))}
        </div>
      </div>

      {wardsQuery.isLoading && <FullPageSpinner />}
      {wardsQuery.isError && <ErrorState message={getApiErrorMessage(wardsQuery.error)} />}
      {wardsQuery.data && wardsQuery.data.length === 0 && (
        <EmptyState title="No wards configured" description="Add wards and beds via the admin console to see them here." />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {wardsQuery.data?.map((entry) => (
          <WardCard key={entry.ward.id} entry={entry} onSelectBed={handleSelectBed} />
        ))}
      </div>

      {admitTarget && <AdmitPatientModal bed={admitTarget} onClose={() => setAdmitTarget(null)} />}
      {detailTarget && <BedDetailDrawer bed={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}
