import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { getPendingPrescriptions, dispenseMedication, searchDrugs } from "../controllers/pharmacy.controller.js";

/** Mounted at /api/pharmacy in routes/index.ts. */
const router = Router();

router.get(
  "/prescriptions/pending",
  protect,
  authorizeRoles(SystemRole.PHARMACIST),
  auditLogger("READ", "Prescription"),
  getPendingPrescriptions,
);

// DOCTOR is the actual caller here (the prescription builder's medication
// combobox on DoctorDesk, EMR_ROLES-gated at the frontend router), not
// just PHARMACIST — a catalog search over active drugs has no
// dispensing/stock sensitivity, so both are safe to grant.
router.get(
  "/drugs",
  protect,
  authorizeRoles(SystemRole.DOCTOR, SystemRole.PHARMACIST),
  auditLogger("READ", "Drug"),
  searchDrugs,
);

router.post(
  "/dispense",
  protect,
  authorizeRoles(SystemRole.PHARMACIST),
  auditLogger("WRITE", "Dispensation"),
  dispenseMedication,
);

export default router;
