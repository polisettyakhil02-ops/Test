import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useEligibleAdmissions, useCreateArchiveRecord } from "@/hooks/useMrd";
import { getApiErrorMessage } from "@/lib/axios";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";

const formSchema = z.object({
  admissionId: z.string().min(1, "Required"),
  fileBarcodeId: z.string().min(1, "Required"),
  physicalLocation: z.string().min(1, "Required"),
});
type FormValues = z.infer<typeof formSchema>;

function admissionLabel(admission: { admissionNumber: string; patientId: { firstName: string; lastName: string; uhid: string } | string }): string {
  const patient = typeof admission.patientId === "string" ? admission.patientId : `${admission.patientId.firstName} ${admission.patientId.lastName} (${admission.patientId.uhid})`;
  return `${admission.admissionNumber} — ${patient}`;
}

/** Logged by MRD staff once the physical case file for a discharged patient actually arrives in the archive room. */
export function CreateArchiveModal({ onClose }: { onClose: () => void }) {
  const eligibleQuery = useEligibleAdmissions();
  const createMutation = useCreateArchiveRecord();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Archive a Discharged Patient's File" widthClassName="max-w-lg">
      {eligibleQuery.isLoading && <FullPageSpinner />}
      {eligibleQuery.data && eligibleQuery.data.length === 0 && (
        <EmptyState title="Nothing to archive" description="Every discharged admission already has an archive record." />
      )}
      {eligibleQuery.data && eligibleQuery.data.length > 0 && (
        <form className="space-y-4" onSubmit={onSubmit}>
          <Select
            label="Discharged Admission"
            placeholder="Select an admission"
            options={eligibleQuery.data.map((a) => ({ value: a._id, label: admissionLabel(a) }))}
            error={errors.admissionId?.message}
            {...register("admissionId")}
          />
          <Input
            label="File Barcode ID"
            placeholder="e.g. MRDFILE-000512"
            error={errors.fileBarcodeId?.message}
            {...register("fileBarcodeId")}
          />
          <Input
            label="Physical Location"
            placeholder="e.g. Rack B / Shelf 4 / Row 2"
            error={errors.physicalLocation?.message}
            {...register("physicalLocation")}
          />

          {createMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              Archive File
            </Button>
          </div>
        </form>
      )}
      {eligibleQuery.isError && <p className="text-xs text-red-600">{getApiErrorMessage(eligibleQuery.error)}</p>}
    </Modal>
  );
}
