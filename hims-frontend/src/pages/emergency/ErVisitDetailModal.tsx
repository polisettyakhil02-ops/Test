import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import {
  useErBays,
  useAssignBay,
  useEmergencyEmrHistory,
  useRecordPrimaryAssessment,
  useConvertToIpdAdmission,
  useDischargeErVisit,
} from "@/hooks/useEmergency";
import { getApiErrorMessage } from "@/lib/axios";
import { AirwayStatus, BedStatus, ERVisitStatus } from "@/types/common.types";
import type { ERVisit } from "@/types/emergency.types";
import { TRIAGE_COLUMN_STYLE, minutesSince } from "./triageStyle";
import { cn } from "@/lib/cn";

function patientName(visit: ERVisit): string {
  if (typeof visit.patientId === "string") return visit.patientId;
  return `${visit.patientId.firstName} ${visit.patientId.lastName}`;
}

const assessmentSchema = z.object({
  airwayStatus: z.nativeEnum(AirwayStatus),
  airwayNotes: z.string().optional(),
  breathingRatePerMin: z.coerce.number().optional(),
  breathingSpo2Percent: z.coerce.number().optional(),
  breathingNotes: z.string().optional(),
  circulationPulseRatePerMin: z.coerce.number().optional(),
  circulationSystolicBP: z.coerce.number().optional(),
  circulationDiastolicBP: z.coerce.number().optional(),
  circulationNotes: z.string().optional(),
  disabilityGcsScore: z.coerce.number().min(3).max(15).optional(),
  disabilityNotes: z.string().optional(),
  exposureNotes: z.string().optional(),
  overallImpression: z.string().optional(),
});
type AssessmentValues = z.infer<typeof assessmentSchema>;

function PrimaryAssessmentPanel({ erVisitId }: { erVisitId: string }) {
  const historyQuery = useEmergencyEmrHistory(erVisitId);
  const recordMutation = useRecordPrimaryAssessment(erVisitId);
  const { register, handleSubmit, reset } = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: { airwayStatus: AirwayStatus.PATENT },
  });

  const onSubmit = handleSubmit((values) => {
    recordMutation.mutate(values, { onSuccess: () => reset({ airwayStatus: AirwayStatus.PATENT }) });
  });

  return (
    <div className="space-y-3">
      {historyQuery.data && historyQuery.data.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          {historyQuery.data
            .slice()
            .reverse()
            .map((entry) => (
              <div key={entry._id}>
                <span className="font-medium text-slate-800">{new Date(entry.recordedAt).toLocaleTimeString()}</span> — A:
                {entry.airwayStatus} {entry.breathingSpo2Percent != null && `· SpO2 ${entry.breathingSpo2Percent}%`}{" "}
                {entry.circulationPulseRatePerMin != null && `· HR ${entry.circulationPulseRatePerMin}`}{" "}
                {entry.disabilityGcsScore != null && `· GCS ${entry.disabilityGcsScore}`}
              </div>
            ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-slate-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ABCDE Primary Assessment</p>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="A — Airway"
            options={Object.values(AirwayStatus).map((v) => ({ value: v, label: v }))}
            {...register("airwayStatus")}
          />
          <Input label="B — Resp. Rate /min" type="number" {...register("breathingRatePerMin")} />
          <Input label="B — SpO2 %" type="number" {...register("breathingSpo2Percent")} />
          <Input label="C — Pulse /min" type="number" {...register("circulationPulseRatePerMin")} />
          <Input label="C — Systolic BP" type="number" {...register("circulationSystolicBP")} />
          <Input label="C — Diastolic BP" type="number" {...register("circulationDiastolicBP")} />
          <Input label="D — GCS (3-15)" type="number" min={3} max={15} {...register("disabilityGcsScore")} />
          <Input label="E — Exposure notes" {...register("exposureNotes")} />
        </div>
        <Input label="Overall Impression" {...register("overallImpression")} />
        {recordMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(recordMutation.error)}</p>
        )}
        <Button type="submit" size="sm" isLoading={recordMutation.isPending}>
          Save Assessment
        </Button>
      </form>
    </div>
  );
}

const convertSchema = z.object({
  bedId: z.string().min(1, "Required"),
  attendingDoctorId: z.string().min(1, "Required"),
  provisionalDiagnosis: z.string().min(1, "Required"),
  guardianConsentObtained: z.boolean(),
});
type ConvertValues = z.infer<typeof convertSchema>;

function ConvertToAdmissionPanel({ erVisitId, onDone }: { erVisitId: string; onDone: () => void }) {
  const convertMutation = useConvertToIpdAdmission(erVisitId);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConvertValues>({ resolver: zodResolver(convertSchema), defaultValues: { guardianConsentObtained: false } });

  const onSubmit = handleSubmit((values) => {
    convertMutation.mutate(values, { onSuccess: onDone });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Convert to IPD Admission</p>
      <Input label="Bed ID" placeholder="Vacant bed ObjectId" error={errors.bedId?.message} {...register("bedId")} />
      <Input
        label="Attending Doctor ID"
        placeholder="Doctor ObjectId"
        error={errors.attendingDoctorId?.message}
        {...register("attendingDoctorId")}
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Provisional Diagnosis</label>
        <textarea
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          {...register("provisionalDiagnosis")}
        />
        {errors.provisionalDiagnosis && <p className="mt-1 text-xs text-red-600">{errors.provisionalDiagnosis.message}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("guardianConsentObtained")} />
        Guardian/patient consent obtained
      </label>
      {convertMutation.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(convertMutation.error)}</p>
      )}
      <Button type="submit" variant="primary" isLoading={convertMutation.isPending}>
        {convertMutation.isPending ? <Spinner /> : "Confirm Admission"}
      </Button>
    </form>
  );
}

