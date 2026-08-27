import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  getOpdWaitingTimeStats,
  getIcuBounceBackRate,
  getSurgicalSiteInfectionRate,
  getDepartmentProfitability,
  getTopRevenueGeneratingDoctors,
  getPharmacyWastage,
} from "../controllers/analytics.controller.js";

/**
 * Mounted at /api/analytics in routes/index.ts. The Hospital Control
 * Tower is leadership's own dashboard — gated to `HOSPITAL_ADMIN`/
 * `SUPER_ADMIN` (the CEO/management persona) and `AUDITOR`, never the
 * per-desk operational roles every other router in this codebase gates
 * for, since nothing here is a day-to-day operational action, only
 * read-only cross-hospital reporting.
 */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.HOSPITAL_ADMIN, SystemRole.SUPER_ADMIN, SystemRole.AUDITOR));

router.get("/quality/opd-waiting-time", auditLogger("READ", "OPDQueue"), getOpdWaitingTimeStats);
router.get("/quality/icu-bounce-back-rate", auditLogger("READ", "Admission"), getIcuBounceBackRate);
router.get("/quality/surgical-site-infection-rate", auditLogger("READ", "OTSchedule"), getSurgicalSiteInfectionRate);

router.get("/finance/department-profitability", auditLogger("READ", "Invoice"), getDepartmentProfitability);
router.get("/finance/top-revenue-doctors", auditLogger("READ", "Invoice"), getTopRevenueGeneratingDoctors);
router.get("/finance/pharmacy-wastage", auditLogger("READ", "StockTransaction"), getPharmacyWastage);

export default router;
