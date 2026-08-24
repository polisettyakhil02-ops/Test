import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  listMachines,
  createOrder,
  listWorklist,
  getOrder,
  getModalityWorklist,
  scheduleOrder,
  startExam,
  markCompleted,
  getReportForOrder,
  saveReportDraft,
  finalizeReport,
} from "../controllers/radiology.controller.js";

/** Mounted at /api/radiology in routes/index.ts. One shared gate for the whole RIS desk, same pattern as insurance.routes.ts/emergency.routes.ts. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.RADIOLOGY_TECHNICIAN, SystemRole.DOCTOR, SystemRole.HOSPITAL_ADMIN));

router.get("/machines", auditLogger("READ", "Asset"), listMachines);

router.get("/orders", auditLogger("READ", "RadiologyOrder"), listWorklist);
router.post("/orders", auditLogger("WRITE", "RadiologyOrder"), createOrder);
router.get("/orders/:orderId", auditLogger("READ", "RadiologyOrder"), getOrder);
router.post("/orders/:orderId/schedule", auditLogger("WRITE", "RadiologyOrder"), scheduleOrder);
router.post("/orders/:orderId/start", auditLogger("WRITE", "RadiologyOrder"), startExam);
router.post("/orders/:orderId/complete", auditLogger("WRITE", "RadiologyOrder"), markCompleted);

router.get("/modality-worklist", auditLogger("READ", "RadiologyOrder"), getModalityWorklist);

router.get("/orders/:orderId/report", auditLogger("READ", "RadiologyReport"), getReportForOrder);
router.put("/orders/:orderId/report", auditLogger("WRITE", "RadiologyReport"), saveReportDraft);
router.post("/reports/:reportId/finalize", auditLogger("WRITE", "RadiologyReport"), finalizeReport);

export default router;
