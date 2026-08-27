import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useIndents, useRaiseIndent, useReviewIndent, useScmWards } from "@/hooks/useSCM";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { LabOrderPriority, DepartmentIndentStatus } from "@/types/common.types";
import type { DepartmentIndent } from "@/types/scm.types";

function wardLabel(indent: DepartmentIndent): string {
  return typeof indent.wardId === "string" ? indent.wardId : `${indent.wardId.name} (${indent.wardId.code})`;
}

const STATUS_TONE: Record<DepartmentIndentStatus, BadgeTone> = {
  PENDING: "yellow",
  APPROVED: "green",
  PARTIALLY_APPROVED: "blue",
  REJECTED: "red",
  FULFILLED: "gray",
};
const PRIORITY_TONE: Record<LabOrderPriority, BadgeTone> = { STAT: "red", URGENT: "yellow", ROUTINE: "gray" };

/** Ward supply requests: raise, review (approve/reject per line), and the pending queue procurement works from. */
export function IndentsPanel() {
  const indentsQuery = useIndents();
  const [isRaiseOpen, setIsRaiseOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<DepartmentIndent | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Ward supply requests, oldest and most urgent first.</p>
        <Button onClick={() => setIsRaiseOpen(true)}>+ Raise Indent</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {indentsQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {indentsQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(indentsQuery.error)} />
            </div>
          )}
          {indentsQuery.data && indentsQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No indents" description="Raise an indent to request supplies from the central store." />
            </div>
          )}
          {indentsQuery.data && indentsQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {indentsQuery.data.map((indent) => (
                <button
                  key={indent._id}
                  type="button"
                  onClick={() => setReviewTarget(indent)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {indent.indentNumber} · {wardLabel(indent)}
                    </p>
                    <p className="text-xs text-slate-500">{indent.items.length} item(s)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={PRIORITY_TONE[indent.priority]}>{indent.priority}</Badge>
                    <Badge tone={STATUS_TONE[indent.status]}>{indent.status.replace(/_/g, " ")}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isRaiseOpen && <RaiseIndentModal onClose={() => setIsRaiseOpen(false)} />}
      {reviewTarget && <ReviewIndentModal indent={reviewTarget} onClose={() => setReviewTarget(null)} />}
    </div>
  );
}

const formSchema = z.object({
  wardId: z.string().min(1, "Required"),
  priority: z.nativeEnum(LabOrderPriority),
  items: z.array(z.object({ drugId: z.string().min(1, "Required"), requestedQuantity: z.coerce.number().int().min(1) })).min(1),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function RaiseIndentModal({ onClose }: { onClose: () => void }) {
  const wardsQuery = useScmWards();
  const raiseMutation = useRaiseIndent();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { priority: LabOrderPriority.ROUTINE, items: [{ drugId: "", requestedQuantity: 1 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const onSubmit = handleSubmit((values) => {
    raiseMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Raise Department Indent" widthClassName="max-w-xl">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Ward"
            placeholder={wardsQuery.isLoading ? "Loading…" : "Select a ward"}
            options={(wardsQuery.data ?? []).map((w) => ({ value: w._id, label: `${w.name} (${w.code})` }))}
            error={errors.wardId?.message}
            {...register("wardId")}
          />
          <Select label="Priority" options={Object.values(LabOrderPriority).map((v) => ({ value: v, label: v }))} {...register("priority")} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</p>
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[2fr_1fr_auto] items-end gap-2">
              <Input placeholder="Drug ObjectId" error={errors.items?.[index]?.drugId?.message} {...register(`items.${index}.drugId` as const)} />
              <Input type="number" placeholder="Qty" {...register(`items.${index}.requestedQuantity` as const)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                ✕
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ drugId: "", requestedQuantity: 1 })}>
            + Add Item
          </Button>
        </div>

        <Input label="Notes (optional)" {...register("notes")} />

        {raiseMutation.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(raiseMutation.error)}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={raiseMutation.isPending}>
            Raise Indent
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewIndentModal({ indent, onClose }: { indent: DepartmentIndent; onClose: () => void }) {
  const reviewMutation = useReviewIndent(indent._id);
  const [approvedQuantities, setApprovedQuantities] = useState<Record<string, string>>(
    Object.fromEntries(indent.items.map((item) => [item.drugId, String(item.requestedQuantity)])),
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);

  const isDecided = indent.status !== DepartmentIndentStatus.PENDING;

  return (
    <Modal isOpen onClose={onClose} title={`${indent.indentNumber}`} widthClassName="max-w-lg">
      <div className="space-y-4">
        <div className="space-y-1">
          {indent.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{item.drugName}</span>
              <span className="text-slate-500">
                requested {item.requestedQuantity}
                {item.approvedQuantity !== undefined ? ` · approved ${item.approvedQuantity}` : ""}
              </span>
            </div>
          ))}
        </div>
        {indent.notes && <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">{indent.notes}</p>}
        {indent.rejectionReason && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">Rejected: {indent.rejectionReason}</p>}

        {!isDecided && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            {mode === null && (
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => setMode("approve")}>
                  Approve
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => setMode("reject")}>
                  Reject
                </Button>
              </div>
            )}
            {mode === "approve" && (
              <div className="space-y-2">
                {indent.items.map((item) => (
                  <div key={item.drugId} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700">{item.drugName}</span>
                    <Input
                      type="number"
                      className="w-24"
                      value={approvedQuantities[item.drugId] ?? ""}
                      onChange={(e) => setApprovedQuantities({ ...approvedQuantities, [item.drugId]: e.target.value })}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  isLoading={reviewMutation.isPending}
                  onClick={() =>
                    reviewMutation.mutate(
                      {
                        approve: true,
                        approvedItems: Object.entries(approvedQuantities).map(([drugId, qty]) => ({ drugId, approvedQuantity: Number(qty) })),
                      },
                      { onSuccess: onClose },
                    )
                  }
                >
                  Confirm Approval
                </Button>
              </div>
            )}
            {mode === "reject" && (
              <div className="flex gap-2">
                <Input placeholder="Reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={!rejectionReason.trim()}
                  isLoading={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ approve: false, rejectionReason }, { onSuccess: onClose })}
                >
                  Confirm Rejection
                </Button>
              </div>
            )}
            {reviewMutation.isError && <p className="text-xs text-red-600">{getApiErrorMessage(reviewMutation.error)}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
