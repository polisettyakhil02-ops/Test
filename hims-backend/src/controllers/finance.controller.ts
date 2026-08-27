import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { financeService } from "../services/finance.service.js";
import { ExpenseCategory, ExpensePaymentStatus, PaymentMode } from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

function requireUser(req: Request): string {
  if (!req.user) throw new AuthenticationError("Must be authenticated");
  return req.user.id;
}

const LogExpenseSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().min(1).max(1000),
  amount: z.number().positive(),
  expenseDate: z.string().optional(),
  vendorName: z.string().optional(),
  invoiceDocumentKey: z.string().optional(),
  departmentId: z.string().optional(),
});

export async function logExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = LogExpenseSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const expense = await financeService.logExpense({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: expense });
  } catch (err) {
    next(err);
  }
}

export async function listExpenses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = typeof req.query.category === "string" ? (req.query.category as ExpenseCategory) : undefined;
    const paymentStatus = typeof req.query.paymentStatus === "string" ? (req.query.paymentStatus as ExpensePaymentStatus) : undefined;
    const expenses = await financeService.listExpenses({ category, paymentStatus });
    res.status(200).json({ data: expenses });
  } catch (err) {
    next(err);
  }
}

export async function getExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { expenseId } = req.params;
    if (!expenseId) throw new ValidationError("expenseId route parameter is required");
    const expense = await financeService.getExpense(expenseId);
    res.status(200).json({ data: expense });
  } catch (err) {
    next(err);
  }
}

const MarkPaidSchema = z.object({ paymentMode: z.nativeEnum(PaymentMode), paymentReferenceNumber: z.string().optional() });

export async function markExpensePaid(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { expenseId } = req.params;
    if (!expenseId) throw new ValidationError("expenseId route parameter is required");
    const parsed = MarkPaidSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const expense = await financeService.markExpensePaid({ expenseId, ...parsed.data, performedByUserId });
    res.status(200).json({ data: expense });
  } catch (err) {
    next(err);
  }
}
