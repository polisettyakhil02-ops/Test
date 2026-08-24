import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usePatientByUhid } from "@/hooks/usePatient";
import { useCreateObstetricRecord } from "@/hooks/useSpecialtyEmr";
import { getApiErrorMessage } from "@/lib/axios";

const formSchema = z.object({
  obstetricianId: z.string().min(1, "Required"),
  lmpDate: z.string().min(1, "Required"),
  gravida: z.coerce.number().int().min(1),
  para: z.coerce.number().int().min(0),
  abortions: z.coerce.number().int().min(0).optional(),
  livingChildren: z.coerce.number().int().min(0).optional(),
});
type FormValues = z.infer<typeof formSchema>;

/** Opens a new pregnancy's obstetric episode. EDD defaults server-side to LMP + 280 days (Naegele's rule) if left blank. */
export function CreateObstetricRecordModal({ onClose }: { onClose: () => void }) {
  const [uhidInput, setUhidInput] = useState("");
  const [lookupUhid, setLookupUhid] = useState<string | undefined>(undefined);
  const patientQuery = usePatientByUhid(lookupUhid);
  const createMutation = useCreateObstetricRecord();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { gravida: 1, para: 0 } });

  function handleLookup() {
    setLookupUhid(uhidInput.trim() || undefined);
  }

  const onSubmit = handleSubmit((values) => {
    if (!patientQuery.data) return;
    createMutation.mutate({ patientId: patientQuery.data._id, ...values }, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="New Obstetric Record" widthClassName="max-w-xl">
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

        <form className="space-y-4" onSubmit={onSubmit}>
          <Input
            label="Obstetrician ID"
            placeholder="Doctor ObjectId"
            error={errors.obstetricianId?.message}
            {...register("obstetricianId")}
          />
          <Input label="LMP Date" type="date" error={errors.lmpDate?.message} {...register("lmpDate")} />
          <div className="grid grid-cols-4 gap-3">
            <Input label="Gravida" type="number" error={errors.gravida?.message} {...register("gravida")} />
            <Input label="Para" type="number" {...register("para")} />
            <Input label="Abortions" type="number" {...register("abortions")} />
            <Input label="Living Children" type="number" {...register("livingChildren")} />
          </div>

          {createMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!patientQuery.data} isLoading={createMutation.isPending}>
              Create Record
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
