import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { getPendingPrescriptions, dispenseMedication } from "../controllers/pharmacy.controller.js";

/** Mounted at /api/pharmacy in routes/index.ts. */
const router = Router();

router.get(
  "/prescriptions/pending",
  protect,
  authorizeRoles(SystemRole.PHARMACIST),
  auditLogger("READ", "Prescription"),
  getPendingPrescriptions,
);

router.post(
  "/dispense",
  protect,
  authorizeRoles(SystemRole.PHARMACIST),
  auditLogger("WRITE", "Dispensation"),
  dispenseMedication,
);

export default router;
