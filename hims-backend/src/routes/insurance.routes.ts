import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import * as insuranceController from "../controllers/insurance.controller.js";

/**
 * Mounted at /api/insurance in routes/index.ts. Every route gated
 * identically at the router level (TPA Officer runs the desk day to day;
 * Billing Executive settles once a claim is approved; Hospital Admin has
 * oversight) — the same "one shared gate, distinct actions" pattern
 * admin.routes.ts uses, rather than splitting hairs over which of the
 * three roles performs which specific action.
 */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.TPA_OFFICER, SystemRole.BILLING_EXECUTIVE, SystemRole.HOSPITAL_ADMIN));

router.get("/claims", auditLogger("READ", "PreAuthorization"), insuranceController.listClaims);
router.post("/claims", auditLogger("WRITE", "PreAuthorization"), insuranceController.raiseClaim);
router.post("/claims/:preAuthId/respond", auditLogger("WRITE", "PreAuthorization"), insuranceController.respondToPreAuth);
router.post("/claims/:preAuthId/query", auditLogger("WRITE", "PreAuthorization"), insuranceController.raiseQuery);
router.post(
  "/claims/:preAuthId/query-response",
  auditLogger("WRITE", "PreAuthorization"),
  insuranceController.respondToQuery,
);
router.post("/claims/:preAuthId/settle", auditLogger("WRITE", "PreAuthorization"), insuranceController.settleClaim);

export default router;
