import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import * as adminController from "../controllers/admin.controller.js";

/**
 * Mounted at /api/admin in routes/index.ts. Every endpoint in this file
 * is gated identically — SUPER_ADMIN or HOSPITAL_ADMIN only — so the
 * auth/role check is applied once at the router level rather than
 * repeated on every route (unlike the other domain routers, where
 * different roles apply per endpoint).
 */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN));

// ---- Staff Directory Master ------------------------------------------------
router.get("/users", auditLogger("READ", "User"), adminController.listUsers);
router.post("/users", auditLogger("WRITE", "User"), adminController.createUser);
router.put("/users/:id", auditLogger("WRITE", "User"), adminController.updateUser);
router.delete("/users/:id", auditLogger("DELETE", "User"), adminController.deleteUser);
router.patch("/users/:id/status", auditLogger("WRITE", "User"), adminController.setUserStatus);
router.post("/users/:id/reset-password", auditLogger("WRITE", "User"), adminController.resetUserPassword);
router.get("/departments", auditLogger("READ", "Department"), adminController.listDepartments);

// ---- Patient Directory Master ----------------------------------------------
router.get("/patients", auditLogger("READ", "Patient"), adminController.listPatientsAdmin);
router.put("/patients/:id", auditLogger("WRITE", "Patient"), adminController.updatePatientAdmin);
router.delete("/patients/:id", auditLogger("DELETE", "Patient"), adminController.deletePatientAdmin);
router.post("/patients/merge", auditLogger("WRITE", "Patient"), adminController.mergePatientsAdmin);

// ---- Ward & Bed Tariff Master -----------------------------------------------
router.get("/wards", auditLogger("READ", "Ward"), adminController.listWardsAdmin);
router.post("/wards", auditLogger("WRITE", "Ward"), adminController.createWardAdmin);
router.put("/wards/:id", auditLogger("WRITE", "Ward"), adminController.updateWardAdmin);
router.patch("/beds/:bedId/status", auditLogger("WRITE", "Bed"), adminController.setBedStatusAdmin);

// ---- Global Audit Inspector --------------------------------------------------
router.get("/audit-logs", auditLogger("READ", "AuditLog"), adminController.listAuditLogsAdmin);

// ---- Role & Permission Matrix ------------------------------------------------
router.get("/roles", auditLogger("READ", "Role"), adminController.listRolesAdmin);
router.put("/roles/:systemRole/permissions", auditLogger("WRITE", "Role"), adminController.updateRolePermissionsAdmin);

export default router;
