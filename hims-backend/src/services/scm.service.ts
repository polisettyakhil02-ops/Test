import { Types } from "mongoose";
import { withTransaction } from "../config/database.js";
import { DepartmentIndent, type DepartmentIndentDocument, type IndentLineItem } from "../models/scm/DepartmentIndent.model.js";
import { GoodsReceiptNote, type GoodsReceiptNoteDocument, type GrnLineItem } from "../models/scm/GoodsReceiptNote.model.js";
import { PurchaseOrder, type PurchaseOrderDocument, type PurchaseOrderLineItem } from "../models/pharmacy/PurchaseOrder.model.js";
import { DrugBatch } from "../models/pharmacy/DrugBatch.model.js";
import { StockTransaction } from "../models/pharmacy/StockTransaction.model.js";
import { Drug } from "../models/pharmacy/Drug.model.js";
import { Ward } from "../models/ipd/Ward.model.js";
import { Supplier } from "../models/pharmacy/Supplier.model.js";
import { LabOrderPriority, DepartmentIndentStatus, PurchaseOrderStatus, GrnStatus, StockTransactionType } from "../types/common.types.js";
import {
  generateIndentNumber,
  generatePurchaseOrderNumber,
  generateGrnNumber,
} from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { round2 } from "../utils/money.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";

/**
 * Procurement/SCM: `DepartmentIndent` (a ward's demand), `PurchaseOrder`
 * (the vendor-facing supply order — the model has existed since Step 1
 * but this is the first service to actually drive it), and
 * `GoodsReceiptNote` (what physically arrived). `postGrnToStock` is the
 * one genuinely multi-collection write (new `DrugBatch` rows + a
 * `StockTransaction` ledger entry per line + the owning `PurchaseOrder`'s
 * received-quantity/status update, all-or-nothing) — every other mutation
 * here is a single-document transition, the same reasoning documented on
 * `EMRService.addPrescription` and every `DialysisService`/
 * `SpecialtyEmr` transition.
 */

/* ============================================================================
 * Department Indents
 * ==========================================================================*/

export interface RaiseIndentInput {
  wardId: string;
  priority: LabOrderPriority;
  items: { drugId: string; requestedQuantity: number }[];
  notes?: string;
  performedByUserId: string;
}

export interface ReviewIndentInput {
  indentId: string;
  approve: boolean;
  approvedItems?: { drugId: string; approvedQuantity: number }[]; // required when approve=true
  rejectionReason?: string; // required when approve=false
  performedByUserId: string;
}

export class SCMService {
  /** The PO/indent forms' picker lists — no dedicated Supplier/Ward service exists yet (Step 1 scaffolded both models with no reader), so SCM exposes the minimal read every one of its own create forms needs. */
  async listSuppliers() {
    return Supplier.find({ isActive: true }).sort({ name: 1 });
  }

  async listWards() {
    return Ward.find({ isActive: true }).sort({ name: 1 });
  }

  async raiseIndent(input: RaiseIndentInput): Promise<DepartmentIndentDocument> {
    if (input.items.length === 0) throw new ValidationError("At least one item is required");

    const wardId = toObjectId(input.wardId, "wardId");
    const ward = await Ward.findById(wardId).lean();
    if (!ward) throw new NotFoundError(`Ward ${input.wardId} not found`);

    const drugIds = input.items.map((item) => toObjectId(item.drugId, "items[].drugId"));
    const drugs = await Drug.find({ _id: { $in: drugIds } }).lean();
    const drugById = new Map(drugs.map((d) => [d._id.toString(), d]));

    const items: IndentLineItem[] = input.items.map((item) => {
      const drug = drugById.get(item.drugId);
      if (!drug) throw new NotFoundError(`Drug ${item.drugId} not found`);
      return { drugId: drug._id, drugName: drug.brandName ? `${drug.genericName} (${drug.brandName})` : drug.genericName, requestedQuantity: item.requestedQuantity };
    });

    const indentNumber = await generateIndentNumber();
    return DepartmentIndent.create({
      indentNumber,
      wardId,
      requestedByUserId: input.performedByUserId,
      priority: input.priority,
      status: DepartmentIndentStatus.PENDING,
      items,
      notes: input.notes,
      linkedPurchaseOrderIds: [],
      createdBy: input.performedByUserId,
    });
  }

