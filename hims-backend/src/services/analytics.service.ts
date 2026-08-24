import { Types } from "mongoose";
import { OPDQueue } from "../models/opd/OPDQueue.model.js";
import { Admission } from "../models/ipd/Admission.model.js";
import { Ward } from "../models/ipd/Ward.model.js";
import { OTSchedule } from "../models/ot/OTSchedule.model.js";
import { Invoice } from "../models/billing/Invoice.model.js";
import { Department } from "../models/admin/Department.model.js";
import { Expense } from "../models/finance/Expense.model.js";
import { StockTransaction } from "../models/pharmacy/StockTransaction.model.js";
import { WardCategory, InvoiceStatus, SurgeryStatus, StockTransactionType } from "../types/common.types.js";
import { round2 } from "../utils/money.js";
import { ValidationError } from "../utils/errors.js";

/**
 * The Hospital Control Tower's data layer: NABH clinical-quality
 * indicators and "Make Money Save Money" financial analytics, each a
 * read-only MongoDB aggregation over data every other module already
 * writes — this service creates nothing, it only asks questions of what's
 * already there.
 */

export interface DateRangeInput {
  startDate: string;
  endDate: string;
}

function resolveDateRange(input: DateRangeInput): { start: Date; end: Date } {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError("startDate/endDate must be valid dates");
  }
  if (start >= end) {
    throw new ValidationError("startDate must be before endDate");
  }
  return { start, end };
}

const ICU_WARD_CATEGORIES = [WardCategory.ICU, WardCategory.PICU, WardCategory.NICU, WardCategory.CCU, WardCategory.HDU];

/* ============================================================================
 * NABH Quality Indicators
 * ==========================================================================*/

export interface OpdWaitingTimeStats {
  sampleSize: number;
  avgWaitMinutes: number;
  minWaitMinutes: number;
  maxWaitMinutes: number;
  dailyTrend: { date: string; avgWaitMinutes: number; sampleSize: number }[];
}

