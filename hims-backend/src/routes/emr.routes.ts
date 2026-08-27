import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { addClinicalNote, addPrescription, getPatientTimeline } from "../controllers/emr.controller.js";

/** Mounted at /api/emr in routes/index.ts. */
const router = Router();

router.post(
  "/:patientId/notes",
  protect,
  authorizeRoles(SystemRole.DOCTOR),
  auditLogger("WRITE", "ClinicalNote"),
  addClinicalNote,
);

router.post(
  "/:patientId/prescriptions",
  protect,
  authorizeRoles(SystemRole.DOCTOR),
  auditLogger("WRITE", "Prescription"),
  addPrescription,
);

router.get(
  "/:patientId/timeline",
  protect,
  authorizeRoles(
    SystemRole.DOCTOR,
    SystemRole.HEAD_NURSE,
    SystemRole.STAFF_NURSE,
    SystemRole.RECEPTIONIST,
    SystemRole.HOSPITAL_ADMIN,
  ),
  auditLogger("READ", "PatientTimeline"),
  getPatientTimeline,
);

export default router;
