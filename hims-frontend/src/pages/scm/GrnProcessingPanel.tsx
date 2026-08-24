import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGrns, useCreateGrn, useVerifyGrn, usePostGrnToStock, usePurchaseOrders } from "@/hooks/useSCM";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { GrnStatus, PurchaseOrderStatus } from "@/types/common.types";
import type { GoodsReceiptNote, PurchaseOrder } from "@/types/scm.types";

function supplierLabel(grn: GoodsReceiptNote): string {
  return typeof grn.supplierId === "string" ? grn.supplierId : `${grn.supplierId.name} (${grn.supplierId.supplierCode})`;
}

const STATUS_TONE: Record<GrnStatus, BadgeTone> = { PENDING_VERIFICATION: "yellow", VERIFIED: "blue", POSTED: "green" };

/** Incoming deliveries: log a GRN against an approved PO, a supervisor verifies it, then posting turns it into real DrugBatch/StockTransaction ledger entries. */
export function GrnProcessingPanel() {
  const grnsQuery = useGrns();
  const verifyMutation = useVerifyGrn;
  const postMutation = usePostGrnToStock;
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Log what actually arrived, verify it, then post it into the live stock ledger.</p>
        <Button onClick={() => setIsCreateOpen(true)}>+ Log GRN</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {grnsQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {grnsQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(grnsQuery.error)} />
            </div>
          )}
          {grnsQuery.data && grnsQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No GRNs logged" description="Log a delivery against an approved PO to get started." />
            </div>
          )}
          {grnsQuery.data && grnsQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {grnsQuery.data.map((grn) => (
                <GrnRow key={grn._id} grn={grn} verifyHook={verifyMutation} postHook={postMutation} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isCreateOpen && <CreateGrnModal onClose={() => setIsCreateOpen(false)} />}
    </div>
  );
}

function GrnRow({
  grn,
  verifyHook,
  postHook,
}: {
  grn: GoodsReceiptNote;
  verifyHook: (grnId: string) => ReturnType<typeof useVerifyGrn>;
  postHook: (grnId: string) => ReturnType<typeof usePostGrnToStock>;
}) {
  const verifyMutation = verifyHook(grn._id);
  const postMutation = postHook(grn._id);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {grn.grnNumber} · {supplierLabel(grn)}
        </p>
        <p className="text-xs text-slate-500">{grn.lines.length} line(s) received {new Date(grn.receivedDate).toLocaleDateString()}</p>
        {(verifyMutation.isError || postMutation.isError) && (
          <p className="text-xs text-red-600">{getApiErrorMessage(verifyMutation.error ?? postMutation.error)}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[grn.status]}>{grn.status.replace(/_/g, " ")}</Badge>
        {grn.status === GrnStatus.PENDING_VERIFICATION && (
          <Button size="sm" variant="outline" isLoading={verifyMutation.isPending} onClick={() => verifyMutation.mutate()}>
            Verify
          </Button>
        )}
        {grn.status === GrnStatus.VERIFIED && (
          <Button size="sm" isLoading={postMutation.isPending} onClick={() => postMutation.mutate()}>
            Post to Stock
          </Button>
        )}
      </div>
    </div>
  );
}

const lineSchema = z.object({
  purchaseOrderLineItemId: z.string().min(1),
  batchNumber: z.string().min(1, "Required"),
  expiryDate: z.string().min(1, "Required"),
  receivedQuantity: z.coerce.number().int().min(1),
  costPricePerUnit: z.coerce.number().min(0),
  mrpPerUnit: z.coerce.number().min(0),
});
const formSchema = z.object({
  purchaseOrderId: z.string().min(1, "Required"),
  supplierInvoiceNumber: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});
type FormValues = z.infer<typeof formSchema>;

function receivablePoOptions(pos: PurchaseOrder[] | undefined) {
  return (pos ?? []).filter((po) => po.status === PurchaseOrderStatus.APPROVED || po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED);
}

function CreateGrnModal({ onClose }: { onClose: () => void }) {
  const posQuery = usePurchaseOrders();
  const createMutation = useCreateGrn();
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { lines: [] } });
  const { fields, replace } = useFieldArray({ control, name: "lines" });

  function handleSelectPo(poId: string) {
    const po = receivablePoOptions(posQuery.data).find((p) => p._id === poId) ?? null;
    setSelectedPo(po);
    setValue("purchaseOrderId", poId);
    if (po) {
      replace(
        po.lineItems
          .filter((li) => li.receivedQuantity < li.orderedQuantity)
          .map((li) => ({
            purchaseOrderLineItemId: li._id,
            batchNumber: "",
            expiryDate: "",
            receivedQuantity: li.orderedQuantity - li.receivedQuantity,
            costPricePerUnit: li.unitCostPrice,
            mrpPerUnit: li.unitCostPrice,
          })),
      );
    }
  }

  const onSubmit = handleSubmit((values) => {
    createMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title="Log Goods Receipt Note" widthClassName="max-w-2xl">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Select
          label="Purchase Order"
          placeholder={posQuery.isLoading ? "Loading…" : "Select an approved PO"}
          options={receivablePoOptions(posQuery.data).map((po) => ({ value: po._id, label: po.poNumber }))}
          error={errors.purchaseOrderId?.message}
          onChange={(e) => handleSelectPo(e.target.value)}
        />
        <Input label="Supplier Invoice Number (optional)" {...register("supplierInvoiceNumber")} />

        {selectedPo && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lines</p>
            {fields.map((field, index) => {
              const poLine = selectedPo.lineItems.find((li) => li._id === field.purchaseOrderLineItemId);
              return (
                <div key={field.id} className="rounded-md border border-slate-200 p-2">
                  <p className="mb-1 text-xs font-medium text-slate-700">{poLine?.drugName}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Batch number" error={errors.lines?.[index]?.batchNumber?.message} {...register(`lines.${index}.batchNumber` as const)} />
                    <Input type="date" error={errors.lines?.[index]?.expiryDate?.message} {...register(`lines.${index}.expiryDate` as const)} />
                    <Input type="number" placeholder="Received qty" {...register(`lines.${index}.receivedQuantity` as const)} />
                    <Input type="number" step="0.01" placeholder="Cost/unit" {...register(`lines.${index}.costPricePerUnit` as const)} />
                    <Input type="number" step="0.01" placeholder="MRP/unit" {...register(`lines.${index}.mrpPerUnit` as const)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {createMutation.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(createMutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!selectedPo || fields.length === 0} isLoading={createMutation.isPending}>
            Log GRN
          </Button>
        </div>
      </form>
    </Modal>
  );
}
