import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getApiErrorMessage } from "@/lib/axios";
import { useAddClinicalNote } from "@/hooks/useAddClinicalNote";
import { ICD10_CODE_REGEX } from "@/lib/validationPatterns";
import type { EncounterType } from "@/types/common.types";

const diagnosisSchema = z.object({
  icd10Code: z.string().regex(ICD10_CODE_REGEX, "Invalid ICD-10 code (e.g. J06.9)"),
  icd10Description: z.string().min(1, "Required"),
  diagnosisType: z.enum(["PROVISIONAL", "CONFIRMED", "DIFFERENTIAL", "RULED_OUT"]),
});

const noteSchema = z.object({
  subjective: z.string().min(1, "Required"),
  objective: z.string().min(1, "Required"),
  assessment: z.string().min(1, "Required"),
  plan: z.string().min(1, "Required"),
  diagnoses: z.array(diagnosisSchema),
});

type NoteFormValues = z.infer<typeof noteSchema>;

const DIAGNOSIS_TYPE_OPTIONS = [
  { value: "PROVISIONAL", label: "Provisional" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DIFFERENTIAL", label: "Differential" },
  { value: "RULED_OUT", label: "Ruled out" },
];

export function ClinicalNoteForm({
  patientId,
  encounterType,
  opdVisitId,
  admissionId,
  onSaved,
}: {
  patientId: string;
  encounterType: EncounterType;
  opdVisitId?: string;
  admissionId?: string;
  onSaved: (noteId: string) => void;
}) {
  const addNote = useAddClinicalNote(patientId);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { subjective: "", objective: "", assessment: "", plan: "", diagnoses: [] },
  });

  const diagnosisFields = useFieldArray({ control, name: "diagnoses" });

  const onSubmit = handleSubmit((values) => {
    addNote.mutate(
      {
        encounterType,
        opdVisitId,
        admissionId,
        subjective: values.subjective,
        objective: values.objective,
        assessment: values.assessment,
        plan: values.plan,
        diagnoses: values.diagnoses,
        isSigned: true,
      },
      {
        onSuccess: (note) => {
          onSaved(note._id);
          reset();
        },
      },
    );
  });

  const encounterRefMissing = encounterType === "OPD" ? !opdVisitId : !admissionId;

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Subjective</label>
        <textarea
          rows={2}
          placeholder="Patient-reported symptoms and history"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          {...register("subjective")}
        />
        {errors.subjective && <p className="mt-1 text-xs text-red-600">{errors.subjective.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Objective</label>
        <textarea
          rows={2}
          placeholder="Examination findings"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          {...register("objective")}
        />
        {errors.objective && <p className="mt-1 text-xs text-red-600">{errors.objective.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Assessment</label>
        <textarea
          rows={2}
          placeholder="Clinical assessment"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          {...register("assessment")}
        />
        {errors.assessment && <p className="mt-1 text-xs text-red-600">{errors.assessment.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Plan</label>
        <textarea
          rows={2}
          placeholder="Treatment plan"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          {...register("plan")}
        />
        {errors.plan && <p className="mt-1 text-xs text-red-600">{errors.plan.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-700">ICD-10 Diagnoses</label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              diagnosisFields.append({ icd10Code: "", icd10Description: "", diagnosisType: "PROVISIONAL" })
            }
          >
            + Add diagnosis
          </Button>
        </div>

        {diagnosisFields.fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-[1fr_2fr_1fr_auto] items-start gap-2">
            <Input
              placeholder="J06.9"
              error={errors.diagnoses?.[index]?.icd10Code?.message}
              {...register(`diagnoses.${index}.icd10Code` as const)}
            />
            <Input
              placeholder="Description"
              error={errors.diagnoses?.[index]?.icd10Description?.message}
              {...register(`diagnoses.${index}.icd10Description` as const)}
            />
            <Select
              options={DIAGNOSIS_TYPE_OPTIONS}
              {...register(`diagnoses.${index}.diagnosisType` as const)}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => diagnosisFields.remove(index)}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      {encounterRefMissing && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Enter an {encounterType === "OPD" ? "OPD visit ID" : "admission ID"} above before saving.
        </p>
      )}

      {addNote.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(addNote.error)}</p>
      )}

      <Button type="submit" isLoading={addNote.isPending} disabled={encounterRefMissing}>
        Save Clinical Note
      </Button>
    </form>
  );
}
