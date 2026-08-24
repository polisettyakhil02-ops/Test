import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePatientByUhid } from "@/hooks/usePatient";
import { useCreateIvfCycle } from "@/hooks/useSpecialtyEmr";
import { getApiErrorMessage } from "@/lib/axios";
import { IvfProtocolType } from "@/types/common.types";

const formSchema = z.object({
  fertilitySpecialistId: z.string().min(1, "Required"),
  protocolType: z.nativeEnum(IvfProtocolType),
  stimulationStartDate: z.string().min(1, "Required"),
  stimulationRegimen: z.string().min(1, "Required"),
});
type FormValues = z.infer<typeof formSchema>;

const PROTOCOL_OPTIONS = Object.values(IvfProtocolType).map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

/** Opens a new ART attempt for a patient — the cycle then progresses through stimulation, retrieval, fertilization, transfer, and the beta-hCG test via the detail modal. */
export function CreateIvfCycleModal({ onClose }: { onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const createMutation = useCreateIvfCycle();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { protocolType: IvfProtocolType.ANTAGONIST } });

  function handleLookup() {
    setLookupUhid(uhidInput.trim() || undefined);
  }

  const onSubmit = handleSubmit((values) => {
    if (!patientQuery.data) return;
    createMutation.mutate({ patientId: patientQuery.data._id, ...values }, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Start IVF Cycle" widthClassName="max-w-xl">
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
            label="Fertility Specialist ID"
            placeholder="Doctor ObjectId"
            error={errors.fertilitySpecialistId?.message}
            {...register("fertilitySpecialistId")}
          />
          <Select label="Protocol" options={PROTOCOL_OPTIONS} {...register("protocolType")} />
          <Input
            label="Stimulation Start Date"
            type="date"
            error={errors.stimulationStartDate?.message}
            {...register("stimulationStartDate")}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Stimulation Regimen</label>
            <textarea
              rows={3}
              placeholder="e.g. Gonal-F 225 IU/day from Day 2, Cetrotide 0.25mg from Day 6"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register("stimulationRegimen")}
            />
            {errors.stimulationRegimen && <p className="mt-1 text-xs text-red-600">{errors.stimulationRegimen.message}</p>}
          </div>

          {createMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patientQuery.data} isLoading={createMutation.isPending}>
              Start Cycle
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
