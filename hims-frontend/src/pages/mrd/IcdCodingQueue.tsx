import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePendingIcdCoding, useFinalizeIcdCoding, useFlagIcdQuery } from "@/hooks/useMrd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { ICD10_CODE_REGEX } from "@/lib/validationPatterns";
import { IcdCodingStatus } from "@/types/common.types";
import type { MedicalRecordArchive } from "@/types/mrd.types";

function patientLabel(archive: MedicalRecordArchive): string {
  if (typeof archive.patientId === "string") return archive.patientId;
  return `${archive.patientId.firstName} ${archive.patientId.lastName} (${archive.patientId.uhid})`;
}

const CODING_TONE: Record<IcdCodingStatus, BadgeTone> = { PENDING: "yellow", CODED: "green", QUERY_RAISED: "red" };

/** The post-discharge ICD-10 coding backlog: every archived file still awaiting billing-audit coding, oldest first. */
export function IcdCodingQueue() {
  const pendingQuery = usePendingIcdCoding();
  const [codingTarget, setCodingTarget] = useState<MedicalRecordArchive | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">ICD-10 Coding Queue</h1>
        <p className="text-sm text-slate-500">Every archived file still awaiting billing-audit coding, oldest first.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Coding ({pendingQuery.data?.length ?? "—"})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pendingQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {pendingQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(pendingQuery.error)} />
            </div>
          )}
          {pendingQuery.data && pendingQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="Queue is clear" description="Every archived file has been coded." />
            </div>
          )}
          {pendingQuery.data && pendingQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {pendingQuery.data.map((archive) => (
                <button
                  key={archive._id}
                  type="button"
                  onClick={() => setCodingTarget(archive)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {archive.archiveNumber} · {patientLabel(archive)}
                    </p>
                    <p className="text-xs text-slate-500">Archived {new Date(archive.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge tone={CODING_TONE[archive.icdCodingStatus]}>{archive.icdCodingStatus.replace("_", " ")}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {codingTarget && <FinalizeCodingModal archive={codingTarget} onClose={() => setCodingTarget(null)} />}
    </div>
  );
}

const codeSchema = z.object({
  code: z.string().regex(ICD10_CODE_REGEX, "Invalid ICD-10 code (e.g. J06.9)"),
  description: z.string().min(1, "Required"),
  isPrimary: z.boolean(),
});
const formSchema = z.object({ icdCodes: z.array(codeSchema).min(1, "At least one code is required") }).refine(
  (data) => data.icdCodes.filter((c) => c.isPrimary).length === 1,
  { message: "Exactly one code must be marked primary", path: ["icdCodes"] },
);
type FormValues = z.infer<typeof formSchema>;

function FinalizeCodingModal({ archive, onClose }: { archive: MedicalRecordArchive; onClose: () => void }) {
  const finalizeMutation = useFinalizeIcdCoding(archive._id);
  const flagQueryMutation = useFlagIcdQuery(archive._id);
  const [queryNote, setQueryNote] = useState("");
  const [showQuery, setShowQuery] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { icdCodes: [{ code: "", description: "", isPrimary: true }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "icdCodes" });
  const watchedCodes = watch("icdCodes");

  /** Enforces "exactly one primary" as real radio-button behavior — a plain per-row `register` would give each row its own RHF-generated `name`, so the browser wouldn't group them and more than one row could end up checked. */
  function selectPrimary(selectedIndex: number) {
    fields.forEach((_, i) => setValue(`icdCodes.${i}.isPrimary`, i === selectedIndex));
  }

  const onSubmit = handleSubmit((values) => {
    finalizeMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title={`Finalize Coding — ${archive.archiveNumber}`} widthClassName="max-w-xl">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[1fr_2fr_auto_auto] items-end gap-2">
              <Input
                label="ICD-10 Code"
                placeholder="J06.9"
                error={errors.icdCodes?.[index]?.code?.message}
                {...register(`icdCodes.${index}.code` as const)}
              />
              <Input
                label="Description"
                error={errors.icdCodes?.[index]?.description?.message}
                {...register(`icdCodes.${index}.description` as const)}
              />
              <label className="mb-2 flex items-center gap-1 text-xs text-slate-700">
                <input
                  type="radio"
                  name="icdCodes-primary"
                  className="h-4 w-4"
                  checked={Boolean(watchedCodes?.[index]?.isPrimary)}
                  onChange={() => selectPrimary(index)}
                />
                Primary
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                ✕
              </Button>
            </div>
          ))}
          {errors.icdCodes?.root && <p className="text-xs text-red-600">{errors.icdCodes.root.message}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ code: "", description: "", isPrimary: false })}>
            + Add Code
          </Button>
        </div>

        {finalizeMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(finalizeMutation.error)}</p>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          {!showQuery ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowQuery(true)}>
              Raise Query Instead
            </Button>
          ) : (
            <div className="flex flex-1 gap-2">
              <Input placeholder="What needs clarifying?" value={queryNote} onChange={(e) => setQueryNote(e.target.value)} className="flex-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!queryNote.trim()}
                isLoading={flagQueryMutation.isPending}
                onClick={() => flagQueryMutation.mutate(queryNote.trim(), { onSuccess: onClose })}
              >
                Raise
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={finalizeMutation.isPending}>
              Finalize Coding
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