  async reviewIndent(input: ReviewIndentInput): Promise<DepartmentIndentDocument> {
    const indent = await DepartmentIndent.findById(toObjectId(input.indentId, "indentId"));
    if (!indent) throw new NotFoundError(`Indent ${input.indentId} not found`);
    if (indent.status !== DepartmentIndentStatus.PENDING) {
      throw new ConflictError(`Indent ${indent.indentNumber} is ${indent.status}, not PENDING`);
    }

    if (!input.approve) {
      if (!input.rejectionReason?.trim()) throw new ValidationError("rejectionReason is required when rejecting");
      indent.status = DepartmentIndentStatus.REJECTED;
      indent.rejectionReason = input.rejectionReason.trim();
    } else {
      if (!input.approvedItems || input.approvedItems.length === 0) {
        throw new ValidationError("approvedItems is required when approving");
      }
      const approvedByDrugId = new Map(input.approvedItems.map((a) => [a.drugId, a.approvedQuantity]));
      let anyFullyApproved = false;
      let anyPartial = false;
      for (const item of indent.items) {
        const approvedQuantity = approvedByDrugId.get(item.drugId.toString());
        if (approvedQuantity === undefined) continue;
        item.approvedQuantity = approvedQuantity;
        if (approvedQuantity >= item.requestedQuantity) anyFullyApproved = true;
        if (approvedQuantity > 0 && approvedQuantity < item.requestedQuantity) anyPartial = true;
      }
      indent.status = anyPartial || !anyFullyApproved ? DepartmentIndentStatus.PARTIALLY_APPROVED : DepartmentIndentStatus.APPROVED;
    }

    indent.reviewedByUserId = input.performedByUserId;
    indent.reviewedAt = new Date();
    await indent.save();
    return indent;
  }

  async markIndentFulfilled(indentId: string): Promise<DepartmentIndentDocument> {
    const indent = await DepartmentIndent.findById(toObjectId(indentId, "indentId"));
    if (!indent) throw new NotFoundError(`Indent ${indentId} not found`);
    if (indent.status !== DepartmentIndentStatus.APPROVED && indent.status !== DepartmentIndentStatus.PARTIALLY_APPROVED) {
      throw new ConflictError(`Indent ${indent.indentNumber} is ${indent.status}, not an approved indent`);
    }
    indent.status = DepartmentIndentStatus.FULFILLED;
    await indent.save();
    return indent;
  }

  async listIndents(filters: { wardId?: string; status?: DepartmentIndentStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.wardId) query.wardId = toObjectId(filters.wardId, "wardId");
    if (filters.status) query.status = filters.status;
    return DepartmentIndent.find(query).sort({ priority: 1, createdAt: 1 }).populate("wardId", "name code");
  }

  /** Every non-quarantined batch's on-hand stock, summed per drug, against that drug's reorderLevel — the auto-PO dashboard's data source. */
  async getLowStockDrugs() {
    const stockByDrug = await DrugBatch.aggregate<{ _id: Types.ObjectId; onHand: number }>([
      { $match: { isQuarantined: false } },
      { $group: { _id: "$drugId", onHand: { $sum: "$quantityOnHand" } } },
    ]);
    const onHandByDrugId = new Map(stockByDrug.map((row) => [row._id.toString(), row.onHand]));

    const drugs = await Drug.find({ isActive: true }).lean();
    return drugs
      .map((drug) => ({ drug, onHand: onHandByDrugId.get(drug._id.toString()) ?? 0 }))
      .filter((row) => row.onHand < row.drug.reorderLevel)
      .map((row) => ({
        drugId: row.drug._id,
        drugCode: row.drug.drugCode,
        drugName: row.drug.brandName ? `${row.drug.genericName} (${row.drug.brandName})` : row.drug.genericName,
        onHand: row.onHand,
        reorderLevel: row.drug.reorderLevel,
        suggestedOrderQuantity: row.drug.reorderQuantity,
      }));
  }

