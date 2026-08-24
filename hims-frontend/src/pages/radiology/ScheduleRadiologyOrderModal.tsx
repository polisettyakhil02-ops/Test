import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useRadiologyMachines, useScheduleRadiologyOrder } from "@/hooks/useRadiology";
import { getApiErrorMessage } from "@/lib/axios";
import type { RadiologyOrder } from "@/types/radiology.types";

function patientName(order: RadiologyOrder): string {
  if (typeof order.patientId === "string") return order.patientId;
  return `${order.patientId.firstName} ${order.patientId.lastName}`;
}

/** Assigns a machine + time to an ORDERED study — rejected server-side if the asset isn't the ordered modality, isn't ACTIVE, or is already booked at that time. */
export function ScheduleRadiologyOrderModal({ order, onClose }: { order: RadiologyOrder; onClose: () => void }) {
  const machinesQuery = useRadiologyMachines();
  const scheduleMutation = useScheduleRadiologyOrder(order._id);
  const [machineAssetId, setMachineAssetId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const eligibleMachines = (machinesQuery.data ?? []).filter((m) => m.category === order.modality);

  return (
    <Modal isOpen onClose={onClose} title={`Schedule ${order.orderNumber}`}>
      <div className="space-y-4">
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {patientName(order)} · {order.modality.replace("_", " ")} · {order.bodyPart}
        </p>

        <Select
          label="Machine"
          value={machineAssetId}
          onChange={(event) => setMachineAssetId(event.target.value)}
          placeholder={machinesQuery.isLoading ? "Loading machines…" : "Select a machine"}
          options={eligibleMachines.map((m) => ({ value: m._id, label: `${m.name} (${m.location})` }))}
        />
        {!machinesQuery.isLoading && eligibleMachines.length === 0 && (
          <p className="text-xs text-red-600">No active {order.modality.replace("_", " ")} machines registered.</p>
        )}

        <Input label="Scheduled Time" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />

        {scheduleMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(scheduleMutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!machineAssetId || !scheduledAt}
            isLoading={scheduleMutation.isPending}
            onClick={() => scheduleMutation.mutate({ machineAssetId, scheduledAt }, { onSuccess: onClose })}
          >
            Schedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}
