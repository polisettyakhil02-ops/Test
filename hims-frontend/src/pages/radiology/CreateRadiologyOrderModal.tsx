import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePatientByUhid } from "@/hooks/usePatient";
import { useCreateRadiologyOrder } from "@/hooks/useRadiology";
import { getApiErrorMessage } from "@/lib/axios";
import { EncounterType, ImagingModality, LabOrderPriority } from "@/types/common.types";

const formSchema = z.object({
  orderingDoctorId: z.string().min(1, "Required"),
  encounterType: z.nativeEnum(EncounterType),
  modality: z.nativeEnum(ImagingModality),
  bodyPart: z.string().min(1, "Required"),
  clinicalIndication: z.string().min(1, "Required"),
  contrastRequired: z.boolean(),
  priority: z.nativeEnum(LabOrderPriority),
});
type FormValues = z.infer<typeof formSchema>;

const MODALITY_OPTIONS = Object.values(ImagingModality).map((v) => ({ value: v, label: v.replace("_", " ") }));
const ENCOUNTER_OPTIONS = Object.values(EncounterType).map((v) => ({ value: v, label: v }));
const PRIORITY_OPTIONS = Object.values(LabOrderPriority).map((v) => ({ value: v, label: v }));

/** Places an imaging order — the same UHID-lookup pattern every other order-entry form in this app uses. */
export function CreateRadiologyOrderModal({ onClose }: { onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const createMutation = useCreateRadiologyOrder();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      encounterType: EncounterType.OPD,
      modality: ImagingModality.XRAY,
      contrastRequired: false,
      priority: LabOrderPriority.ROUTINE,
    },
  });

  function handleLookup() {
    setLookupUhid(uhidInput.trim() || undefined);
  }

  const onSubmit = handleSubmit((values) => {
    if (!patientQuery.data) return;
    createMutation.mutate({ patientId: patientQuery.data._id, ...values }, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="New Imaging Order" widthClassName="max-w-xl">
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
              {patientQuery.data.firstName} {patientQuery.data.lastName} · {patientQuery.data.uhid}
            </p>
          )}
          {patientQuery.isError && <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(patientQuery.error)}</p>}
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            label="Ordering Doctor ID"
            placeholder="Doctor ObjectId"
            error={errors.orderingDoctorId?.message}
            {...register("orderingDoctorId")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Encounter Type" options={ENCOUNTER_OPTIONS} {...register("encounterType")} />
            <Select label="Modality" options={MODALITY_OPTIONS} {...register("modality")} />
          </div>
          <Input label="Body Part / Study" placeholder="e.g. Chest PA" error={errors.bodyPart?.message} {...register("bodyPart")} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Clinical Indication</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register("clinicalIndication")}
            />
            {errors.clinicalIndication && <p className="mt-1 text-xs text-red-600">{errors.clinicalIndication.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Priority" options={PRIORITY_OPTIONS} {...register("priority")} />
            <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("contrastRequired")} />
              Contrast required
            </label>
          </div>

          {createMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patientQuery.data} isLoading={createMutation.isPending}>
              Place Order
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
