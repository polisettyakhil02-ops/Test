import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  listEligibleForArchiving,
  createArchiveRecord,
  listArchives,
  listPendingCoding,
  getArchiveByBarcode,
  checkOutFile,
  checkInFile,
  finalizeIcdCoding,
  flagIcdQuery,
  logFileRequest,
  resolveFileRequest,
} from "../controllers/mrd.controller.js";

/** Mounted at /api/mrd in routes/index.ts. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.MRD_EXECUTIVE, SystemRole.HOSPITAL_ADMIN, SystemRole.SUPER_ADMIN));

router.get("/eligible-admissions", auditLogger("READ", "Admission"), listEligibleForArchiving);

router.post("/archives", auditLogger("WRITE", "MedicalRecordArchive"), createArchiveRecord);
router.get("/archives", auditLogger("READ", "MedicalRecordArchive"), listArchives);
router.get("/archives/pending-coding", auditLogger("READ", "MedicalRecordArchive"), listPendingCoding);
router.get("/archives/barcode/:barcode", auditLogger("READ", "MedicalRecordArchive"), getArchiveByBarcode);
router.post("/archives/checkout", auditLogger("WRITE", "MedicalRecordArchive"), checkOutFile);
router.post("/archives/checkin", auditLogger("WRITE", "MedicalRecordArchive"), checkInFile);
router.post("/archives/:archiveId/icd-coding", auditLogger("WRITE", "MedicalRecordArchive"), finalizeIcdCoding);
router.post("/archives/:archiveId/icd-query", auditLogger("WRITE", "MedicalRecordArchive"), flagIcdQuery);
router.post("/archives/:archiveId/requests", auditLogger("WRITE", "MedicalRecordArchive"), logFileRequest);
router.post("/archives/:archiveId/requests/:requestId/resolve", auditLogger("WRITE", "MedicalRecordArchive"), resolveFileRequest);

export default router;
