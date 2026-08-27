import { useState } from "react";
import { usePhlebotomyQueue, useCollectSpecimen } from "@/hooks/usePhlebotomy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { LabOrderPriority } from "@/types/common.types";
import type { Specimen } from "@/types/phlebotomy.types";
import { printSpecimenLabel } from "./printLabel";

function patientName(specimen: Specimen): string {
  if (typeof specimen.patientId === "string") return specimen.patientId;
  return `${specimen.patientId.firstName} ${specimen.patientId.lastName}`;
}
function patientUhid(specimen: Specimen): string {
  return typeof specimen.patientId === "string" ? "" : specimen.patientId.uhid;
}
function orderPriority(specimen: Specimen): LabOrderPriority {
  return typeof specimen.labOrderId === "string" ? LabOrderPriority.ROUTINE : specimen.labOrderId.priority;
}

const PRIORITY_TONE: Record<LabOrderPriority, BadgeTone> = {
  STAT: "red",
  URGENT: "yellow",
  ROUTINE: "gray",
};

/**
 * The phlebotomist's working screen: print a specimen's label ahead of
 * the draw, then scan (or type) the same barcode back in to mark it
 * Collected — the literal gate `LIMSService.submitLabResult` now checks
 * before the lab can enter a result against this specimen.
 */
export function PhlebotomyCollectionStation() {
  const queueQuery = usePhlebotomyQueue();
  const collectMutation = useCollectSpecimen();
  const [barcodeInput, setBarcodeInput] = useState("");

  function handleCollect(barcode: string) {
    if (!barcode.trim()) return;
    collectMutation.mutate(
      { barcodeValue: barcode.trim() },
      { onSuccess: () => setBarcodeInput("") },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Phlebotomy Collection Station</h1>
          <p className="text-sm text-slate-500">Print a specimen label, then scan or enter its barcode here once the sample is drawn.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.open("/phlebotomy/board", "_blank")}>
          Open Waiting Room Display ↗
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan / Enter Barcode</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleCollect(barcodeInput);
            }}
          >
            <Input
              autoFocus
              value={barcodeInput}
              onChange={(event) => setBarcodeInput(event.target.value)}
              placeholder="Scan a barcode or type it, e.g. SPEC-2026-000512"
              className="flex-1 font-mono"
            />
            <Button type="submit" isLoading={collectMutation.isPending} disabled={!barcodeInput.trim()}>
              Mark Collected
            </Button>
          </form>
          {collectMutation.isError && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(collectMutation.error)}</p>
          )}
          {collectMutation.isSuccess && (
            <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {collectMutation.data.specimen.barcodeValue} marked Collected.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Collection</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {queueQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {queueQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(queueQuery.error)} />
            </div>
          )}
          {queueQuery.data && queueQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="Queue is clear" description="Every ordered specimen has been collected." />
            </div>
          )}
          {queueQuery.data && queueQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Patient</th>
                    <th className="px-3 py-2">Barcode</th>
                    <th className="px-3 py-2">Specimen</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {queueQuery.data.map((specimen) => (
                    <tr key={specimen._id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{patientName(specimen)}</p>
                        <p className="font-mono text-xs text-slate-500">{patientUhid(specimen)}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{specimen.barcodeValue}</td>
                      <td className="px-3 py-2">
                        {specimen.specimenType} <span className="text-slate-400">({specimen.containerType})</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={PRIORITY_TONE[orderPriority(specimen)]}>{orderPriority(specimen)}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => printSpecimenLabel(specimen)}>
                            Print Label
                          </Button>
                          <Button size="sm" onClick={() => handleCollect(specimen.barcodeValue)} isLoading={collectMutation.isPending}>
                            Collect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
