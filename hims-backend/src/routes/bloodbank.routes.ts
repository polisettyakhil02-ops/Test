import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  registerDonor,
  listDonors,
  logDonation,
  listInventory,
  raiseCrossMatchRequest,
  listCrossMatchRequests,
  performCrossMatch,
  dispenseBloodBag,
} from "../controllers/bloodbank.controller.js";

/** Mounted at /api/bloodbank in routes/index.ts. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.BLOOD_BANK_TECHNICIAN, SystemRole.DOCTOR, SystemRole.HOSPITAL_ADMIN));

router.get("/donors", auditLogger("READ", "BloodDonor"), listDonors);
router.post("/donors", auditLogger("WRITE", "BloodDonor"), registerDonor);
router.post("/donors/:donorId/donations", auditLogger("WRITE", "BloodBag"), logDonation);

router.get("/inventory", auditLogger("READ", "BloodBag"), listInventory);

router.get("/crossmatch-requests", auditLogger("READ", "CrossMatchRequest"), listCrossMatchRequests);
router.post("/crossmatch-requests", auditLogger("WRITE", "CrossMatchRequest"), raiseCrossMatchRequest);
router.post("/crossmatch-requests/:requestId/perform", auditLogger("WRITE", "CrossMatchRequest"), performCrossMatch);
router.post("/crossmatch-requests/:requestId/dispense", auditLogger("WRITE", "BloodBag"), dispenseBloodBag);

export default router;
