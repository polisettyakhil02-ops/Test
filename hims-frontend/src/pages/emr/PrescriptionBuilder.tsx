import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getApiErrorMessage } from "@/lib/axios";
import { useAddPrescription } from "@/hooks/useAddPrescription";
import { DrugRoute, DoseUnit } from "@/types/common.types";
import { DrugCombobox } from "./DrugCombobox";

const DOSING_PATTERN_REGEX = /^\d+(-\d+)*$/;

const prescriptionItemSchema = z.object({
  drugId: z.string().min(1, "Select a medication"),
  drugLabel: z.string().min(1),
  doseValue: z.coerce.number().positive("Required"),
  doseUnit: z.nativeEnum(DoseUnit),
  route: z.nativeEnum(DrugRoute),
  // e.g. "1-0-1" (morning-noon-night) — converted to frequencyPerDay (the
  // count of nonzero slots) before submission; Prescription.frequencyPerDay
  // on the backend is a plain daily count, not a slot pattern, so the
  // human-readable pattern itself is preserved in `instructions` instead.
  dosingPattern: z.string().regex(DOSING_PATTERN_REGEX, "Use a pattern like 1-0-1"),
  durationDays: z.coerce.number().int().positive("Required"),
  isPRN: z.boolean(),
  instructions: z.string().optional(),
});

const prescriptionFormSchema = z.object({
  items: z.array(prescriptionItemSchema).min(1, "Add at least one medication"),
});

type PrescriptionFormValues = z.infer<typeof prescriptionFormSchema>;

const DOSE_UNIT_OPTIONS = Object.values(DoseUnit).map((value) => ({ value, label: value }));
const ROUTE_OPTIONS = Object.values(DrugRoute).map((value) => ({ value, label: value }));

function frequencyFromPattern(pattern: string): number {
  return pattern
    .split("-")
    .map((segment) => Number.parseInt(segment, 10) || 0)
    .reduce((sum, n) => sum + n, 0);
}

/** Dynamic medication form array — search/add rows, dosage + a "1-0-1"-style dosing pattern + duration per row. Only enabled once a clinical note exists for this encounter (a prescription must reference one). */
export function PrescriptionBuilder({
  patientId,
  clinicalNoteId,
  encounterType,
}: {
  patientId: string;
  clinicalNoteId: string | null;
  encounterType: "OPD" | "IPD";
}) {
  const addPrescription = useAddPrescription(patientId);
  const [allergyOverrideReason, setAllergyOverrideReason] = useState("");
  const [showAllergyOverride, setShowAllergyOverride] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionFormSchema),
    defaultValues: { items: [] },
  });

  const itemFields = useFieldArray({ control, name: "items" });

  function addRow() {
    itemFields.append({
      drugId: "",
      drugLabel: "",
      doseValue: 500,
      doseUnit: DoseUnit.mg,
      route: DrugRoute.ORAL,
      dosingPattern: "1-0-1",
      durationDays: 5,
      isPRN: false,
      instructions: "",
    });
  }

  function submit(withOverride: boolean) {
    return handleSubmit((values) => {
      if (!clinicalNoteId) return;
      addPrescription.mutate(
        {
          clinicalNoteId,
          encounterType,
          items: values.items.map((item) => ({
            drugId: item.drugId,
            doseValue: item.doseValue,
            doseUnit: item.doseUnit,
            route: item.route,
            frequencyPerDay: frequencyFromPattern(item.dosingPattern),
            durationDays: item.durationDays,
            isPRN: item.isPRN,
            instructions: [`Pattern ${item.dosingPattern}`, item.instructions].filter(Boolean).join(" — "),
          })),
          allergyOverride: withOverride,
          allergyOverrideReason: withOverride ? allergyOverrideReason : undefined,
        },
        {
          onSuccess: () => {
            reset({ items: [] });
            setShowAllergyOverride(false);
            setAllergyOverrideReason("");
          },
          onError: (error) => {
            if (getApiErrorMessage(error).toLowerCase().includes("allerg")) {
              setShowAllergyOverride(true);
            }
          },
        },
      );
    });
  }

  if (!clinicalNoteId) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">
        Save a clinical note above first — a prescription must be attached to one.
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit(false)}>
      <div className="space-y-3">
        {itemFields.fields.map((field, index) => (
          <div key={field.id} className="space-y-2 rounded-md border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <DrugCombobox
                  label={field.drugLabel}
                  onSelect={(drug) => {
                    setValue(`items.${index}.drugId`, drug._id, { shouldValidate: true });
                    setValue(
                      `items.${index}.drugLabel`,
                      drug.brandName ? `${drug.genericName} (${drug.brandName})` : drug.genericName,
                    );
                    setValue(`items.${index}.route`, drug.defaultRoute);
                  }}
                />
                {errors.items?.[index]?.drugId && (
                  <p className="mt-1 text-xs text-red-600">{errors.items[index]?.drugId?.message}</p>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => itemFields.remove(index)}>
                Remove
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input
                type="number"
                label="Dose"
                step="0.1"
                error={errors.items?.[index]?.doseValue?.message}
                {...register(`items.${index}.doseValue` as const)}
              />
              <Select label="Unit" options={DOSE_UNIT_OPTIONS} {...register(`items.${index}.doseUnit` as const)} />
              <Select label="Route" options={ROUTE_OPTIONS} {...register(`items.${index}.route` as const)} />
              <Input
                label="Pattern (M-A-N)"
                placeholder="1-0-1"
                error={errors.items?.[index]?.dosingPattern?.message}
                {...register(`items.${index}.dosingPattern` as const)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input
                type="number"
                label="Duration (days)"
                error={errors.items?.[index]?.durationDays?.message}
                {...register(`items.${index}.durationDays` as const)}
              />
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register(`items.${index}.isPRN` as const)} />
                PRN
              </label>
              <div className="col-span-2">
                <Input label="Instructions" placeholder="After food" {...register(`items.${index}.instructions` as const)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        + Add medication
      </Button>

      {errors.items?.message && <p className="text-xs text-red-600">{errors.items.message}</p>}

      {addPrescription.isError && !showAllergyOverride && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {getApiErrorMessage(addPrescription.error)}
        </p>
      )}

      {showAllergyOverride && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">{getApiErrorMessage(addPrescription.error)}</p>
          <Input
            label="Override reason (required to proceed anyway)"
            value={allergyOverrideReason}
            onChange={(event) => setAllergyOverrideReason(event.target.value)}
          />
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!allergyOverrideReason.trim()}
            onClick={submit(true)}
          >
            Prescribe anyway
          </Button>
        </div>
      )}

      <Button type="submit" isLoading={addPrescription.isPending} disabled={itemFields.fields.length === 0}>
        Save Prescription
      </Button>
    </form>
  );
}
