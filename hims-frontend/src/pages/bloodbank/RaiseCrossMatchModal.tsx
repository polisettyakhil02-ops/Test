import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePatientByUhid } from "@/hooks/usePatient";
import { useRaiseCrossMatchRequest } from "@/hooks/useBloodBank";
import { getApiErrorMessage } from "@/lib/axios";
import { BloodGroup, BloodComponentType } from "@/types/common.types";

const formSchema = z.object({
  admissionId: z.string().optional(),
  bloodGroupRequired: z.nativeEnum(BloodGroup),
  componentType: z.nativeEnum(BloodComponentType),
  unitsRequired: z.coerce.number().int().min(1).max(20),
  urgent: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const BLOOD_GROUP_OPTIONS = Object.values(BloodGroup)
  .filter((v) => v !== BloodGroup.UNKNOWN)
  .map((v) => ({ value: v, label: v }));
const COMPONENT_OPTIONS = Object.values(BloodComponentType).map((v) => ({ value: v, label: v.replace("_", " ") }));

/** A ward's request for compatibility-tested blood — the entry point into the cross-match/reserve/dispense pipeline. */
export function RaiseCrossMatchModal({ onClose }: { onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const raiseMutation = useRaiseCrossMatchRequest();

  const { register, handleSubmit, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { unitsRequired: 1, urgent: false, componentType: BloodComponentType.PRBC },
  });

  function handleLookup() {
    setLookupUhid(uhidInput.trim() || undefined);
    if (patientQuery.data?.bloodGroup) setValue("bloodGroupRequired", patientQuery.data.bloodGroup);
  }

  const onSubmit = handleSubmit((values) => {
    if (!patientQuery.data) return;
    raiseMutation.mutate({ patientId: patientQuery.data._id, ...values }, { onSuccess: onClose });
  });

  const urgent = watch("urgent");

  return (
    <Modal isOpen onClose={onClose} title="Raise Cross-Match Request">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Patient UHID</label>
          <div className="flex gap-2">
            <Input
              value={uhidInput}
              onChange={(event) => setUhidInput(event.target.value)}
              placeholder="e.g. HIMS-26-000123"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleLookup();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={handleLookup} disabled={!uhidInput.trim()}>
              Find
            </Button>
          </div>
          {patientQuery.data && (
            <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
              {patientQuery.data.firstName} {patientQuery.data.lastName} · {patientQuery.data.bloodGroup} · {patientQuery.data.uhid}
            </p>
          )}
          {patientQuery.isError && <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(patientQuery.error)}</p>}
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Select label="Blood Group Required" options={BLOOD_GROUP_OPTIONS} placeholder="Select" {...register("bloodGroupRequired")} />
          <Select label="Component Type" options={COMPONENT_OPTIONS} {...register("componentType")} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Units Required" type="number" min={1} max={20} {...register("unitsRequired")} />
            <Input label="Admission ID (optional)" placeholder="Admission ObjectId" {...register("admissionId")} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("urgent")} />
            <span className={urgent ? "text-red-700" : ""}>Urgent</span>
          </label>

          {raiseMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(raiseMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patientQuery.data} isLoading={raiseMutation.isPending}>
              Raise Request
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
