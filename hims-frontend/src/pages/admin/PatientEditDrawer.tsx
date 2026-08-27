import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getApiErrorMessage } from "@/lib/axios";
import { useUpdatePatientAdmin } from "@/hooks/useAdmin";
import { Gender, BloodGroup } from "@/types/common.types";
import type { AdminPatientRow } from "@/types/admin.types";

const GENDER_OPTIONS = Object.values(Gender).map((v) => ({ value: v, label: v }));
const BLOOD_GROUP_OPTIONS = Object.values(BloodGroup).map((v) => ({ value: v, label: v }));

const patientFormSchema = z.object({
  firstName: z.string().min(1, "Required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Required"),
  dateOfBirth: z.string().min(1, "Required"),
  gender: z.nativeEnum(Gender),
  bloodGroup: z.nativeEnum(BloodGroup),
  phone: z.string().min(8, "Required"),
  alternatePhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  addressLine1: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  state: z.string().min(1, "Required"),
  country: z.string().min(1, "Required"),
  postalCode: z.string().min(1, "Required"),
  emergencyContactName: z.string().min(1, "Required"),
  emergencyContactRelationship: z.string().min(1, "Required"),
  emergencyContactPhone: z.string().min(8, "Required"),
});

type PatientFormValues = z.infer<typeof patientFormSchema>;

export function PatientEditDrawer({ patient, onClose }: { patient: AdminPatientRow; onClose: () => void }) {
  const updatePatient = useUpdatePatientAdmin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      firstName: patient.firstName,
      middleName: patient.middleName ?? "",
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth.slice(0, 10),
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      phone: patient.phone,
      email: patient.email ?? "",
      addressLine1: patient.address.line1,
      city: patient.address.city,
      state: patient.address.state,
      country: patient.address.country,
      postalCode: patient.address.postalCode,
      emergencyContactName: patient.emergencyContacts[0]?.name ?? "",
      emergencyContactRelationship: patient.emergencyContacts[0]?.relationship ?? "",
      emergencyContactPhone: patient.emergencyContacts[0]?.phone ?? "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    updatePatient.mutate(
      {
        patientId: patient._id,
        payload: {
          firstName: values.firstName,
          middleName: values.middleName || undefined,
          lastName: values.lastName,
          dateOfBirth: values.dateOfBirth,
          gender: values.gender,
          bloodGroup: values.bloodGroup,
          phone: values.phone,
          alternatePhone: values.alternatePhone || undefined,
          email: values.email || undefined,
          address: {
            line1: values.addressLine1,
            city: values.city,
            state: values.state,
            country: values.country,
            postalCode: values.postalCode,
          },
          emergencyContacts: [
            {
              name: values.emergencyContactName,
              relationship: values.emergencyContactRelationship,
              phone: values.emergencyContactPhone,
            },
          ],
        },
      },
      { onSuccess: onClose },
    );
  });

  return (
    <Drawer isOpen onClose={onClose} title={`Edit ${patient.firstName} ${patient.lastName} (${patient.uhid})`}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-3 gap-3">
          <Input label="First Name" error={errors.firstName?.message} {...register("firstName")} />
          <Input label="Middle Name" error={errors.middleName?.message} {...register("middleName")} />
          <Input label="Last Name" error={errors.lastName?.message} {...register("lastName")} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Date of Birth" type="date" error={errors.dateOfBirth?.message} {...register("dateOfBirth")} />
          <Select label="Gender" options={GENDER_OPTIONS} error={errors.gender?.message} {...register("gender")} />
          <Select label="Blood Group" options={BLOOD_GROUP_OPTIONS} error={errors.bloodGroup?.message} {...register("bloodGroup")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" error={errors.phone?.message} {...register("phone")} />
          <Input label="Alternate Phone" error={errors.alternatePhone?.message} {...register("alternatePhone")} />
        </div>
        <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />

        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-500">Address</p>
          <Input label="Address Line 1" error={errors.addressLine1?.message} {...register("addressLine1")} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" error={errors.city?.message} {...register("city")} />
            <Input label="State" error={errors.state?.message} {...register("state")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Country" error={errors.country?.message} {...register("country")} />
            <Input label="Postal Code" error={errors.postalCode?.message} {...register("postalCode")} />
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-500">Primary Emergency Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" error={errors.emergencyContactName?.message} {...register("emergencyContactName")} />
            <Input label="Relationship" error={errors.emergencyContactRelationship?.message} {...register("emergencyContactRelationship")} />
          </div>
          <Input label="Phone" error={errors.emergencyContactPhone?.message} {...register("emergencyContactPhone")} />
        </div>

        {updatePatient.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(updatePatient.error)}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={updatePatient.isPending}>
            Save Changes
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
