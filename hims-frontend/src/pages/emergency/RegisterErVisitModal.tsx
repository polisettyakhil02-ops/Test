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
import { useRegisterErVisit } from "@/hooks/useEmergency";
import { getApiErrorMessage } from "@/lib/axios";
import { TriagePriority, ERArrivalMode } from "@/types/common.types";
import { TRIAGE_COLUMN_STYLE, TRIAGE_ORDER } from "./triageStyle";
import { cn } from "@/lib/cn";

const ARRIVAL_MODE_OPTIONS = Object.values(ERArrivalMode).map((value) => ({ value, label: value.replace("_", " ") }));

const registerFormSchema = z
  .object({
    chiefComplaint: z.string().min(1, "Required"),
    arrivalMode: z.nativeEnum(ERArrivalMode),
    triagePriority: z.nativeEnum(TriagePriority),
    triageNotes: z.string().optional(),
    isMedicoLegalCase: z.boolean(),
    mlcNumber: z.string().optional(),
    policeStationName: z.string().optional(),
    mlcRemarks: z.string().optional(),
  })
  .refine((values) => !values.isMedicoLegalCase || Boolean(values.mlcNumber?.trim()), {
    message: "MLC number is required for a medico-legal case",
    path: ["mlcNumber"],
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

/** The Triage Board's "New Arrival" action: looks a patient up by UHID, then triages and registers the ER visit in one step. */
export function RegisterErVisitModal({ onClose }: { onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const registerMutation = useRegisterErVisit();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { arrivalMode: ERArrivalMode.WALK_IN, triagePriority: TriagePriority.YELLOW, isMedicoLegalCase: false },
  });

  const triagePriority = watch("triagePriority");
  const isMlc = watch("isMedicoLegalCase");

  function handleLookup() {
    setLookupUhid(uhidInput.trim() || undefined);
  }

  const onSubmit = handleSubmit((values) => {
    if (!patientQuery.data) return;
    registerMutation.mutate({ patientId: patientQuery.data._id, ...values }, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="New ER Arrival" widthClassName="max-w-xl">
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
          {patientQuery.isError && <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(patientQuery.error)}</p>}
          {patientQuery.data && (
            <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
              {patientQuery.data.firstName} {patientQuery.data.lastName} · {patientQuery.data.gender} · {patientQuery.data.uhid}
            </p>
          )}
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Triage Priority</label>
            <div className="grid grid-cols-4 gap-2">
              {TRIAGE_ORDER.map((priority) => {
                const style = TRIAGE_COLUMN_STYLE[priority];
                const isActive = triagePriority === priority;
                return (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setValue("triagePriority", priority)}
                    className={cn(
                      "rounded-md px-2 py-2 text-xs font-bold uppercase tracking-wide transition-opacity",
                      style.headerClassName,
                      !isActive && "opacity-40 hover:opacity-70",
                    )}
                  >
                    {style.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Chief Complaint</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register("chiefComplaint")}
            />
            {errors.chiefComplaint && <p className="mt-1 text-xs text-red-600">{errors.chiefComplaint.message}</p>}
          </div>

          <Select label="Arrival Mode" options={ARRIVAL_MODE_OPTIONS} {...register("arrivalMode")} />

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Triage Notes</label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              {...register("triageNotes")}
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("isMedicoLegalCase")} />
            Medico-Legal Case (MLC)
          </label>

          {isMlc && (
            <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
              <Input label="MLC / FIR Number" error={errors.mlcNumber?.message} {...register("mlcNumber")} />
              <Input label="Police Station" {...register("policeStationName")} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">MLC Remarks</label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  {...register("mlcRemarks")}
                />
              </div>
            </div>
          )}

          {registerMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(registerMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!patientQuery.data} isLoading={registerMutation.isPending}>
              {registerMutation.isPending ? <Spinner /> : "Register & Triage"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
