import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useAddAncVisit, useAddPartographReading, useRecordDelivery, useDischargePostnatal } from "@/hooks/useSpecialtyEmr";
import { getApiErrorMessage } from "@/lib/axios";
import { ObstetricRecordStatus, LiquorColor, DeliveryMode, Gender } from "@/types/common.types";
import type { ObstetricRecord } from "@/types/specialtyEmr.types";
import { PartographChart } from "./PartographChart";

function patientLabel(record: ObstetricRecord): string {
  if (typeof record.patientId === "string") return record.patientId;
  return `${record.patientId.firstName} ${record.patientId.lastName} (${record.patientId.uhid})`;
}

const STATUS_TONE: Record<ObstetricRecordStatus, BadgeTone> = {
  ANTENATAL: "blue",
  IN_LABOR: "red",
  DELIVERED: "green",
  POSTNATAL_DISCHARGED: "gray",
};

export function ObstetricRecordDetailModal({ record, onClose }: { record: ObstetricRecord; onClose: () => void }) {
  const dischargeMutation = useDischargePostnatal(record._id);

  return (
    <Modal isOpen onClose={onClose} title={`Obstetric Record ${record.recordNumber}`} widthClassName="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{patientLabel(record)}</p>
          <p className="text-slate-600">
            G{record.gravida}P{record.para} · LMP {new Date(record.lmpDate).toLocaleDateString()} · EDD{" "}
            {new Date(record.eddDate).toLocaleDateString()}
          </p>
          <div className="mt-2">
            <Badge tone={STATUS_TONE[record.status]}>{record.status.replace(/_/g, " ")}</Badge>
          </div>
        </div>

        {record.status === ObstetricRecordStatus.ANTENATAL && <AncSection record={record} />}
        {(record.status === ObstetricRecordStatus.ANTENATAL || record.status === ObstetricRecordStatus.IN_LABOR) && (
          <PartographSection record={record} />
        )}
        {record.status === ObstetricRecordStatus.IN_LABOR && <DeliveryForm recordId={record._id} />}

        {record.deliveryDetails && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Delivery</p>
            <p>
              {record.deliveryDetails.deliveryMode.replace(/_/g, " ")} on{" "}
              {new Date(record.deliveryDetails.deliveryDate).toLocaleString()} — {record.deliveryDetails.babySex} baby,{" "}
              {record.deliveryDetails.babyWeightGrams}g, Apgar {record.deliveryDetails.apgarScore1Min}/{record.deliveryDetails.apgarScore5Min}
            </p>
            {record.deliveryDetails.complications && <p className="mt-1 text-xs text-emerald-800">{record.deliveryDetails.complications}</p>}
          </div>
        )}

        {record.status === ObstetricRecordStatus.DELIVERED && (
          <div className="border-t border-slate-100 pt-3">
            {dischargeMutation.isError && <p className="mb-2 text-xs text-red-600">{getApiErrorMessage(dischargeMutation.error)}</p>}
            <Button type="button" isLoading={dischargeMutation.isPending} onClick={() => dischargeMutation.mutate()}>
              Discharge Postnatal
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AncSection({ record }: { record: ObstetricRecord }) {
  const mutation = useAddAncVisit(record._id);
  const [values, setValues] = useState({
    visitDate: new Date().toISOString().slice(0, 10),
    gestationWeeks: "",
    weightKg: "",
    bloodPressureSystolic: "",
    bloodPressureDiastolic: "",
    fetalHeartRatePerMin: "",
    pedalEdema: false,
  });

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Antenatal Care Visits ({record.ancVisits.length})</p>
      {record.ancVisits.length > 0 && (
        <div className="mb-3 max-h-32 space-y-1 overflow-y-auto">
          {record.ancVisits.map((v, i) => (
            <p key={i} className="text-xs text-slate-600">
              Wk {v.gestationWeeks} ({new Date(v.visitDate).toLocaleDateString()}) — {v.weightKg}kg, BP {v.bloodPressureSystolic}/
              {v.bloodPressureDiastolic}, FHR {v.fetalHeartRatePerMin ?? "–"}
            </p>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Input label="Visit Date" type="date" value={values.visitDate} onChange={(e) => setValues({ ...values, visitDate: e.target.value })} />
        <Input
          label="Gestation (wks)"
          type="number"
          value={values.gestationWeeks}
          onChange={(e) => setValues({ ...values, gestationWeeks: e.target.value })}
        />
        <Input label="Weight (kg)" type="number" value={values.weightKg} onChange={(e) => setValues({ ...values, weightKg: e.target.value })} />
        <Input
          label="BP Systolic"
          type="number"
          value={values.bloodPressureSystolic}
          onChange={(e) => setValues({ ...values, bloodPressureSystolic: e.target.value })}
        />
        <Input
          label="BP Diastolic"
          type="number"
          value={values.bloodPressureDiastolic}
          onChange={(e) => setValues({ ...values, bloodPressureDiastolic: e.target.value })}
        />
        <Input
          label="Fetal Heart Rate"
          type="number"
          value={values.fetalHeartRatePerMin}
          onChange={(e) => setValues({ ...values, fetalHeartRatePerMin: e.target.value })}
        />
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={values.pedalEdema}
          onChange={(e) => setValues({ ...values, pedalEdema: e.target.checked })}
        />
        Pedal edema
      </label>
      {mutation.isError && <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        className="mt-2"
        disabled={!values.gestationWeeks || !values.weightKg || !values.bloodPressureSystolic || !values.bloodPressureDiastolic}
        isLoading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            visitDate: values.visitDate,
            gestationWeeks: Number(values.gestationWeeks),
            weightKg: Number(values.weightKg),
            bloodPressureSystolic: Number(values.bloodPressureSystolic),
            bloodPressureDiastolic: Number(values.bloodPressureDiastolic),
            fetalHeartRatePerMin: values.fetalHeartRatePerMin ? Number(values.fetalHeartRatePerMin) : undefined,
            pedalEdema: values.pedalEdema,
          })
        }
      >
        Add ANC Visit
      </Button>
    </div>
  );
}

function PartographSection({ record }: { record: ObstetricRecord }) {
  const mutation = useAddPartographReading(record._id);
  const [values, setValues] = useState({
    cervicalDilationCm: "",
    fetalHeartRatePerMin: "",
    contractionsPer10Min: "",
    descentOfHeadStation: "0",
    liquorColor: LiquorColor.CLEAR as LiquorColor,
    moulding: "0",
    maternalPulsePerMin: "",
    maternalSystolicBP: "",
    maternalDiastolicBP: "",
  });

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Partograph</p>
      <PartographChart readings={record.partographReadings} laborOnsetAt={record.laborOnsetAt} />

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Input
          label="Dilation (cm)"
          type="number"
          min={0}
          max={10}
          value={values.cervicalDilationCm}
          onChange={(e) => setValues({ ...values, cervicalDilationCm: e.target.value })}
        />
        <Input
          label="FHR"
          type="number"
          value={values.fetalHeartRatePerMin}
          onChange={(e) => setValues({ ...values, fetalHeartRatePerMin: e.target.value })}
        />
        <Input
          label="Contractions/10min"
          type="number"
          value={values.contractionsPer10Min}
          onChange={(e) => setValues({ ...values, contractionsPer10Min: e.target.value })}
        />
        <Input
          label="Station"
          type="number"
          min={-3}
          max={3}
          value={values.descentOfHeadStation}
          onChange={(e) => setValues({ ...values, descentOfHeadStation: e.target.value })}
        />
        <Select
          label="Liquor"
          options={Object.values(LiquorColor).map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
          value={values.liquorColor}
          onChange={(e) => setValues({ ...values, liquorColor: e.target.value as LiquorColor })}
        />
        <Input
          label="Maternal Pulse"
          type="number"
          value={values.maternalPulsePerMin}
          onChange={(e) => setValues({ ...values, maternalPulsePerMin: e.target.value })}
        />
        <Input
          label="Maternal Sys BP"
          type="number"
          value={values.maternalSystolicBP}
          onChange={(e) => setValues({ ...values, maternalSystolicBP: e.target.value })}
        />
        <Input
          label="Maternal Dia BP"
          type="number"
          value={values.maternalDiastolicBP}
          onChange={(e) => setValues({ ...values, maternalDiastolicBP: e.target.value })}
        />
      </div>
      {mutation.isError && <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        className="mt-2"
        disabled={
          !values.cervicalDilationCm ||
          !values.fetalHeartRatePerMin ||
          !values.contractionsPer10Min ||
          !values.maternalPulsePerMin ||
          !values.maternalSystolicBP ||
          !values.maternalDiastolicBP
        }
        isLoading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            recordedAt: new Date().toISOString(),
            cervicalDilationCm: Number(values.cervicalDilationCm),
            fetalHeartRatePerMin: Number(values.fetalHeartRatePerMin),
            contractionsPer10Min: Number(values.contractionsPer10Min),
            descentOfHeadStation: Number(values.descentOfHeadStation),
            liquorColor: values.liquorColor,
            moulding: Number(values.moulding) as 0 | 1 | 2 | 3,
            maternalPulsePerMin: Number(values.maternalPulsePerMin),
            maternalSystolicBP: Number(values.maternalSystolicBP),
            maternalDiastolicBP: Number(values.maternalDiastolicBP),
          })
        }
      >
        Plot Reading
      </Button>
    </div>
  );
}

function DeliveryForm({ recordId }: { recordId: string }) {
  const mutation = useRecordDelivery(recordId);
  const [values, setValues] = useState({
    deliveryDate: new Date().toISOString().slice(0, 16),
    deliveryMode: DeliveryMode.VAGINAL_NORMAL as DeliveryMode,
    babyWeightGrams: "",
    apgarScore1Min: "",
    apgarScore5Min: "",
    babySex: Gender.MALE as Gender,
    isLiveBirth: true,
    complications: "",
    conductedByDoctorId: "",
  });

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Record Delivery</p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Delivery Date/Time"
          type="datetime-local"
          value={values.deliveryDate}
          onChange={(e) => setValues({ ...values, deliveryDate: e.target.value })}
        />
        <Select
          label="Delivery Mode"
          options={Object.values(DeliveryMode).map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
          value={values.deliveryMode}
          onChange={(e) => setValues({ ...values, deliveryMode: e.target.value as DeliveryMode })}
        />
        <Input
          label="Baby Weight (g)"
          type="number"
          value={values.babyWeightGrams}
          onChange={(e) => setValues({ ...values, babyWeightGrams: e.target.value })}
        />
        <Select
          label="Baby Sex"
          options={[Gender.MALE, Gender.FEMALE, Gender.OTHER].map((v) => ({ value: v, label: v }))}
          value={values.babySex}
          onChange={(e) => setValues({ ...values, babySex: e.target.value as Gender })}
        />
        <Input
          label="Apgar (1 min)"
          type="number"
          min={0}
          max={10}
          value={values.apgarScore1Min}
          onChange={(e) => setValues({ ...values, apgarScore1Min: e.target.value })}
        />
        <Input
          label="Apgar (5 min)"
          type="number"
          min={0}
          max={10}
          value={values.apgarScore5Min}
          onChange={(e) => setValues({ ...values, apgarScore5Min: e.target.value })}
        />
        <Input
          label="Conducted By (Doctor ID)"
          placeholder="Doctor ObjectId"
          value={values.conductedByDoctorId}
          onChange={(e) => setValues({ ...values, conductedByDoctorId: e.target.value })}
        />
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={values.isLiveBirth}
          onChange={(e) => setValues({ ...values, isLiveBirth: e.target.checked })}
        />
        Live birth
      </label>
      <Input
        label="Complications (optional)"
        className="mt-2"
        value={values.complications}
        onChange={(e) => setValues({ ...values, complications: e.target.value })}
      />
      {mutation.isError && <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        className="mt-2"
        disabled={!values.babyWeightGrams || !values.apgarScore1Min || !values.apgarScore5Min || !values.conductedByDoctorId.trim()}
        isLoading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            deliveryDate: values.deliveryDate,
            deliveryMode: values.deliveryMode,
            babyWeightGrams: Number(values.babyWeightGrams),
            apgarScore1Min: Number(values.apgarScore1Min),
            apgarScore5Min: Number(values.apgarScore5Min),
            babySex: values.babySex,
            isLiveBirth: values.isLiveBirth,
            complications: values.complications.trim() || undefined,
            conductedByDoctorId: values.conductedByDoctorId.trim(),
          })
        }
      >
        Record Delivery
      </Button>
    </div>
  );
}
