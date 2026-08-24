import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { listQueue, getSpecimenLabel, collectSpecimen } from "../controllers/phlebotomy.controller.js";

/** Mounted at /api/phlebotomy in routes/index.ts. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.PHLEBOTOMIST, SystemRole.LAB_TECHNICIAN, SystemRole.HOSPITAL_ADMIN));

router.get("/queue", auditLogger("READ", "Specimen"), listQueue);
router.get("/specimens/:barcodeValue", auditLogger("READ", "Specimen"), getSpecimenLabel);
router.post("/specimens/collect", auditLogger("WRITE", "Specimen"), collectSpecimen);

export default router;
