import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  listErVisits,
  listErBays,
  registerErVisit,
  assignBay,
  recordPrimaryAssessment,
  getEmergencyEmrHistory,
  convertToIpdAdmission,
  dischargeErVisit,
} from "../controllers/emergency.controller.js";

/**
 * Mounted at /api/emergency in routes/index.ts. One shared role gate for
 * the whole ER desk (same pattern as insurance.routes.ts) — triage,
 * bay assignment, primary assessment, and disposition are all part of one
 * continuous ER workflow, not independently-scoped actions.
 */
const router = Router();

router.use(
  protect,
  authorizeRoles(SystemRole.ER_NURSE, SystemRole.DOCTOR, SystemRole.HEAD_NURSE, SystemRole.RECEPTIONIST, SystemRole.HOSPITAL_ADMIN),
);

router.get("/visits", auditLogger("READ", "ERVisit"), listErVisits);
router.post("/visits", auditLogger("WRITE", "ERVisit"), registerErVisit);
router.get("/bays", auditLogger("READ", "ERBay"), listErBays);
router.post("/visits/:erVisitId/assign-bay", auditLogger("WRITE", "ERVisit"), assignBay);
router.post("/visits/:erVisitId/primary-assessment", auditLogger("WRITE", "EmergencyEMR"), recordPrimaryAssessment);
router.get("/visits/:erVisitId/primary-assessment", auditLogger("READ", "EmergencyEMR"), getEmergencyEmrHistory);
router.post("/visits/:erVisitId/convert-to-admission", auditLogger("WRITE", "Admission"), convertToIpdAdmission);
router.post("/visits/:erVisitId/discharge", auditLogger("WRITE", "ERVisit"), dischargeErVisit);

export default router;
