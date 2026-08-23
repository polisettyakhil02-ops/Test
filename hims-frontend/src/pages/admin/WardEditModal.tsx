import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { getApiErrorMessage } from "@/lib/axios";
import { useCreateWard, useUpdateWard, useUpdateBedStatus } from "@/hooks/useAdmin";
import { WardCategory, BedStatus } from "@/types/common.types";
import type { WardWithTariff, AdminBed } from "@/types/admin.types";
import type { BadgeTone } from "@/components/ui/Badge";

const CATEGORY_OPTIONS = Object.values(WardCategory).map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

const BED_STATUS_TONE: Record<BedStatus, BadgeTone> = {
  VACANT: "green",
  OCCUPIED: "blue",
  RESERVED: "purple",
  CLEANING: "yellow",
  MAINTENANCE: "gray",
  BLOCKED: "red",
};

// Occupied is intentionally excluded — that transition only ever happens
// through the ADT admit/discharge flow, never this admin override (see
// setBedStatus() in admin.service.ts, which rejects it outright).
const ADMIN_SETTABLE_STATUSES = Object.values(BedStatus).filter((s) => s !== BedStatus.OCCUPIED);
const BED_STATUS_OPTIONS = ADMIN_SETTABLE_STATUSES.map((v) => ({ value: v, label: v }));

function BedRow({ bed }: { bed: AdminBed }) {
  const updateBedStatus = useUpdateBedStatus();
  const [status, setStatus] = useState<BedStatus>(bed.status);
  const [reason, setReason] = useState(bed.outOfServiceReason ?? "");
  const isOccupied = bed.status === BedStatus.OCCUPIED;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-b-0">
      <div className="min-w-[100px]">
        <p className="text-sm font-medium text-slate-800">{bed.bedNumber}</p>
        <Badge tone={BED_STATUS_TONE[bed.status]}>{bed.status}</Badge>
      </div>

      {isOccupied ? (
        <p className="text-xs text-slate-400">Occupied — manage via IPD discharge</p>
      ) : (
        <div className="flex flex-1 items-center gap-2">
          <Select
            options={BED_STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value as BedStatus)}
            className="w-36"
          />
          {(status === BedStatus.MAINTENANCE || status === BedStatus.BLOCKED) && (
            <Input placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} className="flex-1" />
          )}
          <Button
            size="sm"
            variant="outline"
            isLoading={updateBedStatus.isPending && updateBedStatus.variables?.bedId === bed._id}
            disabled={status === bed.status && reason === (bed.outOfServiceReason ?? "")}
            onClick={() => updateBedStatus.mutate({ bedId: bed._id, status, reason: reason || undefined })}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}

const wardFormSchema = z.object({
  name: z.string().min(1, "Required"),
  code: z.string().min(1, "Required").optional(),
  category: z.nativeEnum(WardCategory).optional(),
  floor: z.string().min(1, "Required"),
  totalBedCapacity: z.coerce.number().int().min(1).max(500),
  baseRent: z.coerce.number().min(0),
  generateBeds: z.boolean().optional(),
});

type WardFormValues = z.infer<typeof wardFormSchema>;

export function WardEditModal({ wardEntry, onClose }: { wardEntry: WardWithTariff | null; onClose: () => void }) {
  const isCreate = wardEntry === null;
  const createWard = useCreateWard();
  const updateWard = useUpdateWard();
  const mutation = isCreate ? createWard : updateWard;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WardFormValues>({
    resolver: zodResolver(wardFormSchema),
    defaultValues: isCreate
      ? { category: WardCategory.GENERAL, totalBedCapacity: 10, baseRent: 0, generateBeds: true }
      : {
          name: wardEntry.ward.name,
          floor: wardEntry.ward.floor,
          totalBedCapacity: wardEntry.ward.totalBedCapacity,
          baseRent: wardEntry.baseRent,
        },
  });

  const onSubmit = handleSubmit((values) => {
    if (isCreate) {
      if (!values.code || !values.category) return;
      createWard.mutate(
        {
          name: values.name,
          code: values.code,
          category: values.category,
          floor: values.floor,
          totalBedCapacity: values.totalBedCapacity,
          baseRent: values.baseRent,
          generateBeds: values.generateBeds,
        },
        { onSuccess: onClose },
      );
    } else if (wardEntry) {
      updateWard.mutate(
        {
          wardId: wardEntry.ward._id,
          payload: {
            name: values.name,
            floor: values.floor,
            totalBedCapacity: values.totalBedCapacity,
            baseRent: values.baseRent,
          },
        },
        { onSuccess: onClose },
      );
    }
  });

  return (
    <Modal isOpen onClose={onClose} title={isCreate ? "Add Ward" : `Manage ${wardEntry.ward.name}`} widthClassName="max-w-2xl">
      <div className="space-y-5">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ward Name" error={errors.name?.message} {...register("name")} />
            {isCreate ? (
              <Input label="Ward Code" placeholder="e.g. ICU-A" error={errors.code?.message} {...register("code")} />
            ) : (
              <Input label="Ward Code" value={wardEntry.ward.code} disabled />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isCreate ? (
              <Select label="Category" options={CATEGORY_OPTIONS} error={errors.category?.message} {...register("category")} />
            ) : (
              <Input label="Category" value={wardEntry.ward.category} disabled />
            )}
            <Input label="Floor" error={errors.floor?.message} {...register("floor")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Total Bed Capacity"
              type="number"
              error={errors.totalBedCapacity?.message}
              {...register("totalBedCapacity")}
            />
            <Input label="Base Rent (per day)" type="number" step="0.01" error={errors.baseRent?.message} {...register("baseRent")} />
          </div>

          {isCreate && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" defaultChecked {...register("generateBeds")} />
              Automatically create {`{Total Bed Capacity}`} beds numbered {`{code}`}-001, {`{code}`}-002, …
            </label>
          )}

          {mutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(mutation.error)}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={mutation.isPending}>
              {isCreate ? "Create Ward" : "Save Ward Details"}
            </Button>
          </div>
        </form>

        {!isCreate && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Beds ({wardEntry.beds.length})
            </p>
            <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 px-3">
              {wardEntry.beds.map((bed) => (
                <BedRow key={bed._id} bed={bed} />
              ))}
              {wardEntry.beds.length === 0 && <p className="py-3 text-xs text-slate-400">No beds in this ward yet.</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
