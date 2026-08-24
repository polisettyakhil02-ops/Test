import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { usePatientByUhid } from "@/hooks/usePatient";
import { useDialysisMachines, useScheduleDialysisSession } from "@/hooks/useDialysis";
import { getApiErrorMessage } from "@/lib/axios";
import { DialysisShift, VascularAccessType } from "@/types/common.types";

const formSchema = z.object({
  machineAssetId: z.string().min(1, "Required"),
  nephrologistId: z.string().min(1, "Required"),
  technicianUserId: z.string().min(1, "Required"),
  shift: z.nativeEnum(DialysisShift),
  scheduledStart: z.string().min(1, "Required"),
  scheduledEnd: z.string().min(1, "Required"),
  vascularAccessType: z.nativeEnum(VascularAccessType),
  preDialysisWeightKg: z.coerce.number().positive("Required"),
  heparinDoseUnits: z.coerce.number().min(0),
  targetUltrafiltrationVolumeMl: z.coerce.number().min(0),
  preDialysisSystolicBP: z.coerce.number().optional(),
  preDialysisDiastolicBP: z.coerce.number().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const SHIFT_OPTIONS = Object.values(DialysisShift).map((v) => ({ value: v, label: v }));
const ACCESS_OPTIONS = Object.values(VascularAccessType).map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

/** Books a machine slot — rejected server-side if it overlaps any other booking on that same machine, the same double-booking guard the OT Scheduler uses for theatre rooms. */
export function ScheduleSessionModal({ onClose }: { onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const machinesQuery = useDialysisMachines();
  const scheduleMutation = useScheduleDialysisSession();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { shift: DialysisShift.MORNING, vascularAccessType: VascularAccessType.AV_FISTULA },
  });

  function handleLookup() {
    setLookupUhid(uhidInput.trim() || undefined);
  }

  const onSubmit = handleSubmit((values) => {
    if (!patientQuery.data) return;
    scheduleMutation.mutate({ patientId: patientQuery.data._id, ...values }, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Schedule Dialysis Session" widthClassName="max-w-xl">
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
          <Select
            label="Machine"
            placeholder={machinesQuery.isLoading ? "Loading machines…" : "Select a machine"}
            options={(machinesQuery.data ?? []).map((m) => ({ value: m._id, label: `${m.name} (${m.location})` }))}
            error={errors.machineAssetId?.message}
            {...register("machineAssetId")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nephrologist ID"
              placeholder="Doctor ObjectId"
              error={errors.nephrologistId?.message}
              {...register("nephrologistId")}
            />
            <Input
              label="Technician User ID"
              placeholder="Staff ObjectId"
              error={errors.technicianUserId?.message}
              {...register("technicianUserId")}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="Shift" options={SHIFT_OPTIONS} {...register("shift")} />
            <Input label="Start" type="datetime-local" error={errors.scheduledStart?.message} {...register("scheduledStart")} />
            <Input label="End" type="datetime-local" error={errors.scheduledEnd?.message} {...register("scheduledEnd")} />
          </div>

          <Select label="Vascular Access" options={ACCESS_OPTIONS} {...register("vascularAccessType")} />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Pre-Weight (kg)"
              type="number"
              step="0.1"
              error={errors.preDialysisWeightKg?.message}
              {...register("preDialysisWeightKg")}
            />
            <Input label="Heparin Dose (units)" type="number" {...register("heparinDoseUnits")} />
            <Input label="Target UF (ml)" type="number" {...register("targetUltrafiltrationVolumeMl")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Pre Systolic BP" type="number" {...register("preDialysisSystolicBP")} />
            <Input label="Pre Diastolic BP" type="number" {...register("preDialysisDiastolicBP")} />
          </div>
          <Input label="Notes" {...register("notes")} />

          {scheduleMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(scheduleMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patientQuery.data} isLoading={scheduleMutation.isPending}>
              Book Session
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
