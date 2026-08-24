import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  listMachines,
  scheduleDialysisSession,
  listSessions,
  startSession,
  completeSession,
  cancelSession,
} from "../controllers/dialysis.controller.js";

/** Mounted at /api/dialysis in routes/index.ts. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.DIALYSIS_TECHNICIAN, SystemRole.DOCTOR, SystemRole.HOSPITAL_ADMIN));

router.get("/machines", auditLogger("READ", "Asset"), listMachines);

router.get("/sessions", auditLogger("READ", "DialysisSession"), listSessions);
router.post("/sessions", auditLogger("WRITE", "DialysisSession"), scheduleDialysisSession);
router.post("/sessions/:sessionId/start", auditLogger("WRITE", "DialysisSession"), startSession);
router.post("/sessions/:sessionId/complete", auditLogger("WRITE", "DialysisSession"), completeSession);
router.post("/sessions/:sessionId/cancel", auditLogger("WRITE", "DialysisSession"), cancelSession);

export default router;
