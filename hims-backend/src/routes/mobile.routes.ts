import { Router } from "express";
import { protectMobile } from "../middlewares/mobileAuth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { mobileLogin, listMyAppointments, bookMyAppointment, listMyIpdRounds } from "../controllers/mobile.controller.js";

/**
 * Mounted at /api/mobile in routes/index.ts. Every route below `/auth/login`
 * is gated by `protectMobile` — the mobile-only, `aud`-scoped JWT check —
 * never the web `protect`/cookie gate every other router in this codebase
 * uses, and each endpoint further narrows to the one role its app persona
 * actually has (a Doctor App build has no business calling the patient
 * endpoints and vice versa, even though both apps share this same router
 * file).
 */
const router = Router();

router.post("/auth/login", mobileLogin);

router.get(
  "/patient/appointments",
  protectMobile,
  authorizeRoles(SystemRole.PATIENT),
  auditLogger("READ", "OPDVisit"),
  listMyAppointments,
);
router.post(
  "/patient/appointments",
  protectMobile,
  authorizeRoles(SystemRole.PATIENT),
  auditLogger("WRITE", "OPDVisit"),
  bookMyAppointment,
);

router.get(
  "/doctor/ipd-rounds",
  protectMobile,
  authorizeRoles(SystemRole.DOCTOR),
  auditLogger("READ", "Admission"),
  listMyIpdRounds,
);

export default router;
