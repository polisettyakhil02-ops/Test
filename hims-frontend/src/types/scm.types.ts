import type { LabOrderPriority, DepartmentIndentStatus, PurchaseOrderStatus, GrnStatus } from "./common.types";

export interface ScmWardSummary {
  _id: string;
  name: string;
  code: string;
}
export interface ScmSupplierSummary {
  _id: string;
  name: string;
  supplierCode: string;
}

export interface IndentLineItem {
  drugId: string;
  drugName: string;
  requestedQuantity: number;
  approvedQuantity?: number;
}

/** Mirrors DepartmentIndent.model.ts — wardId arrives populated on list responses. */
export interface DepartmentIndent {
  _id: string;
  indentNumber: string;
  wardId: ScmWardSummary | string;
  requestedByUserId: string;
  priority: LabOrderPriority;
  status: DepartmentIndentStatus;
  items: IndentLineItem[];
  notes?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  linkedPurchaseOrderIds: string[];
  createdAt: string;
}

export interface RaiseIndentPayload {
  wardId: string;
  priority: LabOrderPriority;
  items: { drugId: string; requestedQuantity: number }[];
  notes?: string;
}

export interface ReviewIndentPayload {
  approve: boolean;
  approvedItems?: { drugId: string; approvedQuantity: number }[];
  rejectionReason?: string;
}

export interface LowStockDrug {
  drugId: string;
  drugCode: string;
  drugName: string;
  onHand: number;
  reorderLevel: number;
  suggestedOrderQuantity: number;
}

export interface PurchaseOrderLineItem {
  _id: string;
  drugId: string;
  drugName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCostPrice: number;
}

/** Mirrors PurchaseOrder.model.ts — supplierId arrives populated on list/detail responses. */
export interface PurchaseOrder {
  _id: string;
  poNumber: string;
  supplierId: ScmSupplierSummary | string;
  status: PurchaseOrderStatus;
  lineItems: PurchaseOrderLineItem[];
  totalAmount: number;
  expectedDeliveryDate?: string;
  sourceIndentIds: string[];
  approvedByUserId?: string;
  approvedAt?: string;
  cancellationReason?: string;
  createdAt: string;
}

export interface CreatePurchaseOrderPayload {
  supplierId: string;
  lineItems: { drugId: string; orderedQuantity: number; unitCostPrice: number }[];
  expectedDeliveryDate?: string;
  sourceIndentIds?: string[];
}

export interface GrnLineItem {
  purchaseOrderLineItemId: string;
  drugId: string;
  drugName: string;
  batchNumber: string;
  manufacturingDate?: string;
  expiryDate: string;
  receivedQuantity: number;
  costPricePerUnit: number;
  mrpPerUnit: number;
  storageLocation?: string;
  drugBatchId?: string;
}

/** Mirrors GoodsReceiptNote.model.ts — supplierId arrives populated on list/detail responses. */
export interface GoodsReceiptNote {
  _id: string;
  grnNumber: string;
  purchaseOrderId: string;
  supplierId: ScmSupplierSummary | string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDocumentKey?: string;
  receivedDate: string;
  lines: GrnLineItem[];
  status: GrnStatus;
  receivedByUserId: string;
  verifiedByUserId?: string;
  verifiedAt?: string;
  postedByUserId?: string;
  postedAt?: string;
  createdAt: string;
}

export interface CreateGrnPayload {
  purchaseOrderId: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDocumentKey?: string;
  lines: {
    purchaseOrderLineItemId: string;
    batchNumber: string;
    manufacturingDate?: string;
    expiryDate: string;
    receivedQuantity: number;
    costPricePerUnit: number;
    mrpPerUnit: number;
    storageLocation?: string;
  }[];
}
