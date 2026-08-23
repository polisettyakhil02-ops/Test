import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { admitPatient, getWardsMap } from "../controllers/ipd.controller.js";

/** Mounted at /api/ipd in routes/index.ts. */
const router = Router();

router.post(
  "/admit",
  protect,
  authorizeRoles(SystemRole.RECEPTIONIST, SystemRole.HOSPITAL_ADMIN),
  auditLogger("WRITE", "Admission"),
  admitPatient,
);

router.get(
  "/wards",
  protect,
  authorizeRoles(
    SystemRole.RECEPTIONIST,
    SystemRole.HOSPITAL_ADMIN,
    SystemRole.DOCTOR,
    SystemRole.HEAD_NURSE,
    SystemRole.STAFF_NURSE,
  ),
  auditLogger("READ", "Bed"),
  getWardsMap,
);

export default router;
