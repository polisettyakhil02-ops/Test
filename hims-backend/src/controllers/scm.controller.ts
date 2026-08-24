import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { scmService } from "../services/scm.service.js";
import { LabOrderPriority, DepartmentIndentStatus, PurchaseOrderStatus, GrnStatus } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

function requireUser(req: Request): string {
  if (!req.user) throw new AuthenticationError("Must be authenticated");
  return req.user.id;
}

export async function listSuppliers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const suppliers = await scmService.listSuppliers();
    res.status(200).json({ data: suppliers });
  } catch (err) {
    next(err);
  }
}

export async function listWards(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const wards = await scmService.listWards();
    res.status(200).json({ data: wards });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * Department Indents
 * ==========================================================================*/

const RaiseIndentSchema = z.object({
  wardId: z.string().min(1),
  priority: z.nativeEnum(LabOrderPriority),
  items: z.array(z.object({ drugId: z.string().min(1), requestedQuantity: z.number().int().min(1) })).min(1),
  notes: z.string().max(1000).optional(),
});

export async function raiseIndent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = RaiseIndentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const indent = await scmService.raiseIndent({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: indent });
  } catch (err) {
    next(err);
  }
}

export async function listIndents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const wardId = typeof req.query.wardId === "string" ? req.query.wardId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as DepartmentIndentStatus) : undefined;
    const indents = await scmService.listIndents({ wardId, status });
    res.status(200).json({ data: indents });
  } catch (err) {
    next(err);
  }
}

const ReviewIndentSchema = z.object({
  approve: z.boolean(),
  approvedItems: z.array(z.object({ drugId: z.string().min(1), approvedQuantity: z.number().int().min(0) })).optional(),
  rejectionReason: z.string().max(500).optional(),
});

export async function reviewIndent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { indentId } = req.params;
    if (!indentId) throw new ValidationError("indentId route parameter is required");
    const parsed = ReviewIndentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const indent = await scmService.reviewIndent({ indentId, ...parsed.data, performedByUserId });
    res.status(200).json({ data: indent });
  } catch (err) {
    next(err);
  }
}

export async function markIndentFulfilled(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { indentId } = req.params;
    if (!indentId) throw new ValidationError("indentId route parameter is required");
    const indent = await scmService.markIndentFulfilled(indentId);
    res.status(200).json({ data: indent });
  } catch (err) {
    next(err);
  }
}

export async function getLowStockDrugs(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await scmService.getLowStockDrugs();
    res.status(200).json({ data: rows });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * Purchase Orders
 * ==========================================================================*/

const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  lineItems: z
    .array(z.object({ drugId: z.string().min(1), orderedQuantity: z.number().int().min(1), unitCostPrice: z.number().min(0) }))
    .min(1),
  expectedDeliveryDate: z.string().optional(),
  sourceIndentIds: z.array(z.string().min(1)).optional(),
});

export async function createPurchaseOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = CreatePurchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const po = await scmService.createPurchaseOrder({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: po });
  } catch (err) {
    next(err);
  }
}

export async function listPurchaseOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as PurchaseOrderStatus) : undefined;
    const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : undefined;
    const pos = await scmService.listPurchaseOrders({ status, supplierId });
    res.status(200).json({ data: pos });
  } catch (err) {
    next(err);
  }
}

export async function getPurchaseOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { poId } = req.params;
    if (!poId) throw new ValidationError("poId route parameter is required");
    const po = await scmService.getPurchaseOrder(poId);
    res.status(200).json({ data: po });
  } catch (err) {
    next(err);
  }
}

export async function submitPurchaseOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { poId } = req.params;
    if (!poId) throw new ValidationError("poId route parameter is required");
    const po = await scmService.submitPurchaseOrder(poId);
    res.status(200).json({ data: po });
  } catch (err) {
    next(err);
  }
}

export async function approvePurchaseOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { poId } = req.params;
    if (!poId) throw new ValidationError("poId route parameter is required");
    const po = await scmService.approvePurchaseOrder(poId, performedByUserId);
    res.status(200).json({ data: po });
  } catch (err) {
    next(err);
  }
}

export async function cancelPurchaseOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { poId } = req.params;
    if (!poId) throw new ValidationError("poId route parameter is required");
    const parsed = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const po = await scmService.cancelPurchaseOrder(poId, parsed.data.reason);
    res.status(200).json({ data: po });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * Goods Receipt Notes
 * ==========================================================================*/

const CreateGrnSchema = z.object({
  purchaseOrderId: z.string().min(1),
  supplierInvoiceNumber: z.string().optional(),
  supplierInvoiceDocumentKey: z.string().optional(),
  lines: z
    .array(
      z.object({
        purchaseOrderLineItemId: z.string().min(1),
        batchNumber: z.string().min(1),
        manufacturingDate: z.string().optional(),
        expiryDate: z.string().min(1),
        receivedQuantity: z.number().int().min(1),
        costPricePerUnit: z.number().min(0),
        mrpPerUnit: z.number().min(0),
        storageLocation: z.string().optional(),
      }),
    )
    .min(1),
});

export async function createGrn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = CreateGrnSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const grn = await scmService.createGrn({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: grn });
  } catch (err) {
    next(err);
  }
}

export async function listGrns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const purchaseOrderId = typeof req.query.purchaseOrderId === "string" ? req.query.purchaseOrderId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as GrnStatus) : undefined;
    const grns = await scmService.listGrns({ purchaseOrderId, status });
    res.status(200).json({ data: grns });
  } catch (err) {
    next(err);
  }
}

export async function getGrn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { grnId } = req.params;
    if (!grnId) throw new ValidationError("grnId route parameter is required");
    const grn = await scmService.getGrn(grnId);
    res.status(200).json({ data: grn });
  } catch (err) {
    next(err);
  }
}

export async function verifyGrn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { grnId } = req.params;
    if (!grnId) throw new ValidationError("grnId route parameter is required");
    const grn = await scmService.verifyGrn(grnId, performedByUserId);
    res.status(200).json({ data: grn });
  } catch (err) {
    next(err);
  }
}

export async function postGrnToStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { grnId } = req.params;
    if (!grnId) throw new ValidationError("grnId route parameter is required");
    const grn = await scmService.postGrnToStock(grnId, performedByUserId);
    res.status(200).json({ data: grn });
  } catch (err) {
    next(err);
  }
}