  /* ==========================================================================
   * Purchase Orders
   * ======================================================================= */

  async createPurchaseOrder(input: {
    supplierId: string;
    lineItems: { drugId: string; orderedQuantity: number; unitCostPrice: number }[];
    expectedDeliveryDate?: string;
    sourceIndentIds?: string[];
    performedByUserId: string;
  }): Promise<PurchaseOrderDocument> {
    if (input.lineItems.length === 0) throw new ValidationError("At least one line item is required");

    const supplierId = toObjectId(input.supplierId, "supplierId");
    const supplier = await Supplier.findById(supplierId).lean();
    if (!supplier) throw new NotFoundError(`Supplier ${input.supplierId} not found`);

    const drugIds = input.lineItems.map((li) => toObjectId(li.drugId, "lineItems[].drugId"));
    const drugs = await Drug.find({ _id: { $in: drugIds } }).lean();
    const drugById = new Map(drugs.map((d) => [d._id.toString(), d]));

    const lineItems: PurchaseOrderLineItem[] = input.lineItems.map((li) => {
      const drug = drugById.get(li.drugId);
      if (!drug) throw new NotFoundError(`Drug ${li.drugId} not found`);
      return {
        _id: new Types.ObjectId(),
        drugId: drug._id,
        drugName: drug.brandName ? `${drug.genericName} (${drug.brandName})` : drug.genericName,
        orderedQuantity: li.orderedQuantity,
        receivedQuantity: 0,
        unitCostPrice: li.unitCostPrice,
      };
    });
    const totalAmount = round2(lineItems.reduce((sum, li) => sum + li.orderedQuantity * li.unitCostPrice, 0));

    const sourceIndentIds = (input.sourceIndentIds ?? []).map((id) => toObjectId(id, "sourceIndentIds[]"));

    const poNumber = await generatePurchaseOrderNumber();
    const po = await PurchaseOrder.create({
      poNumber,
      supplierId,
      status: PurchaseOrderStatus.DRAFT,
      lineItems,
      totalAmount,
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : undefined,
      sourceIndentIds,
      createdBy: input.performedByUserId,
    });

    if (sourceIndentIds.length > 0) {
      await DepartmentIndent.updateMany({ _id: { $in: sourceIndentIds } }, { $addToSet: { linkedPurchaseOrderIds: po._id } });
    }

    return po;
  }

  async submitPurchaseOrder(poId: string): Promise<PurchaseOrderDocument> {
    const po = await PurchaseOrder.findById(toObjectId(poId, "poId"));
    if (!po) throw new NotFoundError(`Purchase order ${poId} not found`);
    if (po.status !== PurchaseOrderStatus.DRAFT) throw new ConflictError(`PO ${po.poNumber} is ${po.status}, not DRAFT`);
    po.status = PurchaseOrderStatus.SUBMITTED;
    await po.save();
    return po;
  }

  async approvePurchaseOrder(poId: string, performedByUserId: string): Promise<PurchaseOrderDocument> {
    const po = await PurchaseOrder.findById(toObjectId(poId, "poId"));
    if (!po) throw new NotFoundError(`Purchase order ${poId} not found`);
    if (po.status !== PurchaseOrderStatus.SUBMITTED) throw new ConflictError(`PO ${po.poNumber} is ${po.status}, not SUBMITTED`);
    po.status = PurchaseOrderStatus.APPROVED;
    po.approvedByUserId = performedByUserId;
    po.approvedAt = new Date();
    await po.save();
    return po;
  }

  async cancelPurchaseOrder(poId: string, reason: string): Promise<PurchaseOrderDocument> {
    if (!reason.trim()) throw new ValidationError("reason is required");
    const po = await PurchaseOrder.findById(toObjectId(poId, "poId"));
    if (!po) throw new NotFoundError(`Purchase order ${poId} not found`);
    if (po.lineItems.some((li) => li.receivedQuantity > 0)) {
      throw new ConflictError(`PO ${po.poNumber} already has receipts against it and cannot be cancelled`);
    }
    if (po.status === PurchaseOrderStatus.RECEIVED || po.status === PurchaseOrderStatus.CANCELLED) {
      throw new ConflictError(`PO ${po.poNumber} is ${po.status} and cannot be cancelled`);
    }
    po.status = PurchaseOrderStatus.CANCELLED;
    po.cancellationReason = reason.trim();
    await po.save();
    return po;
  }

