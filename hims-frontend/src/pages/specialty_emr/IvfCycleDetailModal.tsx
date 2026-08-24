import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import {
  useAddIvfMonitoringVisit,
  useRecordIvfTrigger,
  useRecordEggRetrieval,
  useRecordFertilizationOutcome,
  useAddEmbryoTransfer,
  useRecordLutealSupport,
  useRecordBetaHcgResult,
  useCancelIvfCycle,
} from "@/hooks/useSpecialtyEmr";
import { getApiErrorMessage } from "@/lib/axios";
import { IvfCycleStatus, FertilizationMethod, EmbryoStage } from "@/types/common.types";
import type { IvfCycle } from "@/types/specialtyEmr.types";

function patientLabel(cycle: IvfCycle): string {
  if (typeof cycle.patientId === "string") return cycle.patientId;
  return `${cycle.patientId.firstName} ${cycle.patientId.lastName} (${cycle.patientId.uhid})`;
}

const STATUS_TONE: Record<IvfCycleStatus, BadgeTone> = {
  STIMULATION: "blue",
  TRIGGERED: "purple",
  RETRIEVAL_DONE: "purple",
  FERTILIZATION_DONE: "purple",
  EMBRYO_TRANSFERRED: "yellow",
  LUTEAL_SUPPORT: "yellow",
  PREGNANCY_CONFIRMED: "green",
  NOT_PREGNANT: "gray",
  CANCELLED: "red",
};

/**
 * One modal that walks the cycle through every stage of the ART pipeline —
 * which form renders is driven entirely by `cycle.status`, so the
 * fertility team is never shown a step that's already been recorded or one
 * that can't happen yet.
 */
