import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useRegisterDonor } from "@/hooks/useBloodBank";
import { getApiErrorMessage } from "@/lib/axios";
import { Gender, BloodGroup } from "@/types/common.types";

const formSchema = z.object({
  fullName: z.string().min(1, "Required"),
  age: z.coerce.number().min(18, "Must be 18-65").max(65, "Must be 18-65"),
  gender: z.nativeEnum(Gender),
  bloodGroup: z.nativeEnum(BloodGroup),
  phone: z.string().min(1, "Required"),
  address: z.string().optional(),
  medicalNotes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const GENDER_OPTIONS = Object.values(Gender).map((v) => ({ value: v, label: v }));
const BLOOD_GROUP_OPTIONS = Object.values(BloodGroup)
  .filter((v) => v !== BloodGroup.UNKNOWN)
  .map((v) => ({ value: v, label: v }));

/** Registers a donor ahead of, or during, a donation camp. */
export function RegisterDonorModal({ onClose }: { onClose: () => void }) {
  const registerMutation = useRegisterDonor();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { gender: Gender.MALE } });

  const onSubmit = handleSubmit((values) => {
    registerMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Register Donor">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Input label="Full Name" error={errors.fullName?.message} {...register("fullName")} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Age" type="number" min={18} max={65} error={errors.age?.message} {...register("age")} />
          <Select label="Gender" options={GENDER_OPTIONS} {...register("gender")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Blood Group" options={BLOOD_GROUP_OPTIONS} placeholder="Select" {...register("bloodGroup")} />
          <Input label="Phone" error={errors.phone?.message} {...register("phone")} />
        </div>
        <Input label="Address" {...register("address")} />
        <Input label="Medical Notes" {...register("medicalNotes")} />

        {registerMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(registerMutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={registerMutation.isPending}>
            Register Donor
          </Button>
        </div>
      </form>
    </Modal>
  );
}
