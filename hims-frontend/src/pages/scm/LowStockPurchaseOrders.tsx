import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLowStockDrugs, usePurchaseOrders, useCreatePurchaseOrder, useSubmitPurchaseOrder, useApprovePurchaseOrder, useCancelPurchaseOrder, useScmSuppliers } from "@/hooks/useSCM";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { PurchaseOrderStatus } from "@/types/common.types";
import type { PurchaseOrder, LowStockDrug } from "@/types/scm.types";

function supplierLabel(po: PurchaseOrder): string {
  return typeof po.supplierId === "string" ? po.supplierId : `${po.supplierId.name} (${po.supplierId.supplierCode})`;
}

const STATUS_TONE: Record<PurchaseOrderStatus, BadgeTone> = {
  DRAFT: "gray",
  SUBMITTED: "blue",
  APPROVED: "purple",
  PARTIALLY_RECEIVED: "yellow",
  RECEIVED: "green",
  CANCELLED: "red",
};

/** Low-stock alerts feed directly into a prefilled PO; the PO list below shows every order through submit/approve/cancel. */
export function LowStockPurchaseOrders() {
  const lowStockQuery = useLowStockDrugs();
  const posQuery = usePurchaseOrders();
  const submitMutation = useSubmitPurchaseOrder;
  const approveMutation = useApprovePurchaseOrder;
  const cancelMutation = useCancelPurchaseOrder;
  const [prefill, setPrefill] = useState<LowStockDrug[] | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Below Reorder Level ({lowStockQuery.data?.length ?? "—"})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lowStockQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {lowStockQuery.data && lowStockQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="Nothing below reorder level" description="Every active drug is stocked above its minimum." />
            </div>
          )}
          {lowStockQuery.data && lowStockQuery.data.length > 0 && (
            <>
              <div className="divide-y divide-slate-100">
                {lowStockQuery.data.map((row) => (
                  <div key={row.drugId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="font-medium text-slate-900">{row.drugName}</span>
                    <span className="text-xs text-slate-500">
                      on hand {row.onHand} / reorder {row.reorderLevel} · suggest ordering {row.suggestedOrderQuantity}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end p-3">
                <Button
                  size="sm"
                  onClick={() => {
                    setPrefill(lowStockQuery.data ?? []);
                    setIsCreateOpen(true);
                  }}
                >
                  Auto-Generate PO from Low Stock
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setPrefill(null);
              setIsCreateOpen(true);
            }}
          >
            + New PO
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {posQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {posQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(posQuery.error)} />
            </div>
          )}
          {posQuery.data && posQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No purchase orders yet" description="Create one manually or from the low-stock list above." />
            </div>
          )}
          {posQuery.data && posQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {posQuery.data.map((po) => (
                <PoRow key={po._id} po={po} submitHook={submitMutation} approveHook={approveMutation} cancelHook={cancelMutation} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isCreateOpen && <CreatePurchaseOrderModal prefillLowStock={prefill} onClose={() => setIsCreateOpen(false)} />}
    </div>
  );
}

function PoRow({
  po,
  submitHook,
  approveHook,
  cancelHook,
}: {
  po: PurchaseOrder;
  submitHook: (poId: string) => ReturnType<typeof useSubmitPurchaseOrder>;
  approveHook: (poId: string) => ReturnType<typeof useApprovePurchaseOrder>;
  cancelHook: (poId: string) => ReturnType<typeof useCancelPurchaseOrder>;
}) {
  const submitMutation = submitHook(po._id);
  const approveMutation = approveHook(po._id);
  const cancelMutation = cancelHook(po._id);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {po.poNumber} · {supplierLabel(po)}
        </p>
        <p className="text-xs text-slate-500">
          {po.lineItems.length} line(s) · ₹{po.totalAmount.toLocaleString("en-IN")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[po.status]}>{po.status.replace(/_/g, " ")}</Badge>
        {po.status === PurchaseOrderStatus.DRAFT && (
          <Button size="sm" variant="outline" isLoading={submitMutation.isPending} onClick={() => submitMutation.mutate(undefined)}>
            Submit
          </Button>
        )}
        {po.status === PurchaseOrderStatus.SUBMITTED && (
          <Button size="sm" isLoading={approveMutation.isPending} onClick={() => approveMutation.mutate(undefined)}>
            Approve
          </Button>
        )}
        {(po.status === PurchaseOrderStatus.DRAFT || po.status === PurchaseOrderStatus.SUBMITTED) && (
          <Button
            size="sm"
            variant="danger"
            isLoading={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({ reason: "Cancelled by procurement" })}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

const formSchema = z.object({
  supplierId: z.string().min(1, "Required"),
  lineItems: z
    .array(z.object({ drugId: z.string().min(1, "Required"), orderedQuantity: z.coerce.number().int().min(1), unitCostPrice: z.coerce.number().min(0) }))
    .min(1),
  expectedDeliveryDate: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function CreatePurchaseOrderModal({ prefillLowStock, onClose }: { prefillLowStock: LowStockDrug[] | null; onClose: () => void }) {
  const suppliersQuery = useScmSuppliers();
  const createMutation = useCreatePurchaseOrder();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      lineItems: prefillLowStock && prefillLowStock.length > 0
        ? prefillLowStock.map((row) => ({ drugId: row.drugId, orderedQuantity: row.suggestedOrderQuantity || 1, unitCostPrice: 0 }))
        : [{ drugId: "", orderedQuantity: 1, unitCostPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Create Purchase Order" widthClassName="max-w-2xl">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Supplier"
            placeholder={suppliersQuery.isLoading ? "Loading…" : "Select a supplier"}
            options={(suppliersQuery.data ?? []).map((s) => ({ value: s._id, label: `${s.name} (${s.supplierCode})` }))}
            error={errors.supplierId?.message}
            {...register("supplierId")}
          />
          <Input label="Expected Delivery" type="date" {...register("expectedDeliveryDate")} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line Items</p>
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-2">
              <Input
                placeholder="Drug ObjectId"
                error={errors.lineItems?.[index]?.drugId?.message}
                {...register(`lineItems.${index}.drugId` as const)}
              />
              <Input type="number" placeholder="Qty" {...register(`lineItems.${index}.orderedQuantity` as const)} />
              <Input type="number" step="0.01" placeholder="Unit cost" {...register(`lineItems.${index}.unitCostPrice` as const)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                ✕
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ drugId: "", orderedQuantity: 1, unitCostPrice: 0 })}>
            + Add Line
          </Button>
        </div>

        {createMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Create PO
          </Button>
        </div>
      </form>
    </Modal>
  );
}
