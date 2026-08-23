import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { registerPatient, getPatientByUhid, bookAppointment } from "../controllers/patient.controller.js";

/**
 * Covers both the Patient Master Index and OPD appointment booking (per
 * the spec grouping), so — unlike every other domain router, which is
 * mounted at its own "/api/<domain>" prefix in routes/index.ts — this
 * router declares its own full paths ("/patients", "/patients/:uhid",
 * "/appointments") and is mounted at the bare "/api" root instead.
 */
const router = Router();

router.post(
  "/patients",
  protect,
  authorizeRoles(SystemRole.RECEPTIONIST, SystemRole.HOSPITAL_ADMIN),
  auditLogger("WRITE", "Patient"),
  registerPatient,
);

router.get(
  "/patients/:uhid",
  protect,
  authorizeRoles(SystemRole.DOCTOR, SystemRole.RECEPTIONIST, SystemRole.HEAD_NURSE, SystemRole.STAFF_NURSE),
  auditLogger("READ", "Patient"),
  getPatientByUhid,
);

router.post(
  "/appointments",
  protect,
  authorizeRoles(SystemRole.RECEPTIONIST, SystemRole.HOSPITAL_ADMIN),
  auditLogger("WRITE", "OPDVisit"),
  bookAppointment,
);

export default router;
