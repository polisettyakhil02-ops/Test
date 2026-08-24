import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  createIvfCycle,
  listIvfCycles,
  getIvfCycle,
  addIvfMonitoringVisit,
  recordIvfTrigger,
  recordEggRetrieval,
  recordFertilizationOutcome,
  addEmbryoTransfer,
  recordLutealSupport,
  recordBetaHcgResult,
  cancelIvfCycle,
  createObstetricRecord,
  listObstetricRecords,
  getObstetricRecord,
  addAncVisit,
  addPartographReading,
  recordDelivery,
  dischargePostnatal,
  createDmoHandoverNote,
  listDmoHandoverNotes,
  acknowledgeDmoHandoverNote,
} from "../controllers/specialtyEmr.controller.js";

/**
 * Mounted at /api/specialty-emr in routes/index.ts. Every writer here is a
 * Doctor — a fertility specialist, obstetrician, or duty medical officer is
 * a Doctor by role in this system, so Step 14 needs no new writer roles
 * beyond MRD_EXECUTIVE (see mrd.routes.ts).
 */
const router = Router();

router.use(
  protect,
  authorizeRoles(SystemRole.DOCTOR, SystemRole.HEAD_NURSE, SystemRole.STAFF_NURSE, SystemRole.HOSPITAL_ADMIN, SystemRole.SUPER_ADMIN),
);

router.post("/ivf/cycles", auditLogger("WRITE", "IvfCycle"), createIvfCycle);
router.get("/ivf/cycles", auditLogger("READ", "IvfCycle"), listIvfCycles);
router.get("/ivf/cycles/:cycleId", auditLogger("READ", "IvfCycle"), getIvfCycle);
router.post("/ivf/cycles/:cycleId/monitoring-visits", auditLogger("WRITE", "IvfCycle"), addIvfMonitoringVisit);
router.post("/ivf/cycles/:cycleId/trigger", auditLogger("WRITE", "IvfCycle"), recordIvfTrigger);
router.post("/ivf/cycles/:cycleId/egg-retrieval", auditLogger("WRITE", "IvfCycle"), recordEggRetrieval);
router.post("/ivf/cycles/:cycleId/fertilization-outcome", auditLogger("WRITE", "IvfCycle"), recordFertilizationOutcome);
router.post("/ivf/cycles/:cycleId/embryo-transfers", auditLogger("WRITE", "IvfCycle"), addEmbryoTransfer);
router.post("/ivf/cycles/:cycleId/luteal-support", auditLogger("WRITE", "IvfCycle"), recordLutealSupport);
router.post("/ivf/cycles/:cycleId/beta-hcg", auditLogger("WRITE", "IvfCycle"), recordBetaHcgResult);
router.post("/ivf/cycles/:cycleId/cancel", auditLogger("WRITE", "IvfCycle"), cancelIvfCycle);

router.post("/obstetric/records", auditLogger("WRITE", "ObstetricRecord"), createObstetricRecord);
router.get("/obstetric/records", auditLogger("READ", "ObstetricRecord"), listObstetricRecords);
router.get("/obstetric/records/:recordId", auditLogger("READ", "ObstetricRecord"), getObstetricRecord);
router.post("/obstetric/records/:recordId/anc-visits", auditLogger("WRITE", "ObstetricRecord"), addAncVisit);
router.post("/obstetric/records/:recordId/partograph", auditLogger("WRITE", "ObstetricRecord"), addPartographReading);
router.post("/obstetric/records/:recordId/delivery", auditLogger("WRITE", "ObstetricRecord"), recordDelivery);
router.post("/obstetric/records/:recordId/discharge", auditLogger("WRITE", "ObstetricRecord"), dischargePostnatal);

router.post("/dmo/notes", auditLogger("WRITE", "DmoHandoverNote"), createDmoHandoverNote);
router.get("/dmo/notes", auditLogger("READ", "DmoHandoverNote"), listDmoHandoverNotes);
router.post("/dmo/notes/:noteId/acknowledge", auditLogger("WRITE", "DmoHandoverNote"), acknowledgeDmoHandoverNote);

export default router;
