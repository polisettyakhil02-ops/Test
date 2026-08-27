import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import * as assetController from "../controllers/asset.controller.js";

/** Mounted at /api/assets in routes/index.ts. Every endpoint here is gated identically, so the role check is applied once at the router level, matching admin.routes.ts's pattern. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.BIOMEDICAL_ENGINEER, SystemRole.HOSPITAL_ADMIN));

router.get("/", auditLogger("READ", "Asset"), assetController.listAssets);
router.post("/", auditLogger("WRITE", "Asset"), assetController.createAsset);

router.get("/tickets", auditLogger("READ", "MaintenanceTicket"), assetController.listMaintenanceTickets);
router.post("/tickets/:ticketId/resolve", auditLogger("WRITE", "MaintenanceTicket"), assetController.resolveMaintenanceTicket);

router.post("/:assetId/breakdown", auditLogger("WRITE", "MaintenanceTicket"), assetController.logBreakdown);
router.post("/:assetId/pm-schedule", auditLogger("WRITE", "MaintenanceTicket"), assetController.schedulePreventiveMaintenance);
router.post("/:assetId/amc-renew", auditLogger("WRITE", "Asset"), assetController.renewAmc);

export default router;
