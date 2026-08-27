import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { admitPatient, getWardsMap, getAdmissionDetail, dischargePatient } from "../controllers/ipd.controller.js";

/** Mounted at /api/ipd in routes/index.ts. */
const router = Router();

/** Every role that can view the bed-management grid / occupied-bed drawer can also read admission detail and trigger discharge from it — kept as one constant so the three routes below can't silently drift apart. */
const BED_MANAGEMENT_ROLES = [
  SystemRole.RECEPTIONIST,
  SystemRole.HOSPITAL_ADMIN,
  SystemRole.DOCTOR,
  SystemRole.HEAD_NURSE,
  SystemRole.STAFF_NURSE,
];

router.post(
  "/admit",
  protect,
  authorizeRoles(SystemRole.RECEPTIONIST, SystemRole.HOSPITAL_ADMIN),
  auditLogger("WRITE", "Admission"),
  admitPatient,
);

router.get("/wards", protect, authorizeRoles(...BED_MANAGEMENT_ROLES), auditLogger("READ", "Bed"), getWardsMap);

router.get(
  "/admissions/:admissionId",
  protect,
  authorizeRoles(...BED_MANAGEMENT_ROLES),
  auditLogger("READ", "Admission"),
  getAdmissionDetail,
);

router.post(
  "/admissions/:admissionId/discharge",
  protect,
  authorizeRoles(...BED_MANAGEMENT_ROLES),
  auditLogger("WRITE", "Admission"),
  dischargePatient,
);

export default router;
