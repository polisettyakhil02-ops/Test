import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { getActiveInvoice, payInvoice } from "../controllers/billing.controller.js";

/** Mounted at /api/billing in routes/index.ts. */
const router = Router();

router.get(
  "/:patientId/active-invoice",
  protect,
  authorizeRoles(SystemRole.BILLING_EXECUTIVE, SystemRole.HOSPITAL_ADMIN),
  auditLogger("READ", "Invoice"),
  getActiveInvoice,
);

router.post(
  "/:invoiceId/pay",
  protect,
  authorizeRoles(SystemRole.BILLING_EXECUTIVE, SystemRole.HOSPITAL_ADMIN),
  auditLogger("WRITE", "Payment"),
  payInvoice,
);

export default router;
