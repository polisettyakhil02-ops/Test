import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useRecordVaccineAdministered, useSkipPediatricDose, useAddGrowthChartEntry } from "@/hooks/useSpecialtyEmr";
import { getApiErrorMessage } from "@/lib/axios";
import { VaccinationDoseStatus } from "@/types/common.types";
import type { PediatricRecord, VaccinationDose } from "@/types/specialtyEmr.types";
import { GrowthChart } from "./GrowthChart";

function patientLabel(record: PediatricRecord): string {
  if (typeof record.patientId === "string") return record.patientId;
  return `${record.patientId.firstName} ${record.patientId.lastName} (${record.patientId.uhid})`;
}

const STATUS_TONE: Record<VaccinationDoseStatus, BadgeTone> = {
  DUE: "yellow",
  ADMINISTERED: "green",
  MISSED: "red",
  SKIPPED: "gray",
};

export function PediatricRecordDetailModal({ record, onClose }: { record: PediatricRecord; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={`Pediatric EMR ${record.recordNumber}`} widthClassName="max-w-3xl">
      <div className="space-y-4">
        <p className="text-sm font-medium text-slate-900">{patientLabel(record)}</p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Growth Chart</p>
          <GrowthChart entries={record.growthChartEntries} />
          <AddMeasurementForm recordId={record._id} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vaccination Schedule ({record.vaccinationSchedule.filter((d) => d.status === VaccinationDoseStatus.ADMINISTERED).length}/
            {record.vaccinationSchedule.length} given)
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {record.vaccinationSchedule.map((dose, i) => (
              <VaccinationRow key={i} recordId={record._id} dose={dose} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function VaccinationRow({ recordId, dose }: { recordId: string; dose: VaccinationDose }) {
  const administerMutation = useRecordVaccineAdministered(recordId);
  const skipMutation = useSkipPediatricDose(recordId);
  const [showForm, setShowForm] = useState(false);
  const [administeredDate, setAdministeredDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchNumber, setBatchNumber] = useState("");

  const isDue = dose.status === VaccinationDoseStatus.DUE || dose.status === VaccinationDoseStatus.MISSED;

  return (
    <div className="rounded-md border border-slate-200 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-800">
            {dose.vaccineName} — Dose {dose.doseNumber}
          </p>
          <p className="text-xs text-slate-500">
            Due {new Date(dose.dueDate).toLocaleDateString()}
            {dose.administeredDate && ` · given ${new Date(dose.administeredDate).toLocaleDateString()}`}
            {dose.batchNumber && ` · batch ${dose.batchNumber}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[dose.status]}>{dose.status}</Badge>
          {isDue && !showForm && (
            <>
              <Button type="button" size="sm" onClick={() => setShowForm(true)}>
                Administer
              </Button>
              <Button type="button" size="sm" variant="ghost" isLoading={skipMutation.isPending} onClick={() => skipMutation.mutate({ vaccineName: dose.vaccineName, doseNumber: dose.doseNumber })}>
                Skip
              </Button>
            </>
          )}
        </div>
      </div>
      {showForm && (
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
          <Input label="Date Given" type="date" value={administeredDate} onChange={(e) => setAdministeredDate(e.target.value)} />
          <Input label="Batch Number" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          <Button
            type="button"
            size="sm"
            disabled={!batchNumber.trim()}
            isLoading={administerMutation.isPending}
            onClick={() =>
              administerMutation.mutate(
                { vaccineName: dose.vaccineName, doseNumber: dose.doseNumber, administeredDate, batchNumber: batchNumber.trim() },
                { onSuccess: () => setShowForm(false) },
              )
            }
          >
            Save
          </Button>
          {administerMutation.isError && <p className="w-full text-xs text-red-600">{getApiErrorMessage(administerMutation.error)}</p>}
        </div>
      )}
    </div>
  );
}

function AddMeasurementForm({ recordId }: { recordId: string }) {
  const mutation = useAddGrowthChartEntry(recordId);
  const [values, setValues] = useState({
    recordedAt: new Date().toISOString().slice(0, 10),
    weightKg: "",
    heightCm: "",
    headCircumferenceCm: "",
  });

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-2">
      <Input label="Date" type="date" value={values.recordedAt} onChange={(e) => setValues({ ...values, recordedAt: e.target.value })} />
      <Input label="Weight (kg)" type="number" step="0.1" value={values.weightKg} onChange={(e) => setValues({ ...values, weightKg: e.target.value })} />
      <Input label="Height (cm)" type="number" step="0.1" value={values.heightCm} onChange={(e) => setValues({ ...values, heightCm: e.target.value })} />
      <Input
        label="Head Circ. (cm)"
        type="number"
        step="0.1"
        value={values.headCircumferenceCm}
        onChange={(e) => setValues({ ...values, headCircumferenceCm: e.target.value })}
      />
      <Button
        type="button"
        size="sm"
        disabled={!values.weightKg || !values.heightCm}
        isLoading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            recordedAt: values.recordedAt,
            weightKg: Number(values.weightKg),
            heightCm: Number(values.heightCm),
            headCircumferenceCm: values.headCircumferenceCm ? Number(values.headCircumferenceCm) : undefined,
          })
        }
      >
        Add Measurement
      </Button>
      {mutation.isError && <p className="w-full text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
    </div>
  );
}
