import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useLogDonation } from "@/hooks/useBloodBank";
import { getApiErrorMessage } from "@/lib/axios";
import { BloodComponentType } from "@/types/common.types";
import type { BloodDonor } from "@/types/bloodbank.types";

const formSchema = z.object({
  componentType: z.nativeEnum(BloodComponentType),
  volumeMl: z.coerce.number().positive("Must be positive"),
  collectionDate: z.string().min(1, "Required"),
  storageLocation: z.string().min(1, "Required"),
  screeningTestsPassed: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const COMPONENT_OPTIONS = Object.values(BloodComponentType).map((v) => ({ value: v, label: v.replace("_", " ") }));

/** Logs one collection from an existing donor — mints the resulting blood bag, computing its expiry from the component's shelf life server-side. A failed screening panel still creates the bag (traceability) but discards it instead of making it available. */
export function LogDonationModal({ donor, onClose }: { donor: BloodDonor; onClose: () => void }) {
  const logMutation = useLogDonation(donor._id);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      componentType: BloodComponentType.WHOLE_BLOOD,
      collectionDate: new Date().toISOString().slice(0, 10),
      screeningTestsPassed: true,
    },
  });

  const onSubmit = handleSubmit((values) => {
    logMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title={`Log Donation — ${donor.fullName}`}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Donor {donor.donorCode} · {donor.bloodGroup} · {donor.totalDonations} previous donation(s)
        </p>

        <Select label="Component Type" options={COMPONENT_OPTIONS} {...register("componentType")} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Volume (ml)" type="number" error={errors.volumeMl?.message} {...register("volumeMl")} />
          <Input label="Collection Date" type="date" error={errors.collectionDate?.message} {...register("collectionDate")} />
        </div>
        <Input
          label="Storage Location"
          placeholder="e.g. Fridge 2, Shelf B"
          error={errors.storageLocation?.message}
          {...register("storageLocation")}
        />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("screeningTestsPassed")} />
          Passed HIV/HBV/HCV/Syphilis/Malaria screening panel
        </label>

        {logMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(logMutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={logMutation.isPending}>
            Log Donation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
