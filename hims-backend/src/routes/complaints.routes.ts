import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import {
  createTicket,
  listTickets,
  getTicket,
  assignTicket,
  startTicketProgress,
  resolveTicket,
  closeTicket,
} from "../controllers/complaints.controller.js";

/**
 * Mounted at /api/complaints in routes/index.ts. Any authenticated staff
 * role can raise a ticket (a receptionist logging a patient grievance, a
 * nurse flagging a broken AC), so this desk's shared gate is deliberately
 * every non-patient role rather than a narrow procurement/finance-style
 * gate — mirroring how broadly `EMERGENCY_ROLES`/`SPECIALTY_EMR_ROLES`
 * are already drawn on the frontend for similarly hospital-wide desks.
 */
const router = Router();

router.use(
  protect,
  authorizeRoles(
    SystemRole.SUPER_ADMIN,
    SystemRole.HOSPITAL_ADMIN,
    SystemRole.FACILITY_MANAGER,
    SystemRole.MAINTENANCE_STAFF,
    SystemRole.DOCTOR,
    SystemRole.HEAD_NURSE,
    SystemRole.STAFF_NURSE,
    SystemRole.RECEPTIONIST,
    SystemRole.PHARMACIST,
    SystemRole.LAB_TECHNICIAN,
  ),
);

router.post("/tickets", auditLogger("WRITE", "Ticket"), createTicket);
router.get("/tickets", auditLogger("READ", "Ticket"), listTickets);
router.get("/tickets/:ticketId", auditLogger("READ", "Ticket"), getTicket);
router.post("/tickets/:ticketId/assign", auditLogger("WRITE", "Ticket"), assignTicket);
router.post("/tickets/:ticketId/start", auditLogger("WRITE", "Ticket"), startTicketProgress);
router.post("/tickets/:ticketId/resolve", auditLogger("WRITE", "Ticket"), resolveTicket);
router.post("/tickets/:ticketId/close", auditLogger("WRITE", "Ticket"), closeTicket);

export default router;