  async listPurchaseOrders(filters: { status?: PurchaseOrderStatus; supplierId?: string } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.supplierId) query.supplierId = toObjectId(filters.supplierId, "supplierId");
    return PurchaseOrder.find(query).sort({ createdAt: -1 }).populate("supplierId", "name supplierCode");
  }

  async getPurchaseOrder(poId: string): Promise<PurchaseOrderDocument> {
    const po = await PurchaseOrder.findById(toObjectId(poId, "poId")).populate("supplierId", "name supplierCode");
    if (!po) throw new NotFoundError(`Purchase order ${poId} not found`);
    return po;
  }

  /* ==========================================================================
   * Goods Receipt Notes
   * ======================================================================= */

  async createGrn(input: {
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
    performedByUserId: string;
  }): Promise<GoodsReceiptNoteDocument> {
    if (input.lines.length === 0) throw new ValidationError("At least one line is required");

    const po = await PurchaseOrder.findById(toObjectId(input.purchaseOrderId, "purchaseOrderId"));
    if (!po) throw new NotFoundError(`Purchase order ${input.purchaseOrderId} not found`);
    if (po.status !== PurchaseOrderStatus.APPROVED && po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      throw new ConflictError(`PO ${po.poNumber} is ${po.status}; only an APPROVED or PARTIALLY_RECEIVED PO can receive goods`);
    }

    const poLineById = new Map(po.lineItems.map((li) => [li._id.toString(), li]));
    const lines: GrnLineItem[] = input.lines.map((line) => {
      const poLine = poLineById.get(line.purchaseOrderLineItemId);
      if (!poLine) throw new NotFoundError(`PO line item ${line.purchaseOrderLineItemId} not found on ${po.poNumber}`);
      const remaining = poLine.orderedQuantity - poLine.receivedQuantity;
      if (line.receivedQuantity > remaining) {
        throw new ValidationError(`Received quantity for ${poLine.drugName} (${line.receivedQuantity}) exceeds the remaining ordered quantity (${remaining})`);
      }
      const expiryDate = new Date(line.expiryDate);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() <= Date.now()) {
        throw new ValidationError(`expiryDate for ${poLine.drugName} must be a valid future date`);
      }
      return {
        purchaseOrderLineItemId: poLine._id,
        drugId: poLine.drugId,
        drugName: poLine.drugName,
        batchNumber: line.batchNumber,
        manufacturingDate: line.manufacturingDate ? new Date(line.manufacturingDate) : undefined,
        expiryDate,
        receivedQuantity: line.receivedQuantity,
        costPricePerUnit: line.costPricePerUnit,
        mrpPerUnit: line.mrpPerUnit,
        storageLocation: line.storageLocation,
      };
    });

    const grnNumber = await generateGrnNumber();
    return GoodsReceiptNote.create({
      grnNumber,
      purchaseOrderId: po._id,
      supplierId: po.supplierId,
      supplierInvoiceNumber: input.supplierInvoiceNumber,
      supplierInvoiceDocumentKey: input.supplierInvoiceDocumentKey,
      receivedDate: new Date(),
      lines,
      status: GrnStatus.PENDING_VERIFICATION,
      receivedByUserId: input.performedByUserId,
      createdBy: input.performedByUserId,
    });
  }

  async verifyGrn(grnId: string, performedByUserId: string): Promise<GoodsReceiptNoteDocument> {
    const grn = await GoodsReceiptNote.findById(toObjectId(grnId, "grnId"));
    if (!grn) throw new NotFoundError(`GRN ${grnId} not found`);
    if (grn.status !== GrnStatus.PENDING_VERIFICATION) {
      throw new ConflictError(`GRN ${grn.grnNumber} is ${grn.status}, not PENDING_VERIFICATION`);
    }
    grn.status = GrnStatus.VERIFIED;
    grn.verifiedByUserId = performedByUserId;
    grn.verifiedAt = new Date();
    await grn.save();
    return grn;
  }

  /**
   * The Step 15 showcase transaction: a *verified* GRN becomes real stock.
   * One `DrugBatch` + one `StockTransaction` (PURCHASE_RECEIPT) per GRN
   * line, the owning PO's `lineItems[].receivedQuantity` incremented and
   * its status advanced to PARTIALLY_RECEIVED or RECEIVED, and the GRN
   * itself flipped to POSTED — all inside one `withTransaction` call, so
   * a delivery can never half-land in the stock ledger.
   */
  async postGrnToStock(grnId: string, performedByUserId: string): Promise<GoodsReceiptNoteDocument> {
    const id = toObjectId(grnId, "grnId");

    return withTransaction(async (session) => {
      const grn = await GoodsReceiptNote.findById(id).session(session);
      if (!grn) throw new NotFoundError(`GRN ${grnId} not found`);
      if (grn.status !== GrnStatus.VERIFIED) {
        throw new ConflictError(`GRN ${grn.grnNumber} is ${grn.status}, not VERIFIED — verify it before posting to stock`);
      }

      const po = await PurchaseOrder.findById(grn.purchaseOrderId).session(session);
      if (!po) throw new NotFoundError(`Purchase order ${grn.purchaseOrderId.toString()} not found`);
      const poLineById = new Map(po.lineItems.map((li) => [li._id.toString(), li]));

      for (const line of grn.lines) {
        const batch = firstOrThrow(
          await DrugBatch.create(
            [
              {
                drugId: line.drugId,
                batchNumber: line.batchNumber,
                supplierId: grn.supplierId,
                purchaseOrderId: po._id,
                manufacturingDate: line.manufacturingDate,
                expiryDate: line.expiryDate,
                quantityReceived: line.receivedQuantity,
                quantityOnHand: line.receivedQuantity,
                costPricePerUnit: line.costPricePerUnit,
                mrpPerUnit: line.mrpPerUnit,
                storageLocation: line.storageLocation,
                receivedAt: new Date(),
                receivedByUserId: performedByUserId,
              },
            ],
            { session },
          ),
          "DrugBatch.create returned no document",
        );

        await StockTransaction.create(
          [
            {
              drugId: line.drugId,
              batchId: batch._id,
              type: StockTransactionType.PURCHASE_RECEIPT,
              quantityDelta: line.receivedQuantity,
              quantityOnHandAfter: batch.quantityOnHand,
              referenceType: "PURCHASE_ORDER",
              referenceId: po._id,
              reason: `GRN ${grn.grnNumber}`,
              performedByUserId,
              performedAt: new Date(),
            },
          ],
          { session },
        );

        line.drugBatchId = batch._id;

        const poLine = poLineById.get(line.purchaseOrderLineItemId.toString());
        if (poLine) poLine.receivedQuantity += line.receivedQuantity;
      }

      po.status = po.lineItems.every((li) => li.receivedQuantity >= li.orderedQuantity)
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      await po.save({ session });

      grn.status = GrnStatus.POSTED;
      grn.postedByUserId = performedByUserId;
      grn.postedAt = new Date();
      await grn.save({ session });

      return grn;
    });
  }

  async listGrns(filters: { purchaseOrderId?: string; status?: GrnStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.purchaseOrderId) query.purchaseOrderId = toObjectId(filters.purchaseOrderId, "purchaseOrderId");
    if (filters.status) query.status = filters.status;
    return GoodsReceiptNote.find(query).sort({ createdAt: -1 }).populate("supplierId", "name supplierCode");
  }

  async getGrn(grnId: string): Promise<GoodsReceiptNoteDocument> {
    const grn = await GoodsReceiptNote.findById(toObjectId(grnId, "grnId")).populate("supplierId", "name supplierCode");
    if (!grn) throw new NotFoundError(`GRN ${grnId} not found`);
    return grn;
  }
}

export const scmService = new SCMService();