export function IvfCycleDetailModal({ cycle, onClose }: { cycle: IvfCycle; onClose: () => void }) {
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const cancelMutation = useCancelIvfCycle(cycle._id);

  const isActive = cycle.status !== IvfCycleStatus.CANCELLED && cycle.status !== IvfCycleStatus.PREGNANCY_CONFIRMED && cycle.status !== IvfCycleStatus.NOT_PREGNANT;

  return (
    <Modal isOpen onClose={onClose} title={`IVF Cycle ${cycle.cycleNumber}`} widthClassName="max-w-2xl">
      <div className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{patientLabel(cycle)}</p>
          <p className="text-slate-600">
            {cycle.protocolType.replace(/_/g, " ")} · started {new Date(cycle.stimulationStartDate).toLocaleDateString()}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[cycle.status]}>{cycle.status.replace(/_/g, " ")}</Badge>
          </div>
        </div>

        {cycle.monitoringVisits.length > 0 && (
          <div className="rounded-md border border-slate-200 p-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Monitoring Visits</p>
            <div className="space-y-1">
              {cycle.monitoringVisits.map((visit, index) => (
                <p key={index} className="text-xs text-slate-600">
                  Day {visit.cycleDay} ({new Date(visit.visitDate).toLocaleDateString()}) — follicles L{visit.leftOvaryFollicleCount ?? "–"}/R
                  {visit.rightOvaryFollicleCount ?? "–"}, lead {visit.leadFollicleSizeMm ?? "–"}mm, endometrium{" "}
                  {visit.endometrialThicknessMm ?? "–"}mm
                </p>
              ))}
            </div>
          </div>
        )}

        {cycle.status === IvfCycleStatus.STIMULATION && <MonitoringVisitForm cycleId={cycle._id} />}
        {cycle.status === IvfCycleStatus.STIMULATION && <TriggerForm cycleId={cycle._id} />}
        {cycle.status === IvfCycleStatus.TRIGGERED && <EggRetrievalForm cycleId={cycle._id} />}
        {cycle.status === IvfCycleStatus.RETRIEVAL_DONE && <FertilizationOutcomeForm cycleId={cycle._id} />}
        {cycle.status === IvfCycleStatus.FERTILIZATION_DONE && <EmbryoTransferForm cycleId={cycle._id} />}
        {cycle.status === IvfCycleStatus.EMBRYO_TRANSFERRED && <LutealSupportForm cycleId={cycle._id} />}
        {(cycle.status === IvfCycleStatus.EMBRYO_TRANSFERRED || cycle.status === IvfCycleStatus.LUTEAL_SUPPORT) && (
          <BetaHcgForm cycleId={cycle._id} />
        )}

        {(cycle.status === IvfCycleStatus.PREGNANCY_CONFIRMED || cycle.status === IvfCycleStatus.NOT_PREGNANT) && (
          <div className={`rounded-md border p-3 text-sm ${cycle.isPregnant ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <p className="font-medium">{cycle.isPregnant ? "Pregnancy confirmed" : "Not pregnant"}</p>
            <p className="text-xs text-slate-600">
              Beta-hCG {cycle.betaHcgResultMIUmL} mIU/mL on {cycle.betaHcgTestDate && new Date(cycle.betaHcgTestDate).toLocaleDateString()}
            </p>
          </div>
        )}

        {cycle.status === IvfCycleStatus.CANCELLED && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Cancelled: {cycle.cancellationReason}</p>
        )}

        {isActive && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            {!showCancel ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCancel(true)}>
                Cancel Cycle
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input placeholder="Reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="flex-1" />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={!cancelReason.trim()}
                  isLoading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate({ reason: cancelReason }, { onSuccess: onClose })}
                >
                  Confirm
                </Button>
              </div>
            )}
            {cancelMutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(cancelMutation.error)}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MonitoringVisitForm({ cycleId }: { cycleId: string }) {
  const mutation = useAddIvfMonitoringVisit(cycleId);
  const [values, setValues] = useState({
    visitDate: new Date().toISOString().slice(0, 10),
    cycleDay: "",
    leftOvaryFollicleCount: "",
    rightOvaryFollicleCount: "",
    leadFollicleSizeMm: "",
    endometrialThicknessMm: "",
  });

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add Monitoring Visit</p>
      <div className="grid grid-cols-3 gap-2">
        <Input label="Visit Date" type="date" value={values.visitDate} onChange={(e) => setValues({ ...values, visitDate: e.target.value })} />
        <Input label="Cycle Day" type="number" value={values.cycleDay} onChange={(e) => setValues({ ...values, cycleDay: e.target.value })} />
        <Input
          label="Lead Follicle (mm)"
          type="number"
          value={values.leadFollicleSizeMm}
          onChange={(e) => setValues({ ...values, leadFollicleSizeMm: e.target.value })}
        />
        <Input
          label="L. Follicles"
          type="number"
          value={values.leftOvaryFollicleCount}
          onChange={(e) => setValues({ ...values, leftOvaryFollicleCount: e.target.value })}
        />
        <Input
          label="R. Follicles"
          type="number"
          value={values.rightOvaryFollicleCount}
          onChange={(e) => setValues({ ...values, rightOvaryFollicleCount: e.target.value })}
        />
        <Input
          label="Endometrium (mm)"
          type="number"
          value={values.endometrialThicknessMm}
          onChange={(e) => setValues({ ...values, endometrialThicknessMm: e.target.value })}
        />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        disabled={!values.cycleDay}
        isLoading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            visitDate: values.visitDate,
            cycleDay: Number(values.cycleDay),
            leftOvaryFollicleCount: values.leftOvaryFollicleCount ? Number(values.leftOvaryFollicleCount) : undefined,
            rightOvaryFollicleCount: values.rightOvaryFollicleCount ? Number(values.rightOvaryFollicleCount) : undefined,
            leadFollicleSizeMm: values.leadFollicleSizeMm ? Number(values.leadFollicleSizeMm) : undefined,
            endometrialThicknessMm: values.endometrialThicknessMm ? Number(values.endometrialThicknessMm) : undefined,
          })
        }
      >
        Add Visit
      </Button>
    </div>
  );
}

function TriggerForm({ cycleId }: { cycleId: string }) {
  const mutation = useRecordIvfTrigger(cycleId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [drug, setDrug] = useState("");
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record Trigger Shot</p>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Trigger Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Trigger Drug" placeholder="e.g. Ovitrelle 250mcg" value={drug} onChange={(e) => setDrug(e.target.value)} />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        disabled={!drug.trim()}
        isLoading={mutation.isPending}
        onClick={() => mutation.mutate({ triggerShotDate: date, triggerDrugName: drug.trim() })}
      >
        Record Trigger
      </Button>
    </div>
  );
}

function EggRetrievalForm({ cycleId }: { cycleId: string }) {
  const mutation = useRecordEggRetrieval(cycleId);
  const [values, setValues] = useState({
    eggRetrievalDate: new Date().toISOString().slice(0, 10),
    oocytesRetrievedCount: "",
    matureOocytesCount: "",
    fertilizationMethod: FertilizationMethod.ICSI as FertilizationMethod,
  });
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record Egg Retrieval</p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Retrieval Date"
          type="date"
          value={values.eggRetrievalDate}
          onChange={(e) => setValues({ ...values, eggRetrievalDate: e.target.value })}
        />
        <Select
          label="Fertilization Method"
          options={Object.values(FertilizationMethod).map((v) => ({ value: v, label: v }))}
          value={values.fertilizationMethod}
          onChange={(e) => setValues({ ...values, fertilizationMethod: e.target.value as FertilizationMethod })}
        />
        <Input
          label="Oocytes Retrieved"
          type="number"
          value={values.oocytesRetrievedCount}
          onChange={(e) => setValues({ ...values, oocytesRetrievedCount: e.target.value })}
        />
        <Input
          label="Mature Oocytes"
          type="number"
          value={values.matureOocytesCount}
          onChange={(e) => setValues({ ...values, matureOocytesCount: e.target.value })}
        />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        disabled={!values.oocytesRetrievedCount || !values.matureOocytesCount}
        isLoading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            eggRetrievalDate: values.eggRetrievalDate,
            oocytesRetrievedCount: Number(values.oocytesRetrievedCount),
            matureOocytesCount: Number(values.matureOocytesCount),
            fertilizationMethod: values.fertilizationMethod,
          })
        }
      >
        Save Retrieval
      </Button>
    </div>
  );
}

function FertilizationOutcomeForm({ cycleId }: { cycleId: string }) {
  const mutation = useRecordFertilizationOutcome(cycleId);
  const [formed, setFormed] = useState("");
  const [frozen, setFrozen] = useState("");
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record Fertilization Outcome</p>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Embryos Formed" type="number" value={formed} onChange={(e) => setFormed(e.target.value)} />
        <Input label="Embryos Frozen" type="number" value={frozen} onChange={(e) => setFrozen(e.target.value)} />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        disabled={!formed}
        isLoading={mutation.isPending}
        onClick={() => mutation.mutate({ embryosFormedCount: Number(formed), embryosFrozenCount: Number(frozen || 0) })}
      >
        Save Outcome
      </Button>
    </div>
  );
}

function EmbryoTransferForm({ cycleId }: { cycleId: string }) {
  const mutation = useAddEmbryoTransfer(cycleId);
  const [values, setValues] = useState({
    transferDate: new Date().toISOString().slice(0, 10),
    embryosTransferredCount: "1",
    embryoStage: EmbryoStage.BLASTOCYST as EmbryoStage,
    isFrozenTransfer: false,
  });
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add Embryo Transfer</p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Transfer Date"
          type="date"
          value={values.transferDate}
          onChange={(e) => setValues({ ...values, transferDate: e.target.value })}
        />
        <Input
          label="Embryos Transferred"
          type="number"
          min={1}
          max={5}
          value={values.embryosTransferredCount}
          onChange={(e) => setValues({ ...values, embryosTransferredCount: e.target.value })}
        />
        <Select
          label="Stage"
          options={Object.values(EmbryoStage).map((v) => ({ value: v, label: v }))}
          value={values.embryoStage}
          onChange={(e) => setValues({ ...values, embryoStage: e.target.value as EmbryoStage })}
        />
        <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={values.isFrozenTransfer}
            onChange={(e) => setValues({ ...values, isFrozenTransfer: e.target.checked })}
          />
          Frozen embryo transfer
        </label>
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button
        type="button"
        size="sm"
        isLoading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            transferDate: values.transferDate,
            embryosTransferredCount: Number(values.embryosTransferredCount),
            embryoStage: values.embryoStage,
            isFrozenTransfer: values.isFrozenTransfer,
          })
        }
      >
        Record Transfer
      </Button>
    </div>
  );
}

function LutealSupportForm({ cycleId }: { cycleId: string }) {
  const mutation = useRecordLutealSupport(cycleId);
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start Luteal Support</p>
      <Input placeholder="e.g. Progesterone 400mg PV BD from transfer day" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {mutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <Button type="button" size="sm" disabled={!notes.trim()} isLoading={mutation.isPending} onClick={() => mutation.mutate({ lutealSupportNotes: notes.trim() })}>
        Save
      </Button>
    </div>
  );
}

function BetaHcgForm({ cycleId }: { cycleId: string }) {
  const mutation = useRecordBetaHcgResult(cycleId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("");
  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Beta-hCG Pregnancy Test</p>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Test Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Result (mIU/mL)" type="number" value={result} onChange={(e) => setResult(e.target.value)} />
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(mutation.error)}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!result}
          isLoading={mutation.isPending}
          onClick={() => mutation.mutate({ betaHcgTestDate: date, betaHcgResultMIUmL: Number(result), isPregnant: true })}
        >
          Mark Positive
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!result}
          isLoading={mutation.isPending}
          onClick={() => mutation.mutate({ betaHcgTestDate: date, betaHcgResultMIUmL: Number(result), isPregnant: false })}
        >
          Mark Negative
        </Button>
      </div>
    </div>
  );
}