/** Average time between OPD check-in and consultation start — the classic OPD-throughput NABH indicator. */
export async function getOpdWaitingTimeStats(range: DateRangeInput): Promise<OpdWaitingTimeStats> {
  const { start, end } = resolveDateRange(range);

  const [overall, daily] = await Promise.all([
    OPDQueue.aggregate<{ avgWaitMinutes: number; minWaitMinutes: number; maxWaitMinutes: number; sampleSize: number }>([
      { $match: { checkedInAt: { $gte: start, $lte: end }, consultationStartedAt: { $exists: true, $ne: null } } },
      { $project: { waitMinutes: { $divide: [{ $subtract: ["$consultationStartedAt", "$checkedInAt"] }, 60000] } } },
      {
        $group: {
          _id: null,
          avgWaitMinutes: { $avg: "$waitMinutes" },
          minWaitMinutes: { $min: "$waitMinutes" },
          maxWaitMinutes: { $max: "$waitMinutes" },
          sampleSize: { $sum: 1 },
        },
      },
    ]),
    OPDQueue.aggregate<{ date: string; avgWaitMinutes: number; sampleSize: number }>([
      { $match: { checkedInAt: { $gte: start, $lte: end }, consultationStartedAt: { $exists: true, $ne: null } } },
      {
        $project: {
          waitMinutes: { $divide: [{ $subtract: ["$consultationStartedAt", "$checkedInAt"] }, 60000] },
          date: { $dateToString: { format: "%Y-%m-%d", date: "$checkedInAt" } },
        },
      },
      { $group: { _id: "$date", avgWaitMinutes: { $avg: "$waitMinutes" }, sampleSize: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", avgWaitMinutes: 1, sampleSize: 1 } },
    ]),
  ]);

  const row = overall[0];
  return {
    sampleSize: row?.sampleSize ?? 0,
    avgWaitMinutes: row ? Math.round(row.avgWaitMinutes * 10) / 10 : 0,
    minWaitMinutes: row ? Math.round(row.minWaitMinutes * 10) / 10 : 0,
    maxWaitMinutes: row ? Math.round(row.maxWaitMinutes * 10) / 10 : 0,
    dailyTrend: daily.map((d) => ({ ...d, avgWaitMinutes: Math.round(d.avgWaitMinutes * 10) / 10 })),
  };
}

export interface IcuBounceBackStats {
  totalIcuAdmissions: number;
  bounceBacks: number;
  bounceBackRatePercent: number;
}

/**
 * The ICU bounce-back rate: among admissions with at least one ICU/PICU/
 * NICU/CCU/HDU stay, what fraction were moved OUT of that acuity level and
 * then transferred back INTO it within the same admission — a classic
 * NABH "return to ICU" quality indicator, and premature-step-down signal.
 * Walks each admission's own `bedMovementHistory` (already-recorded ADT
 * audit trail) with a `$reduce` state machine rather than trying to
 * express "has this specific A→B→A sequence occurred" as a flat $match,
 * since ordering along the array is exactly what the indicator hinges on.
 */
export async function getIcuBounceBackRate(range: DateRangeInput): Promise<IcuBounceBackStats> {
  const { start, end } = resolveDateRange(range);
  const icuWardIds = await Ward.find({ category: { $in: ICU_WARD_CATEGORIES } }).distinct("_id");

  const result = await Admission.aggregate<{ totalIcuAdmissions: number; bounceBacks: number }>([
    { $match: { admissionDate: { $gte: start, $lte: end } } },
    {
      $addFields: {
        _bounceState: {
          $reduce: {
            input: "$bedMovementHistory",
            initialValue: { currentlyIcu: false, hasLeftIcuOnce: false, bounced: false, everIcu: false },
            in: {
              $let: {
                vars: { isIcu: { $in: ["$$this.wardId", icuWardIds] } },
                in: {
                  currentlyIcu: "$$isIcu",
                  everIcu: { $or: ["$$value.everIcu", "$$isIcu"] },
                  hasLeftIcuOnce: {
                    $or: ["$$value.hasLeftIcuOnce", { $and: ["$$value.currentlyIcu", { $not: "$$isIcu" }] }],
                  },
                  bounced: { $or: ["$$value.bounced", { $and: ["$$value.hasLeftIcuOnce", "$$isIcu"] }] },
                },
              },
            },
          },
        },
      },
    },
    { $match: { "_bounceState.everIcu": true } },
    {
      $group: {
        _id: null,
        totalIcuAdmissions: { $sum: 1 },
        bounceBacks: { $sum: { $cond: ["$_bounceState.bounced", 1, 0] } },
      },
    },
  ]);

  const row = result[0] ?? { totalIcuAdmissions: 0, bounceBacks: 0 };
  return {
    totalIcuAdmissions: row.totalIcuAdmissions,
    bounceBacks: row.bounceBacks,
    bounceBackRatePercent: row.totalIcuAdmissions > 0 ? round2((row.bounceBacks / row.totalIcuAdmissions) * 100) : 0,
  };
}

export interface SurgicalSiteInfectionStats {
  totalCompletedSurgeries: number;
  infectionCount: number;
  infectionRatePercent: number;
  byProcedure: { procedureName: string; surgeryCount: number; infectionCount: number }[];
}

/** Surgical site infection rate among completed surgeries — relies on `OTSchedule.hasSurgicalSiteInfection`, a structured post-op surveillance flag added in Step 16 (see that field's own doc comment). */
export async function getSurgicalSiteInfectionRate(range: DateRangeInput): Promise<SurgicalSiteInfectionStats> {
  const { start, end } = resolveDateRange(range);

  const [overall, byProcedure] = await Promise.all([
    OTSchedule.aggregate<{ totalCompletedSurgeries: number; infectionCount: number }>([
      { $match: { status: SurgeryStatus.COMPLETED, actualEnd: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalCompletedSurgeries: { $sum: 1 },
          infectionCount: { $sum: { $cond: ["$hasSurgicalSiteInfection", 1, 0] } },
        },
      },
    ]),
    OTSchedule.aggregate<{ procedureName: string; surgeryCount: number; infectionCount: number }>([
      { $match: { status: SurgeryStatus.COMPLETED, actualEnd: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$procedureName",
          surgeryCount: { $sum: 1 },
          infectionCount: { $sum: { $cond: ["$hasSurgicalSiteInfection", 1, 0] } },
        },
      },
      { $sort: { infectionCount: -1, surgeryCount: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, procedureName: "$_id", surgeryCount: 1, infectionCount: 1 } },
    ]),
  ]);

  const row = overall[0] ?? { totalCompletedSurgeries: 0, infectionCount: 0 };
  return {
    totalCompletedSurgeries: row.totalCompletedSurgeries,
    infectionCount: row.infectionCount,
    infectionRatePercent: row.totalCompletedSurgeries > 0 ? round2((row.infectionCount / row.totalCompletedSurgeries) * 100) : 0,
    byProcedure,
  };
}

/* ============================================================================
 * "Make Money Save Money" — Financial Analytics
 * ==========================================================================*/

export interface DepartmentProfitability {
  departmentId: string;
  departmentName: string;
  revenue: number;
  expenses: number;
  profit: number;
}

/**
 * Revenue per department is resolved from `Invoice` by joining through
 * whichever encounter generated it — `OPDVisit.departmentId` directly for
 * an OPD-sourced invoice, or `Admission.attendingDoctorId` →
 * `Doctor.departmentId` for an IPD-sourced one — since `Invoice` itself
 * never stores a department. Expenses come straight off `Expense.departmentId`
 * (Step 15). Profit is simply the two merged in application code — the
 * merge itself needs no aggregation, only the two source queries do.
 */
export async function getDepartmentProfitability(range: DateRangeInput): Promise<DepartmentProfitability[]> {
  const { start, end } = resolveDateRange(range);

  const [revenueRows, expenseRows, departments] = await Promise.all([
    Invoice.aggregate<{ _id: Types.ObjectId; revenue: number }>([
      { $match: { status: { $ne: InvoiceStatus.CANCELLED }, createdAt: { $gte: start, $lte: end } } },
      {
        $lookup: {
          from: "opd_visits",
          localField: "opdVisitId",
          foreignField: "_id",
          as: "opdVisit",
        },
      },
      { $unwind: { path: "$opdVisit", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "admissions",
          localField: "admissionId",
          foreignField: "_id",
          as: "admission",
        },
      },
      { $unwind: { path: "$admission", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "doctors",
          localField: "admission.attendingDoctorId",
          foreignField: "_id",
          as: "attendingDoctor",
        },
      },
      { $unwind: { path: "$attendingDoctor", preserveNullAndEmptyArrays: true } },
      { $addFields: { departmentId: { $ifNull: ["$opdVisit.departmentId", "$attendingDoctor.departmentId"] } } },
      { $match: { departmentId: { $ne: null } } },
      { $group: { _id: "$departmentId", revenue: { $sum: "$grandTotal" } } },
    ]),
    Expense.aggregate<{ _id: Types.ObjectId; expenses: number }>([
      { $match: { departmentId: { $ne: null }, expenseDate: { $gte: start, $lte: end } } },
      { $group: { _id: "$departmentId", expenses: { $sum: "$amount" } } },
    ]),
    Department.find().select("name").lean(),
  ]);

  const nameById = new Map(departments.map((d) => [d._id.toString(), d.name]));
  const revenueById = new Map(revenueRows.map((r) => [r._id.toString(), r.revenue]));
  const expensesById = new Map(expenseRows.map((r) => [r._id.toString(), r.expenses]));
  const allDepartmentIds = new Set([...revenueById.keys(), ...expensesById.keys()]);

  return Array.from(allDepartmentIds)
    .map((departmentId) => {
      const revenue = round2(revenueById.get(departmentId) ?? 0);
      const expenses = round2(expensesById.get(departmentId) ?? 0);
      return {
        departmentId,
        departmentName: nameById.get(departmentId) ?? "Unknown Department",
        revenue,
        expenses,
        profit: round2(revenue - expenses),
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

export interface TopRevenueDoctor {
  doctorId: string;
  doctorName: string;
  revenue: number;
  invoiceCount: number;
}

/** Same OPD/IPD doctor-resolution join as `getDepartmentProfitability`, grouped by doctor instead of department. */
export async function getTopRevenueGeneratingDoctors(range: DateRangeInput, limit = 10): Promise<TopRevenueDoctor[]> {
  const { start, end } = resolveDateRange(range);

  const rows = await Invoice.aggregate<{ doctorId: string; doctorName: string; revenue: number; invoiceCount: number }>([
    { $match: { status: { $ne: InvoiceStatus.CANCELLED }, createdAt: { $gte: start, $lte: end } } },
    { $lookup: { from: "opd_visits", localField: "opdVisitId", foreignField: "_id", as: "opdVisit" } },
    { $unwind: { path: "$opdVisit", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "admissions", localField: "admissionId", foreignField: "_id", as: "admission" } },
    { $unwind: { path: "$admission", preserveNullAndEmptyArrays: true } },
    { $addFields: { doctorId: { $ifNull: ["$opdVisit.doctorId", "$admission.attendingDoctorId"] } } },
    { $match: { doctorId: { $ne: null } } },
    { $group: { _id: "$doctorId", revenue: { $sum: "$grandTotal" }, invoiceCount: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: "doctors", localField: "_id", foreignField: "_id", as: "doctor" } },
    { $unwind: "$doctor" },
    { $project: { _id: 0, doctorId: { $toString: "$_id" }, doctorName: "$doctor.fullName", revenue: 1, invoiceCount: 1 } },
  ]);

  return rows.map((row) => ({ ...row, revenue: round2(row.revenue) }));
}

export interface PharmacyWastageItem {
  drugId: string;
  drugName: string;
  drugCode: string;
  unitsWasted: number;
  wastageValue: number;
}

/**
 * High-wastage pharmacy items: units written off as `EXPIRY_WRITE_OFF` or
 * `DAMAGE_WRITE_OFF` (see `StockTransaction.type`), valued at each write-off
 * batch's own cost price. No service in this build creates those
 * transaction rows yet (expiry sweeps and damage write-offs are their own
 * feature, out of Step 16's scope) — the pipeline is real and complete,
 * it will simply read empty until that feature exists, the same
 * "aggregation ready, data not there yet" situation Step 15's low-stock
 * dashboard was in before any GRN had been posted.
 */
export async function getPharmacyWastage(range: DateRangeInput, limit = 10): Promise<PharmacyWastageItem[]> {
  const { start, end } = resolveDateRange(range);

  const rows = await StockTransaction.aggregate<PharmacyWastageItem>([
    {
      $match: {
        type: { $in: [StockTransactionType.EXPIRY_WRITE_OFF, StockTransactionType.DAMAGE_WRITE_OFF] },
        performedAt: { $gte: start, $lte: end },
      },
    },
    { $lookup: { from: "drug_batches", localField: "batchId", foreignField: "_id", as: "batch" } },
    { $unwind: "$batch" },
    {
      $addFields: {
        unitsWasted: { $abs: "$quantityDelta" },
        wastageValue: { $multiply: [{ $abs: "$quantityDelta" }, "$batch.costPricePerUnit"] },
      },
    },
    { $group: { _id: "$drugId", unitsWasted: { $sum: "$unitsWasted" }, wastageValue: { $sum: "$wastageValue" } } },
    { $sort: { wastageValue: -1 } },
    { $limit: limit },
    { $lookup: { from: "drugs", localField: "_id", foreignField: "_id", as: "drug" } },
    { $unwind: "$drug" },
    {
      $project: {
        _id: 0,
        drugId: { $toString: "$_id" },
        drugName: "$drug.genericName",
        drugCode: "$drug.drugCode",
        unitsWasted: 1,
        wastageValue: 1,
      },
    },
  ]);

  return rows.map((row) => ({ ...row, wastageValue: round2(row.wastageValue) }));
}
