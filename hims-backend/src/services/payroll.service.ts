import type { Types } from "mongoose";
import { withTransaction } from "../config/database.js";
import { Doctor, type DoctorDocument } from "../models/opd/Doctor.model.js";
import { OPDVisit } from "../models/opd/OPDVisit.model.js";
import { OTSchedule } from "../models/ot/OTSchedule.model.js";
import { Invoice, type InvoiceLineItem } from "../models/billing/Invoice.model.js";
import { RevenueShareRule } from "../models/payroll/RevenueShareRule.model.js";
import {
  PayoutStatement,
  type PayoutStatementDocument,
  type PayoutStatementLine,
} from "../models/payroll/PayoutStatement.model.js";
import { InvoiceStatus, RevenueCategory, PayoutStatus } from "../types/common.types.js";
import { generatePayoutStatementNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { round2 } from "../utils/money.js";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors.js";

export interface GeneratePayoutInput {
  doctorId: string;
  periodYear: number;
  periodMonth: number; // 1-12
}

/**
 * Doctor Revenue Sharing engine. Attribution never parses invoice
 * description strings — it walks the same structural pointers
 * `InvoiceLineItem.sourceType`/`sourceId` already carry back to the
 * clinical encounter that generated the charge (`OPDVisit.doctorId` for
 * consultations, `OTSchedule.team[].userId`/`role` for surgeries), so a
 * doctor is credited only for revenue actually tied to their own
 * encounters. Only `PAID` invoices are considered — a doctor is paid on
 * collected revenue, never on billed-but-outstanding charges; a
 * `PARTIALLY_PAID` invoice is excluded in full rather than prorated, to
 * avoid a clawback the next time it's re-run before full settlement.
 */
export class PayrollService {
  /**
   * (Re)computes a doctor's statement for one calendar month. Wrapped in
   * `withTransaction` for snapshot-consistent reads across Invoice/
   * OPDVisit/OTSchedule/RevenueShareRule — the aggregation itself spans
   * four collections even though it produces exactly one write.
   */
  async generateMonthlyPayoutStatement(
    input: GeneratePayoutInput,
    actor: string,
  ): Promise<PayoutStatementDocument> {
    if (input.periodMonth < 1 || input.periodMonth > 12) {
      throw new ValidationError("periodMonth must be between 1 and 12");
    }
    const doctorId = toObjectId(input.doctorId, "doctorId");
    const periodStart = new Date(Date.UTC(input.periodYear, input.periodMonth - 1, 1));
    const periodEnd = new Date(Date.UTC(input.periodYear, input.periodMonth, 1));

    return withTransaction(async (session) => {
      const doctor = await Doctor.findById(doctorId).session(session);
      if (!doctor) throw new NotFoundError(`Doctor ${input.doctorId} not found`);

      const existing = await PayoutStatement.findOne({
        doctorId,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      }).session(session);
      if (existing && existing.status !== PayoutStatus.DRAFT) {
        throw new ConflictError(
          `A ${existing.status} statement already exists for ${doctor.fullName} for ${input.periodMonth}/${input.periodYear} — finalized statements cannot be regenerated`,
        );
      }

      const invoices = await Invoice.find({
        status: InvoiceStatus.PAID,
        "lineItems.sourceType": { $in: ["OPD_VISIT", "OT_SCHEDULE"] },
        "lineItems.postedAt": { $gte: periodStart, $lt: periodEnd },
      })
        .session(session)
        .lean();

      const qualifyingLines: Array<{ invoiceId: Types.ObjectId; li: InvoiceLineItem }> = [];
      for (const invoice of invoices) {
        for (const li of invoice.lineItems) {
          if (
            (li.sourceType === "OPD_VISIT" || li.sourceType === "OT_SCHEDULE") &&
            li.sourceId &&
            li.postedAt >= periodStart &&
            li.postedAt < periodEnd
          ) {
            qualifyingLines.push({ invoiceId: invoice._id, li });
          }
        }
      }

      const opdVisitIds = qualifyingLines
        .filter((q) => q.li.sourceType === "OPD_VISIT")
        .map((q) => q.li.sourceId as Types.ObjectId);
      const otScheduleIds = qualifyingLines
        .filter((q) => q.li.sourceType === "OT_SCHEDULE")
        .map((q) => q.li.sourceId as Types.ObjectId);

      const [opdVisits, otSchedules] = await Promise.all([
        opdVisitIds.length ? OPDVisit.find({ _id: { $in: opdVisitIds } }).session(session).lean() : Promise.resolve([]),
        otScheduleIds.length ? OTSchedule.find({ _id: { $in: otScheduleIds } }).session(session).lean() : Promise.resolve([]),
      ]);
      const opdVisitById = new Map(opdVisits.map((v) => [v._id.toString(), v]));
      const otScheduleById = new Map(otSchedules.map((s) => [s._id.toString(), s]));

      const lines: PayoutStatementLine[] = [];

      for (const { invoiceId, li } of qualifyingLines) {
        // Safe narrowing: qualifyingLines was built above from exactly this
        // two-value filter, but that filter doesn't propagate through the
        // array's stored (wider) InvoiceLineItem["sourceType"] type.
        const sourceType = li.sourceType as "OPD_VISIT" | "OT_SCHEDULE";
        let revenueCategory: RevenueCategory | null = null;
        let sourceDate: Date | null = null;

        if (sourceType === "OPD_VISIT") {
          const visit = opdVisitById.get((li.sourceId as Types.ObjectId).toString());
          if (visit && visit.doctorId.toString() === doctorId.toString()) {
            revenueCategory = RevenueCategory.OPD_CONSULTATION;
            sourceDate = visit.visitDate;
          }
        } else {
          const surgery = otScheduleById.get((li.sourceId as Types.ObjectId).toString());
          const member = surgery?.team.find((m) => m.userId === doctor.userId.toString());
          if (surgery && member) {
            if (member.role === "SURGEON") revenueCategory = RevenueCategory.OT_SURGEON;
            else if (member.role === "ASSISTANT_SURGEON") revenueCategory = RevenueCategory.OT_ASSISTANT_SURGEON;
            else if (member.role === "ANESTHETIST") revenueCategory = RevenueCategory.OT_ANESTHETIST;
            // Other team roles (scrub/circulating nurse, technician) aren't revenue-share eligible.
            sourceDate = surgery.scheduledStart;
          }
        }

        if (!revenueCategory || !sourceDate) continue; // this line isn't attributable to the selected doctor

        const rule = await RevenueShareRule.findOne({
          employmentType: doctor.employmentType,
          revenueCategory,
          isActive: true,
          effectiveFrom: { $lte: periodEnd },
        })
          .sort({ effectiveFrom: -1 })
          .session(session)
          .lean();
        const sharePercent = rule?.sharePercent ?? 0;
        const doctorShare = round2((li.lineTotal * sharePercent) / 100);

        lines.push({
          invoiceId,
          invoiceLineItemId: li._id as Types.ObjectId,
          sourceType,
          sourceId: li.sourceId as Types.ObjectId,
          description: li.description,
          serviceDate: sourceDate,
          revenueCategory,
          grossAmount: li.lineTotal,
          sharePercent,
          doctorShare,
        });
      }

      const totalGrossAmount = round2(lines.reduce((s, l) => s + l.grossAmount, 0));
      const totalPayoutAmount = round2(lines.reduce((s, l) => s + l.doctorShare, 0));

      if (existing) {
        existing.lines = lines;
        existing.totalGrossAmount = totalGrossAmount;
        existing.totalPayoutAmount = totalPayoutAmount;
        existing.employmentTypeAtGeneration = doctor.employmentType;
        existing.generatedAt = new Date();
        existing.generatedByUserId = actor;
        await existing.save({ session });
        return existing;
      }

      const statementNumber = await generatePayoutStatementNumber();
      const created = await PayoutStatement.create(
        [
          {
            statementNumber,
            doctorId,
            employmentTypeAtGeneration: doctor.employmentType,
            periodYear: input.periodYear,
            periodMonth: input.periodMonth,
            lines,
            totalGrossAmount,
            totalPayoutAmount,
            status: PayoutStatus.DRAFT,
            generatedAt: new Date(),
            generatedByUserId: actor,
          },
        ],
        { session },
      );
      const [statement] = created;
      if (!statement) throw new Error("PayoutStatement.create returned no document");
      return statement;
    });
  }

  async finalizePayout(statementId: string, actor: string): Promise<PayoutStatementDocument> {
    const statement = await PayoutStatement.findById(toObjectId(statementId, "statementId"));
    if (!statement) throw new NotFoundError(`Payout statement ${statementId} not found`);
    if (statement.status !== PayoutStatus.DRAFT) {
      throw new ConflictError(`Statement ${statement.statementNumber} is already ${statement.status}`);
    }
    statement.status = PayoutStatus.FINALIZED;
    statement.finalizedAt = new Date();
    statement.finalizedByUserId = actor;
    await statement.save();
    return statement;
  }

  async listPayoutStatements(doctorId?: string): Promise<PayoutStatementDocument[]> {
    const query: Record<string, unknown> = {};
    if (doctorId) query.doctorId = toObjectId(doctorId, "doctorId");
    return PayoutStatement.find(query).sort({ periodYear: -1, periodMonth: -1 }).populate("doctorId", "fullName employmentType");
  }

  async listActiveDoctors(): Promise<DoctorDocument[]> {
    return Doctor.find({ isActive: true }).sort({ fullName: 1 });
  }
}

export const payrollService = new PayrollService();
