import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { scheduleSurgery, logSterilization } from "../controllers/ot.controller.js";

/** Mounted at /api/ot in routes/index.ts. */
const router = Router();

router.post(
  "/surgeries",
  protect,
  authorizeRoles(SystemRole.OT_COORDINATOR),
  auditLogger("WRITE", "OTSchedule"),
  scheduleSurgery,
);

router.post(
  "/sterilization-logs",
  protect,
  authorizeRoles(SystemRole.OT_COORDINATOR),
  auditLogger("WRITE", "SterilizationLog"),
  logSterilization,
);

export default router;
