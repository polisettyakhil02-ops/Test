import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { usePatientByUhid } from "@/hooks/usePatient";
import { useAdmitPatient } from "@/hooks/useAdmitPatient";
import { getApiErrorMessage } from "@/lib/axios";
import { AdmissionType } from "@/types/common.types";
import type { WardBedSummary } from "@/types/ipd.types";

const admitFormSchema = z.object({
  admittingDoctorId: z.string().min(1, "Required"),
  attendingDoctorId: z.string().min(1, "Required"),
  admissionType: z.nativeEnum(AdmissionType),
  provisionalDiagnosis: z.string().min(1, "Required"),
  guardianConsentObtained: z.boolean(),
});

type AdmitFormValues = z.infer<typeof admitFormSchema>;

const ADMISSION_TYPE_OPTIONS = Object.values(AdmissionType).map((value) => ({ value, label: value }));

export function AdmitPatientModal({ bed, onClose }: { bed: WardBedSummary; onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const admitMutation = useAdmitPatient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdmitFormValues>({
    resolver: zodResolver(admitFormSchema),
    defaultValues: { admissionType: AdmissionType.PLANNED, guardianConsentObtained: false },
  });

  function handleLookup() {
    setLookupUhid(uhidInput.trim() || undefined);
  }

  const onSubmit = handleSubmit((values) => {
    if (!patientQuery.data) return;
    admitMutation.mutate(
      {
        patientId: patientQuery.data._id,
        bedId: bed.id,
        wardType: bed.category,
        ...values,
      },
      { onSuccess: onClose },
    );
  });

  return (
    <Modal isOpen onClose={onClose} title={`Admit Patient — Bed ${bed.bedNumber}`}>
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
          {patientQuery.isFetching && <p className="mt-1 text-xs text-slate-500">Looking up patient…</p>}
          {patientQuery.isError && (
            <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(patientQuery.error)}</p>
          )}
          {patientQuery.data && (
            <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
              {patientQuery.data.firstName} {patientQuery.data.lastName} · {patientQuery.data.gender} ·{" "}
              {patientQuery.data.uhid}
            </p>
          )}
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Admitting Doctor ID"
              placeholder="Doctor ObjectId"
              error={errors.admittingDoctorId?.message}
              {...register("admittingDoctorId")}
            />
            <Input
              label="Attending Doctor ID"
              placeholder="Doctor ObjectId"
              error={errors.attendingDoctorId?.message}
              {...register("attendingDoctorId")}
            />
          </div>

          <Select
            label="Admission Type"
            options={ADMISSION_TYPE_OPTIONS}
            error={errors.admissionType?.message}
            {...register("admissionType")}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Provisional Diagnosis</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register("provisionalDiagnosis")}
            />
            {errors.provisionalDiagnosis && (
              <p className="mt-1 text-xs text-red-600">{errors.provisionalDiagnosis.message}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("guardianConsentObtained")} />
            Guardian/patient consent obtained
          </label>

          {admitMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {getApiErrorMessage(admitMutation.error)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patientQuery.data} isLoading={admitMutation.isPending}>
              {admitMutation.isPending ? <Spinner /> : "Admit to this bed"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
