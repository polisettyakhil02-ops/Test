import { withTransaction } from "../config/database.js";
import { Patient } from "../models/mpi/Patient.model.js";
import { Admission } from "../models/ipd/Admission.model.js";
import { OTSchedule, type OTScheduleDocument, type OTTeamMember } from "../models/ot/OTSchedule.model.js";
import { SterilizationLog, type SterilizationLogDocument } from "../models/ot/SterilizationLog.model.js";
import { SurgeryStatus } from "../types/common.types.js";
import { generateSurgeryNumber, generateSterilizationCycleNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ResourceUnavailableError } from "../utils/errors.js";

export interface ScheduleSurgeryInput {
  patientId: string;
  admissionId?: string;
  theatreType: "OT" | "CATH_LAB";
  theatreRoom: string;
  procedureName: string;
  icd10ProcedureCodes?: string[];
  team: OTTeamMember[];
  scheduledStart: string;
  scheduledEnd: string;
  anesthesiaType?: "GENERAL" | "REGIONAL" | "LOCAL" | "SEDATION" | "NONE";
  consentObtained?: boolean;
  performedByUserId: string;
}

export interface LogSterilizationInstrumentSetInput {
  setName: string;
  setBarcodeValue: string;
}

export interface LogSterilizationInput {
  autoclaveId: string;
  cycleType: "STEAM" | "ETO" | "PLASMA" | "DRY_HEAT";
  instrumentSets: LogSterilizationInstrumentSetInput[];
  temperatureCelsius: number;
  pressureKPa?: number;
  durationMinutes: number;
  biologicalIndicatorResult: "PASS" | "FAIL" | "PENDING";
  chemicalIndicatorResult: "PASS" | "FAIL";
  startedAt: string;
  completedAt?: string;
  notes?: string;
  performedByUserId: string;
}

/** A cancelled or postponed booking has given up its slot — it must not block a new booking from claiming the same theatre/time window. Every other status (including COMPLETED) still occupies its originally scheduled window for conflict-checking purposes, since a future booking is always checked against other bookings' *planned* windows, not real-time actuals. */
const NON_BLOCKING_SURGERY_STATUSES: SurgeryStatus[] = [SurgeryStatus.CANCELLED, SurgeryStatus.POSTPONED];

/** OT & Cath Lab scheduling and sterile-processing engine. */
export class OTService {
  /**
   * Books a theatre slot. The double-booking guard is a conflict query
   * (same `theatreRoom`, a still-active booking whose window overlaps the
   * requested one) followed by the `OTSchedule.create`, both inside one
   * `withTransaction` call — snapshot isolation is what actually prevents
   * two concurrent requests from both passing the conflict check and
   * both creating overlapping bookings, since (unlike a single-document
   * claim such as `ADTService.admitPatient`'s bed claim) there's no one
   * row to conditionally update for a range-overlap check.
   */
  async scheduleSurgery(input: ScheduleSurgeryInput): Promise<OTScheduleDocument> {
    const scheduledStart = new Date(input.scheduledStart);
    const scheduledEnd = new Date(input.scheduledEnd);
    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
      throw new ValidationError("scheduledStart/scheduledEnd must be valid dates");
    }
    if (scheduledStart >= scheduledEnd) {
      throw new ValidationError("scheduledStart must be before scheduledEnd");
    }
    if (!input.team.some((member) => member.role === "SURGEON")) {
      throw new ValidationError("At least one SURGEON must be assigned");
    }

    const patientId = toObjectId(input.patientId, "patientId");
    const admissionId = input.admissionId ? toObjectId(input.admissionId, "admissionId") : undefined;

    return withTransaction(async (session) => {
      const patient = await Patient.findById(patientId).session(session).lean();
      if (!patient) {
        throw new NotFoundError(`Patient ${input.patientId} not found`);
      }

      if (admissionId) {
        const admission = await Admission.findById(admissionId).session(session).lean();
        if (!admission) {
          throw new NotFoundError(`Admission ${input.admissionId} not found`);
        }
      }

      const conflict = await OTSchedule.findOne({
        theatreRoom: input.theatreRoom,
        status: { $nin: NON_BLOCKING_SURGERY_STATUSES },
        scheduledStart: { $lt: scheduledEnd },
        scheduledEnd: { $gt: scheduledStart },
      })
        .session(session)
        .lean();

      if (conflict) {
        throw new ResourceUnavailableError(
          `Theatre ${input.theatreRoom} is already booked for "${conflict.procedureName}" from ` +
            `${conflict.scheduledStart.toISOString()} to ${conflict.scheduledEnd.toISOString()}`,
        );
      }

      const surgeryNumber = await generateSurgeryNumber();

      const surgery = firstOrThrow(
        await OTSchedule.create(
          [
            {
              surgeryNumber,
              patientId,
              admissionId,
              theatreType: input.theatreType,
              theatreRoom: input.theatreRoom,
              procedureName: input.procedureName,
              icd10ProcedureCodes: input.icd10ProcedureCodes ?? [],
              team: input.team,
              status: SurgeryStatus.SCHEDULED,
              scheduledStart,
              scheduledEnd,
              anesthesiaType: input.anesthesiaType,
              preOpChecklistCompleted: false,
              consentObtained: input.consentObtained ?? false,
              postOpNotes: [],
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "OTSchedule.create returned no document",
      );

      return surgery;
    });
  }

  /**
   * Logs one autoclave cycle. A cycle only certifies PASS — the
   * regulatory basis for every instrument set inside it being eligible
   * for OT use — when *both* indicators pass; the biological indicator
   * (spore test) is the definitive proof of sterilization efficacy, so a
   * `PENDING` or `FAIL` biological result forces every set in the cycle
   * to `FAIL` regardless of what's submitted per set, rather than trusting
   * caller-supplied per-set results to override a failed/unverified
   * cycle. `SterilizationLog.model.ts` has no separate instrument-set
   * master collection — a set's OT-use eligibility *is* this document's
   * `instrumentSets[].cycleResult` — so this is a single-collection
   * write and doesn't need `withTransaction`.
   */
  async logSterilization(input: LogSterilizationInput): Promise<SterilizationLogDocument> {
    if (input.instrumentSets.length === 0) {
      throw new ValidationError("At least one instrument set is required");
    }

    const startedAt = new Date(input.startedAt);
    if (Number.isNaN(startedAt.getTime())) {
      throw new ValidationError("startedAt must be a valid date");
    }
    let completedAt: Date | undefined;
    if (input.completedAt) {
      completedAt = new Date(input.completedAt);
      if (Number.isNaN(completedAt.getTime())) {
        throw new ValidationError("completedAt must be a valid date");
      }
    }

    const cyclePassed = input.biologicalIndicatorResult === "PASS" && input.chemicalIndicatorResult === "PASS";
    const cycleNumber = await generateSterilizationCycleNumber();

    const log = await SterilizationLog.create({
      cycleNumber,
      autoclaveId: input.autoclaveId,
      cycleType: input.cycleType,
      instrumentSets: input.instrumentSets.map((set) => ({
        setName: set.setName,
        setBarcodeValue: set.setBarcodeValue,
        cycleResult: cyclePassed ? "PASS" : "FAIL",
      })),
      temperatureCelsius: input.temperatureCelsius,
      pressureKPa: input.pressureKPa,
      durationMinutes: input.durationMinutes,
      biologicalIndicatorResult: input.biologicalIndicatorResult,
      chemicalIndicatorResult: input.chemicalIndicatorResult,
      startedAt,
      completedAt,
      operatedByUserId: input.performedByUserId,
      notes: input.notes,
    });

    return log;
  }
}

export const otService = new OTService();
