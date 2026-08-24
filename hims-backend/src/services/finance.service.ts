import { Expense, type ExpenseDocument } from "../models/finance/Expense.model.js";
import { ExpenseCategory, ExpensePaymentStatus, PaymentMode } from "../types/common.types.js";
import { generateExpenseNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { round2 } from "../utils/money.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";

export interface LogExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate?: string;
  vendorName?: string;
  invoiceDocumentKey?: string;
  departmentId?: string;
  performedByUserId: string;
}

export interface MarkExpensePaidInput {
  expenseId: string;
  paymentMode: PaymentMode;
  paymentReferenceNumber?: string;
  performedByUserId: string;
}

/**
 * Accounts Payable's ledger of non-patient OPEX. Every write here is a
 * single document — `Expense` doesn't fan out into other collections the
 * way a GRN posting does — so nothing needs `withTransaction`.
 */
export class FinanceService {
  async logExpense(input: LogExpenseInput): Promise<ExpenseDocument> {
    if (input.amount <= 0) throw new ValidationError("amount must be positive");
    if (!input.description.trim()) throw new ValidationError("description is required");

    const expenseNumber = await generateExpenseNumber();
    return Expense.create({
      expenseNumber,
      category: input.category,
      description: input.description.trim(),
      amount: round2(input.amount),
      expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
      vendorName: input.vendorName,
      invoiceDocumentKey: input.invoiceDocumentKey,
      departmentId: input.departmentId ? toObjectId(input.departmentId, "departmentId") : undefined,
      paymentStatus: ExpensePaymentStatus.PENDING,
      createdBy: input.performedByUserId,
    });
  }

  async markExpensePaid(input: MarkExpensePaidInput): Promise<ExpenseDocument> {
    const expense = await Expense.findById(toObjectId(input.expenseId, "expenseId"));
    if (!expense) throw new NotFoundError(`Expense ${input.expenseId} not found`);
    if (expense.paymentStatus !== ExpensePaymentStatus.PENDING) {
      throw new ConflictError(`Expense ${expense.expenseNumber} is already ${expense.paymentStatus}`);
    }

    expense.paymentStatus = ExpensePaymentStatus.PAID;
    expense.paymentMode = input.paymentMode;
    expense.paymentReferenceNumber = input.paymentReferenceNumber;
    expense.paidAt = new Date();
    expense.paidByUserId = input.performedByUserId;
    await expense.save();
    return expense;
  }

  async listExpenses(filters: { category?: ExpenseCategory; paymentStatus?: ExpensePaymentStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.category) query.category = filters.category;
    if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
    return Expense.find(query).sort({ expenseDate: -1 });
  }

  async getExpense(expenseId: string): Promise<ExpenseDocument> {
    const expense = await Expense.findById(toObjectId(expenseId, "expenseId"));
    if (!expense) throw new NotFoundError(`Expense ${expenseId} not found`);
    return expense;
  }
}

export const financeService = new FinanceService();