const TERMINAL_DISPOSITIONS = [
  ERVisitStatus.DISCHARGED,
  ERVisitStatus.LAMA,
  ERVisitStatus.DECEASED,
  ERVisitStatus.TRANSFERRED_OUT,
];

function DischargePanel({ erVisitId, onDone }: { erVisitId: string; onDone: () => void }) {
  const dischargeMutation = useDischargeErVisit(erVisitId);
  const [status, setStatus] = useState<ERVisitStatus>(ERVisitStatus.DISCHARGED);
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3 rounded-md border border-slate-300 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Close Visit (No IPD Admission)</p>
      <Select
        label="Disposition"
        value={status}
        onChange={(event) => setStatus(event.target.value as ERVisitStatus)}
        options={TERMINAL_DISPOSITIONS.map((value) => ({ value, label: value.replace("_", " ") }))}
      />
      <Input label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      {dischargeMutation.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(dischargeMutation.error)}</p>
      )}
      <Button
        type="button"
        variant="secondary"
        isLoading={dischargeMutation.isPending}
        onClick={() => dischargeMutation.mutate({ status, dispositionNotes: notes || undefined }, { onSuccess: onDone })}
      >
        Confirm Disposition
      </Button>
    </div>
  );
}

/** Opened by clicking a Triage Board card: assign a bay, record ABCDE reassessments, and drive the visit to its disposition — including the one-click IPD admission. */
export function ErVisitDetailModal({ visit, onClose }: { visit: ERVisit; onClose: () => void }) {
  const [activeAction, setActiveAction] = useState<"assessment" | "convert" | "discharge" | null>(null);
  const [bayId, setBayId] = useState("");
  const bayQuery = useErBays();
  const assignBayMutation = useAssignBay(visit._id);

  const style = TRIAGE_COLUMN_STYLE[visit.triagePriority];
  const isActive = visit.status === ERVisitStatus.WAITING || visit.status === ERVisitStatus.IN_TREATMENT;
  const vacantBays = bayQuery.data?.filter((bay) => bay.status === BedStatus.VACANT) ?? [];

  return (
    <Modal isOpen onClose={onClose} title={`ER Visit ${visit.erVisitNumber}`} widthClassName="max-w-2xl">
      <div className="space-y-4">
        <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md p-3", style.cardClassName)}>
          <div>
            <p className="text-base font-semibold text-slate-900">{patientName(visit)}</p>
            <p className="text-sm text-slate-600">{visit.chiefComplaint}</p>
            <p className="mt-1 text-xs text-slate-500">
              Arrived {minutesSince(visit.arrivedAt)}m ago · {visit.arrivalMode.replace("_", " ")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={cn("rounded-full px-3 py-1 text-xs font-bold uppercase", style.headerClassName)}>
              {style.shortLabel}
            </span>
            <Badge tone="gray">{visit.status.replace("_", " ")}</Badge>
            {visit.isMedicoLegalCase && <Badge tone="purple">MLC {visit.mlcNumber}</Badge>}
          </div>
        </div>

        {isActive && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-3">
            <div className="min-w-[220px] flex-1">
              <Select
                label="Assign ER Bay"
                value={bayId}
                onChange={(event) => setBayId(event.target.value)}
                placeholder="Choose a vacant bay"
                options={vacantBays.map((bay) => ({ value: bay._id, label: `${bay.bayNumber} (${bay.bayType})` }))}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!bayId}
              isLoading={assignBayMutation.isPending}
              onClick={() => assignBayMutation.mutate({ bayId })}
            >
              Assign Bay
            </Button>
          </div>
        )}
        {assignBayMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(assignBayMutation.error)}</p>
        )}

        {isActive && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeAction === "assessment" ? "secondary" : "outline"}
              onClick={() => setActiveAction(activeAction === "assessment" ? null : "assessment")}
            >
              Primary Assessment
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeAction === "convert" ? "primary" : "outline"}
              onClick={() => setActiveAction(activeAction === "convert" ? null : "convert")}
            >
              Admit to IPD
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeAction === "discharge" ? "secondary" : "outline"}
              onClick={() => setActiveAction(activeAction === "discharge" ? null : "discharge")}
            >
              Discharge / Disposition
            </Button>
          </div>
        )}

        {activeAction === "assessment" && <PrimaryAssessmentPanel erVisitId={visit._id} />}
        {activeAction === "convert" && <ConvertToAdmissionPanel erVisitId={visit._id} onDone={onClose} />}
        {activeAction === "discharge" && <DischargePanel erVisitId={visit._id} onDone={onClose} />}

        {!isActive && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            This visit is closed ({visit.status.replace("_", " ")}). {visit.dispositionNotes}
          </p>
        )}
      </div>
    </Modal>
  );
}
