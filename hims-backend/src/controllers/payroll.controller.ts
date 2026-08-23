import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { payrollService } from "../services/payroll.service.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

/** GET /api/payroll/doctors — the doctor picker for the payout dashboard. */
export async function listActiveDoctors(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctors = await payrollService.listActiveDoctors();
    res.status(200).json({ data: doctors });
  } catch (err) {
    next(err);
  }
}

/** GET /api/payroll/statements?doctorId= — a doctor's (or every doctor's) payout history. */
export async function listPayoutStatements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doctorId = typeof req.query.doctorId === "string" ? req.query.doctorId : undefined;
    const statements = await payrollService.listPayoutStatements(doctorId);
    res.status(200).json({ data: statements });
  } catch (err) {
    next(err);
  }
}

const GenerateStatementSchema = z
  .object({
    doctorId: z.string().min(1),
    periodYear: z.number().int().min(2000),
    periodMonth: z.number().int().min(1).max(12),
  })
  .strict();

/** POST /api/payroll/statements/generate — (re)computes a doctor's DRAFT statement for one month via PayrollService. */
export async function generatePayoutStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const parsed = GenerateStatementSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));

    const statement = await payrollService.generateMonthlyPayoutStatement(parsed.data, req.user.id);
    res.status(200).json({ data: statement });
  } catch (err) {
    next(err);
  }
}

/** POST /api/payroll/statements/:statementId/finalize — locks a DRAFT statement so it can no longer be recomputed. */
export async function finalizePayoutStatement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { statementId } = req.params;
    if (!statementId) throw new ValidationError("statementId route parameter is required");

    const statement = await payrollService.finalizePayout(statementId, req.user.id);
    res.status(200).json({ data: statement });
  } catch (err) {
    next(err);
  }
}
