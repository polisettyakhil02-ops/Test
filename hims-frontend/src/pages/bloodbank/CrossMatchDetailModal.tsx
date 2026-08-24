import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { usePerformCrossMatch, useDispenseBloodBag } from "@/hooks/useBloodBank";
import { getApiErrorMessage } from "@/lib/axios";
import { CrossMatchStatus } from "@/types/common.types";
import type { CrossMatchRequest } from "@/types/bloodbank.types";

function patientLabel(request: CrossMatchRequest): string {
  if (typeof request.patientId === "string") return request.patientId;
  return `${request.patientId.firstName} ${request.patientId.lastName} (${request.patientId.uhid})`;
}

const STATUS_TONE: Record<CrossMatchStatus, "green" | "blue" | "red" | "yellow" | "gray"> = {
  PENDING: "yellow",
  COMPATIBLE: "blue",
  INCOMPATIBLE: "red",
  FULFILLED: "green",
  CANCELLED: "gray",
};

/** The cross-match/dispense workflow's control panel: record the lab's compatibility result (which reserves real units server-side), then dispense from exactly those reserved units — the two guards `dispenseBloodBag` enforces (COMPATIBLE result, unexpired bag) surface here as plain error text if violated. */
export function CrossMatchDetailModal({ request, onClose }: { request: CrossMatchRequest; onClose: () => void }) {
  const [resultNotes, setResultNotes] = useState("");
  const [bagId, setBagId] = useState("");
  const [admissionId, setAdmissionId] = useState(request.admissionId ?? "");
  const performMutation = usePerformCrossMatch(request._id);
  const dispenseMutation = useDispenseBloodBag(request._id);

  return (
    <Modal isOpen onClose={onClose} title={`Cross-Match ${request.requestNumber}`}>
      <div className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{patientLabel(request)}</p>
          <p className="text-slate-600">
            {request.unitsRequired}× {request.componentType.replace("_", " ")} ({request.bloodGroupRequired})
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge>
            {request.urgent && <Badge tone="red">Urgent</Badge>}
          </div>
          {request.resultNotes && <p className="mt-2 text-xs text-slate-500">Notes: {request.resultNotes}</p>}
        </div>

        {request.status === CrossMatchStatus.PENDING && (
          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record Lab Result</p>
            <Input label="Notes (required if incompatible)" value={resultNotes} onChange={(e) => setResultNotes(e.target.value)} />
            {performMutation.isError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(performMutation.error)}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                isLoading={performMutation.isPending}
                onClick={() => performMutation.mutate({ compatible: true, resultNotes: resultNotes || undefined })}
              >
                Mark Compatible &amp; Reserve Units
              </Button>
              <Button
                type="button"
                variant="danger"
                isLoading={performMutation.isPending}
                onClick={() => performMutation.mutate({ compatible: false, resultNotes: resultNotes || undefined })}
              >
                Mark Incompatible
              </Button>
            </div>
          </div>
        )}

        {request.status === CrossMatchStatus.COMPATIBLE && (
          <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Dispense — {request.crossMatchedBagIds.length} unit(s) reserved
            </p>
            <Select
              label="Reserved Bag"
              value={bagId}
              onChange={(event) => setBagId(event.target.value)}
              placeholder="Select a reserved bag"
              options={request.crossMatchedBagIds.map((id) => ({ value: id, label: id }))}
            />
            <Input
              label="Admission ID"
              placeholder="Ward admission ObjectId"
              value={admissionId}
              onChange={(event) => setAdmissionId(event.target.value)}
            />
            {dispenseMutation.isError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(dispenseMutation.error)}</p>
            )}
            <Button
              type="button"
              disabled={!bagId || !admissionId}
              isLoading={dispenseMutation.isPending}
              onClick={() => dispenseMutation.mutate({ bagId, admissionId }, { onSuccess: onClose })}
            >
              Dispense to Ward
            </Button>
          </div>
        )}

        {(request.status === CrossMatchStatus.FULFILLED ||
          request.status === CrossMatchStatus.INCOMPATIBLE ||
          request.status === CrossMatchStatus.CANCELLED) && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">This request is closed.</p>
        )}
      </div>
    </Modal>
  );
}
