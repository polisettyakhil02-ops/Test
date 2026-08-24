import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/rbac.middleware.js";
import { auditLogger } from "../middlewares/audit.interceptor.js";
import { SystemRole } from "../types/common.types.js";
import { logExpense, listExpenses, getExpense, markExpensePaid } from "../controllers/finance.controller.js";

/** Mounted at /api/finance in routes/index.ts. */
const router = Router();

router.use(protect, authorizeRoles(SystemRole.ACCOUNTS_EXECUTIVE, SystemRole.HOSPITAL_ADMIN, SystemRole.SUPER_ADMIN));

router.post("/expenses", auditLogger("WRITE", "Expense"), logExpense);
router.get("/expenses", auditLogger("READ", "Expense"), listExpenses);
router.get("/expenses/:expenseId", auditLogger("READ", "Expense"), getExpense);
router.post("/expenses/:expenseId/pay", auditLogger("WRITE", "Expense"), markExpensePaid);

export default router;
