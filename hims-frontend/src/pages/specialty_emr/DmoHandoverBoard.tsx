import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDmoHandoverNotes, useCreateDmoHandoverNote, useAcknowledgeDmoHandoverNote } from "@/hooks/useSpecialtyEmr";
import { usePatientByUhid } from "@/hooks/usePatient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { DialysisShift, DmoCriticalityLevel, DmoHandoverStatus } from "@/types/common.types";
import type { DmoHandoverNote } from "@/types/specialtyEmr.types";

function patientLabel(note: DmoHandoverNote): string {
  if (typeof note.patientId === "string") return note.patientId;
  return `${note.patientId.firstName} ${note.patientId.lastName} (${note.patientId.uhid})`;
}
function doctorLabel(note: DmoHandoverNote): string {
  if (typeof note.dutyDoctorId === "string") return note.dutyDoctorId;
  return note.dutyDoctorId.fullName;
}

const CRITICALITY_TONE: Record<DmoCriticalityLevel, BadgeTone> = {
  WATCH: "blue",
  URGENT: "yellow",
  CRITICAL: "red",
};

/** The morning team's inbox: every overnight DMO flag, most critical and least-acknowledged first (see DmoHandoverService.listNotes). */
export function DmoHandoverBoard() {
  const notesQuery = useDmoHandoverNotes();
  const acknowledgeMutation = useAcknowledgeDmoHandoverNote();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">DMO Shift Handover</h1>
          <p className="text-sm text-slate-500">Flag critical patients for the incoming team before you sign off.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>+ New Handover Note</Button>
      </div>

      {notesQuery.isLoading && <FullPageSpinner />}
      {notesQuery.isError && <ErrorState message={getApiErrorMessage(notesQuery.error)} />}
      {notesQuery.data && notesQuery.data.length === 0 && (
        <EmptyState title="No handover notes" description="Nothing has been flagged for the incoming team." />
      )}

      <div className="space-y-3">
        {notesQuery.data?.map((note) => {
          const isPending = note.status === DmoHandoverStatus.PENDING_ACKNOWLEDGEMENT;
          return (
            <Card key={note._id} className={isPending && note.criticalityLevel === DmoCriticalityLevel.CRITICAL ? "border-red-300" : ""}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {patientLabel(note)}
                  <Badge tone={CRITICALITY_TONE[note.criticalityLevel]}>{note.criticalityLevel}</Badge>
                  <Badge tone={isPending ? "yellow" : "green"}>{note.status.replace(/_/g, " ")}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-xs text-slate-500">
                  {doctorLabel(note)} · {note.shift} shift · {new Date(note.shiftDate).toLocaleDateString()}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Situation: </span>
                  {note.situation}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Background: </span>
                  {note.background}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Assessment: </span>
                  {note.assessment}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Recommendation: </span>
                  {note.recommendation}
                </p>
                {note.actionItems.length > 0 && (
                  <ul className="list-inside list-disc text-slate-700">
                    {note.actionItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
                {isPending ? (
                  <Button
                    type="button"
                    size="sm"
                    isLoading={acknowledgeMutation.isPending}
                    onClick={() => acknowledgeMutation.mutate(note._id)}
                  >
                    Acknowledge
                  </Button>
                ) : (
                  <p className="text-xs text-emerald-700">
                    Acknowledged {note.acknowledgedAt && new Date(note.acknowledgedAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isCreateOpen && <CreateDmoHandoverNoteModal onClose={() => setIsCreateOpen(false)} />}
    </div>
  );
}

const formSchema = z.object({
  dutyDoctorId: z.string().min(1, "Required"),
  shift: z.nativeEnum(DialysisShift),
  shiftDate: z.string().min(1, "Required"),
  criticalityLevel: z.nativeEnum(DmoCriticalityLevel),
  situation: z.string().min(1, "Required"),
  background: z.string().min(1, "Required"),
  assessment: z.string().min(1, "Required"),
  recommendation: z.string().min(1, "Required"),
});
type FormValues = z.infer<typeof formSchema>;

function CreateDmoHandoverNoteModal({ onClose }: { onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const createMutation = useCreateDmoHandoverNote();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      shift: DialysisShift.NIGHT,
      shiftDate: new Date().toISOString().slice(0, 10),
      criticalityLevel: DmoCriticalityLevel.WATCH,
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
    <Modal isOpen onClose={onClose} title="New DMO Handover Note" widthClassName="max-w-xl">
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

        <form className="space-y-3" onSubmit={onSubmit}>
          <Input label="Duty Doctor ID" placeholder="Doctor ObjectId" error={errors.dutyDoctorId?.message} {...register("dutyDoctorId")} />
          <div className="grid grid-cols-3 gap-3">
            <Select label="Shift" options={Object.values(DialysisShift).map((v) => ({ value: v, label: v }))} {...register("shift")} />
            <Input label="Shift Date" type="date" {...register("shiftDate")} />
            <Select
              label="Criticality"
              options={Object.values(DmoCriticalityLevel).map((v) => ({ value: v, label: v }))}
              {...register("criticalityLevel")}
            />
          </div>
          <Input label="Situation" placeholder="What's happening right now" error={errors.situation?.message} {...register("situation")} />
          <Input label="Background" placeholder="Relevant history/context" error={errors.background?.message} {...register("background")} />
          <Input label="Assessment" placeholder="Your clinical read" error={errors.assessment?.message} {...register("assessment")} />
          <Input
            label="Recommendation"
            placeholder="What the morning team should do"
            error={errors.recommendation?.message}
            {...register("recommendation")}
          />

          {createMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patientQuery.data} isLoading={createMutation.isPending}>
              Flag for Morning Team
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
