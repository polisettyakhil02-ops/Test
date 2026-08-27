import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import * as payrollController from "../controllers/payroll.controller.js";

/** Mounted at /api/payroll in routes/index.ts. Financial data — Hospital Admin only. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.HOSPITAL_ADMIN));

router.get("/doctors", auditLogger("READ", "Doctor"), payrollController.listActiveDoctors);
router.get("/statements", auditLogger("READ", "PayoutStatement"), payrollController.listPayoutStatements);
router.post("/statements/generate", auditLogger("WRITE", "PayoutStatement"), payrollController.generatePayoutStatement);
router.post(
  "/statements/:statementId/finalize",
  auditLogger("WRITE", "PayoutStatement"),
  payrollController.finalizePayoutStatement,
);

export default router;
