import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getApiErrorMessage } from "@/lib/axios";
import { useCreateUser, useUpdateUser, useDepartments } from "@/hooks/useAdmin";
import { SystemRole } from "@/types/common.types";
import type { StaffDirectoryRow } from "@/types/admin.types";

const ROLE_OPTIONS = Object.values(SystemRole).map((value) => ({ value, label: value.replace(/_/g, " ") }));

const staffFormSchema = z
  .object({
    username: z.string().min(3).max(50).optional(),
    password: z.string().min(10, "At least 10 characters").optional(),
    email: z.string().email(),
    phone: z.string().min(8).optional(),
    role: z.nativeEnum(SystemRole),
    departmentId: z.string().min(1, "Required"),
    fullName: z.string().min(1, "Required"),
    designation: z.string().optional(),
    dateOfJoining: z.string().optional(),
    specializations: z.string().optional(), // comma-separated in the form, split before submit
    registrationCouncil: z.string().optional(),
    registrationNumber: z.string().optional(),
    consultationFee: z.coerce.number().min(0).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.role === SystemRole.DOCTOR) {
      if (!values.specializations?.trim()) ctx.addIssue({ code: "custom", path: ["specializations"], message: "Required for doctors" });
      if (!values.registrationCouncil?.trim()) ctx.addIssue({ code: "custom", path: ["registrationCouncil"], message: "Required for doctors" });
      if (!values.registrationNumber?.trim()) ctx.addIssue({ code: "custom", path: ["registrationNumber"], message: "Required for doctors" });
      if (values.consultationFee == null) ctx.addIssue({ code: "custom", path: ["consultationFee"], message: "Required for doctors" });
      if (!values.phone?.trim()) ctx.addIssue({ code: "custom", path: ["phone"], message: "Required for doctors" });
    } else if (!values.designation?.trim()) {
      ctx.addIssue({ code: "custom", path: ["designation"], message: "Required for non-doctor staff" });
    }
  });

type StaffFormValues = z.infer<typeof staffFormSchema>;

export function StaffEditDrawer({ staff, onClose }: { staff: StaffDirectoryRow | null; onClose: () => void }) {
  const isCreate = staff === null;
  const departmentsQuery = useDepartments();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const profile = staff?.doctorProfile ?? staff?.staffProfile;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      email: staff?.email ?? "",
      phone: staff?.phone ?? "",
      role: staff?.roles[0] ?? SystemRole.STAFF_NURSE,
      departmentId: profile?.departmentId ?? "",
      fullName: profile?.fullName ?? "",
      designation: staff?.staffProfile?.designation ?? "",
      specializations: staff?.doctorProfile?.specializations.join(", ") ?? "",
      registrationCouncil: staff?.doctorProfile?.registrationCouncil ?? "",
      registrationNumber: staff?.doctorProfile?.registrationNumber ?? "",
      consultationFee: staff?.doctorProfile?.consultationFee,
    },
  });

  // react-hook-form's `defaultValues` only apply once, at mount — resetting
  // here keeps the form in sync if the caller swaps which staff row is
  // being edited without unmounting the drawer.
  useEffect(() => {
    reset({
      email: staff?.email ?? "",
      phone: staff?.phone ?? "",
      role: staff?.roles[0] ?? SystemRole.STAFF_NURSE,
      departmentId: profile?.departmentId ?? "",
      fullName: profile?.fullName ?? "",
      designation: staff?.staffProfile?.designation ?? "",
      specializations: staff?.doctorProfile?.specializations.join(", ") ?? "",
      registrationCouncil: staff?.doctorProfile?.registrationCouncil ?? "",
      registrationNumber: staff?.doctorProfile?.registrationNumber ?? "",
      consultationFee: staff?.doctorProfile?.consultationFee,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?._id]);

  const selectedRole = watch("role");
  const isDoctorRole = selectedRole === SystemRole.DOCTOR;
  const mutation = isCreate ? createUser : updateUser;

  const onSubmit = handleSubmit((values) => {
    const specializations = values.specializations
      ? values.specializations.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    if (isCreate) {
      if (!values.username || !values.password || !values.dateOfJoining) return;
      createUser.mutate(
        {
          username: values.username,
          password: values.password,
          email: values.email,
          phone: values.phone,
          roles: [values.role],
          fullName: values.fullName,
          departmentId: values.departmentId,
          designation: values.designation,
          dateOfJoining: values.dateOfJoining,
          specializations,
          registrationCouncil: values.registrationCouncil,
          registrationNumber: values.registrationNumber,
          consultationFee: values.consultationFee,
        },
        { onSuccess: onClose },
      );
    } else if (staff) {
      updateUser.mutate(
        {
          userId: staff._id,
          payload: {
            email: values.email,
            phone: values.phone,
            roles: [values.role],
            fullName: values.fullName,
            departmentId: values.departmentId,
            designation: values.designation,
            specializations,
            registrationCouncil: values.registrationCouncil,
            registrationNumber: values.registrationNumber,
            consultationFee: values.consultationFee,
          },
        },
        { onSuccess: onClose },
      );
    }
  });

  return (
    <Drawer isOpen onClose={onClose} title={isCreate ? "Add Staff Member" : `Edit ${profile?.fullName ?? staff?.username}`}>
      <form className="space-y-4" onSubmit={onSubmit}>
        {isCreate && (
          <>
            <Input label="Username" error={errors.username?.message} {...register("username")} />
            <Input label="Temporary Password" type="password" error={errors.password?.message} {...register("password")} />
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Full Name" error={errors.fullName?.message} {...register("fullName")} />
          <Select label="Role" options={ROLE_OPTIONS} error={errors.role?.message} {...register("role")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
          <Input label="Phone" error={errors.phone?.message} {...register("phone")} />
        </div>

        <Select
          label="Department"
          placeholder="Select a department"
          options={(departmentsQuery.data ?? []).map((d) => ({ value: d._id, label: d.name }))}
          error={errors.departmentId?.message}
          {...register("departmentId")}
        />

        {isCreate && <Input label="Date of Joining" type="date" error={errors.dateOfJoining?.message} {...register("dateOfJoining")} />}

        {isDoctorRole ? (
          <div className="space-y-3 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-500">Doctor-specific details</p>
            <Input
              label="Specializations (comma-separated)"
              error={errors.specializations?.message}
              {...register("specializations")}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Registration Council" error={errors.registrationCouncil?.message} {...register("registrationCouncil")} />
              <Input label="Registration Number" error={errors.registrationNumber?.message} {...register("registrationNumber")} />
            </div>
            <Input
              label="Consultation Fee"
              type="number"
              step="0.01"
              error={errors.consultationFee?.message}
              {...register("consultationFee")}
            />
          </div>
        ) : (
          <Input label="Designation" error={errors.designation?.message} {...register("designation")} />
        )}

        {mutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(mutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            {isCreate ? "Create Staff Member" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
