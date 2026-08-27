import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  listSuppliers,
  listWards,
  raiseIndent,
  listIndents,
  reviewIndent,
  markIndentFulfilled,
  getLowStockDrugs,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createGrn,
  listGrns,
  getGrn,
  verifyGrn,
  postGrnToStock,
} from "../controllers/scm.controller.js";

/**
 * Mounted at /api/scm in routes/index.ts. One shared gate spanning both
 * personas this desk serves — ward staff raising indents, and the
 * procurement/finance side processing them into POs and GRNs — the same
 * wide-shared-gate pattern `emergency.routes.ts` already uses for a
 * multi-persona desk.
 */
const router = Router();

router.use(
  protect,
  authorizeRoles(
    SystemRole.HEAD_NURSE,
    SystemRole.STAFF_NURSE,
    SystemRole.PHARMACIST,
    SystemRole.PROCUREMENT_OFFICER,
    SystemRole.HOSPITAL_ADMIN,
    SystemRole.SUPER_ADMIN,
  ),
);

router.get("/suppliers", auditLogger("READ", "Supplier"), listSuppliers);
router.get("/wards", auditLogger("READ", "Ward"), listWards);

router.post("/indents", auditLogger("WRITE", "DepartmentIndent"), raiseIndent);
router.get("/indents", auditLogger("READ", "DepartmentIndent"), listIndents);
router.post("/indents/:indentId/review", auditLogger("WRITE", "DepartmentIndent"), reviewIndent);
router.post("/indents/:indentId/fulfill", auditLogger("WRITE", "DepartmentIndent"), markIndentFulfilled);

router.get("/low-stock", auditLogger("READ", "Drug"), getLowStockDrugs);

router.post("/purchase-orders", auditLogger("WRITE", "PurchaseOrder"), createPurchaseOrder);
router.get("/purchase-orders", auditLogger("READ", "PurchaseOrder"), listPurchaseOrders);
router.get("/purchase-orders/:poId", auditLogger("READ", "PurchaseOrder"), getPurchaseOrder);
router.post("/purchase-orders/:poId/submit", auditLogger("WRITE", "PurchaseOrder"), submitPurchaseOrder);
router.post("/purchase-orders/:poId/approve", auditLogger("WRITE", "PurchaseOrder"), approvePurchaseOrder);
router.post("/purchase-orders/:poId/cancel", auditLogger("WRITE", "PurchaseOrder"), cancelPurchaseOrder);

router.post("/grns", auditLogger("WRITE", "GoodsReceiptNote"), createGrn);
router.get("/grns", auditLogger("READ", "GoodsReceiptNote"), listGrns);
router.get("/grns/:grnId", auditLogger("READ", "GoodsReceiptNote"), getGrn);
router.post("/grns/:grnId/verify", auditLogger("WRITE", "GoodsReceiptNote"), verifyGrn);
router.post("/grns/:grnId/post", auditLogger("WRITE", "GoodsReceiptNote"), postGrnToStock);

export default router;
