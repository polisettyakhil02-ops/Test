import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { createLabOrder, listLabOrders, receiveSpecimen, submitLabResult } from "../controllers/lims.controller.js";

/** Mounted at /api/lims in routes/index.ts. */
const router = Router();

router.post(
  "/orders",
  protect,
  authorizeRoles(SystemRole.DOCTOR),
  auditLogger("WRITE", "LabOrder"),
  createLabOrder,
);

router.get(
  "/orders",
  protect,
  authorizeRoles(SystemRole.LAB_TECHNICIAN),
  auditLogger("READ", "LabOrder"),
  listLabOrders,
);

router.post(
  "/orders/:orderId/tests/:lineId/result",
  protect,
  authorizeRoles(SystemRole.LAB_TECHNICIAN),
  auditLogger("WRITE", "LabResult"),
  submitLabResult,
);

router.post(
  "/specimens/receive",
  protect,
  authorizeRoles(SystemRole.LAB_TECHNICIAN),
  auditLogger("WRITE", "Specimen"),
  receiveSpecimen,
);

export default router;
