import { useState } from "react";
import { usePendingPrescriptions } from "@/hooks/usePendingPrescriptions";
import { useDispenseMedication } from "@/hooks/useDispenseMedication";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { PrescriptionStatus } from "@/types/common.types";
import type { BadgeTone } from "@/components/ui/Badge";
import type { PendingPrescription, PrescriptionItem } from "@/types/emr.types";

const ITEM_STATUS_TONE: Record<PrescriptionStatus, BadgeTone> = {
  ORDERED: "blue",
  PARTIALLY_DISPENSED: "yellow",
  DISPENSED: "green",
  CANCELLED: "gray",
  ON_HOLD: "gray",
};

function DispenseItemRow({
  prescription,
  item,
}: {
  prescription: PendingPrescription;
  item: PrescriptionItem;
}) {
  const remaining = item.computedTotalQuantity - item.quantityDispensed;
  const [quantity, setQuantity] = useState(remaining.toString());
  const dispense = useDispenseMedication();
  const isDone = item.itemStatus === PrescriptionStatus.DISPENSED || item.itemStatus === PrescriptionStatus.CANCELLED;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-b-0">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-medium text-slate-800">{item.drugName}</p>
        <p className="text-xs text-slate-500">
          {item.doseValue}
          {item.doseUnit} · {item.route} · {item.frequencyPerDay}x/day · {item.durationDays}d
        </p>
      </div>
      <Badge tone={ITEM_STATUS_TONE[item.itemStatus]}>{item.itemStatus.replace(/_/g, " ")}</Badge>
      <p className="text-xs text-slate-500">
        {item.quantityDispensed}/{item.computedTotalQuantity} dispensed
      </p>

      {!isDone && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={remaining}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-20"
          />
          <Button
            size="sm"
            isLoading={dispense.isPending}
            onClick={() =>
              dispense.mutate({
                prescriptionId: prescription._id,
                patientId: prescription.patientId._id,
                itemId: item._id,
                quantity: Number(quantity),
              })
            }
            disabled={!quantity || Number(quantity) <= 0 || Number(quantity) > remaining}
          >
            Dispense
          </Button>
        </div>
      )}

      {dispense.isError && (
        <p className="w-full text-xs text-red-600">{getApiErrorMessage(dispense.error)}</p>
      )}
    </div>
  );
}

/** Pharmacist worklist — GET /api/pharmacy/prescriptions/pending, each line dispensed via POST /api/pharmacy/dispense (PharmacyService.dispenseMedication). */
export function DispensationQueue() {
  const pendingQuery = usePendingPrescriptions();

  if (pendingQuery.isLoading) {
    return <FullPageSpinner />;
  }

  if (pendingQuery.isError) {
    return <ErrorState message={getApiErrorMessage(pendingQuery.error)} />;
  }

  const prescriptions = pendingQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Dispensation Queue</h1>
        <p className="text-sm text-slate-500">Prescriptions awaiting full or partial dispensation.</p>
      </div>

      {prescriptions.length === 0 ? (
        <EmptyState title="Queue is empty" description="No pending prescriptions right now." />
      ) : (
        <div className="space-y-3">
          {prescriptions.map((prescription) => (
            <Card key={prescription._id}>
              <CardHeader>
                <div>
                  <CardTitle>
                    {prescription.patientId.firstName} {prescription.patientId.lastName} · {prescription.patientId.uhid}
                  </CardTitle>
                  <p className="text-xs text-slate-500">
                    {prescription.prescriptionNumber} · Dr. {prescription.doctorId.fullName}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {prescription.items.map((item) => (
                  <DispenseItemRow key={item._id} prescription={prescription} item={item} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
