import { withTransaction } from "../config/database.js";
import { DialysisSession, type DialysisSessionDocument } from "../models/dialysis/DialysisSession.model.js";
import { Asset, type AssetDocument } from "../models/assets/Asset.model.js";
import { Patient } from "../models/mpi/Patient.model.js";
import {
  AssetCategory,
  AssetStatus,
  DialysisShift,
  DialysisSessionStatus,
  VascularAccessType,
} from "../types/common.types.js";
import { generateDialysisSessionNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError, ResourceUnavailableError } from "../utils/errors.js";

export interface ScheduleDialysisSessionInput {
  patientId: string;
  admissionId?: string;
  machineAssetId: string;
  nephrologistId: string;
  technicianUserId: string;
  shift: DialysisShift;
  scheduledStart: string;
  scheduledEnd: string;
  vascularAccessType: VascularAccessType;
  preDialysisWeightKg: number;
  heparinDoseUnits: number;
  targetUltrafiltrationVolumeMl: number;
  bloodFlowRateMlPerMin?: number;
  dialysateFlowRateMlPerMin?: number;
  preDialysisSystolicBP?: number;
  preDialysisDiastolicBP?: number;
  notes?: string;
  performedByUserId: string;
}

export interface CompleteDialysisSessionInput {
  sessionId: string;
  postDialysisWeightKg: number;
  actualUltrafiltrationVolumeMl: number;
  postDialysisSystolicBP?: number;
  postDialysisDiastolicBP?: number;
  complications?: string;
  notes?: string;
  performedByUserId: string;
}

/** Session states that still occupy the machine's calendar — a CANCELLED/ABORTED/COMPLETED session has given up its slot. */
const NON_BLOCKING_SESSION_STATUSES: DialysisSessionStatus[] = [
  DialysisSessionStatus.CANCELLED,
  DialysisSessionStatus.ABORTED,
];

/**
 * Dialysis Scheduler + Nephrology chart engine. `scheduleDialysisSession`
 * uses the identical double-booking guard `OTService.scheduleSurgery`
 * uses for theatre rooms — a machine is exactly as much a single-owner
 * resource across a time window as an OT room is.
 */
export class DialysisService {
  async listMachines(): Promise<AssetDocument[]> {
    return Asset.find({ category: AssetCategory.DIALYSIS_MACHINE, isActive: true }).sort({ name: 1 });
  }

  async scheduleDialysisSession(input: ScheduleDialysisSessionInput): Promise<DialysisSessionDocument> {
    const scheduledStart = new Date(input.scheduledStart);
    const scheduledEnd = new Date(input.scheduledEnd);
    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
      throw new ValidationError("scheduledStart/scheduledEnd must be valid dates");
    }
    if (scheduledStart >= scheduledEnd) {
      throw new ValidationError("scheduledStart must be before scheduledEnd");
    }
    if (input.preDialysisWeightKg <= 0) {
      throw new ValidationError("preDialysisWeightKg must be positive");
    }

    const patientId = toObjectId(input.patientId, "patientId");
    const machineAssetId = toObjectId(input.machineAssetId, "machineAssetId");
    const nephrologistId = toObjectId(input.nephrologistId, "nephrologistId");
    const admissionId = input.admissionId ? toObjectId(input.admissionId, "admissionId") : undefined;

    return withTransaction(async (session) => {
      const patient = await Patient.findById(patientId).session(session).lean();
      if (!patient) throw new NotFoundError(`Patient ${input.patientId} not found`);

      const machine = await Asset.findById(machineAssetId).session(session).lean();
      if (!machine) throw new NotFoundError(`Asset ${input.machineAssetId} not found`);
      if (machine.category !== AssetCategory.DIALYSIS_MACHINE) {
        throw new ValidationError(`Asset ${machine.assetCode} is a ${machine.category}, not a DIALYSIS_MACHINE`);
      }
      if (machine.status !== AssetStatus.ACTIVE) {
        throw new ResourceUnavailableError(`Dialysis machine ${machine.name} is ${machine.status} and cannot be booked`);
      }

      const conflict = await DialysisSession.findOne({
        machineAssetId,
        status: { $nin: NON_BLOCKING_SESSION_STATUSES },
        scheduledStart: { $lt: scheduledEnd },
        scheduledEnd: { $gt: scheduledStart },
      })
        .session(session)
        .lean();
      if (conflict) {
        throw new ResourceUnavailableError(
          `${machine.name} is already booked from ${conflict.scheduledStart.toISOString()} to ${conflict.scheduledEnd.toISOString()}`,
        );
      }

      const sessionNumber = await generateDialysisSessionNumber();
      const durationMinutes = Math.round((scheduledEnd.getTime() - scheduledStart.getTime()) / 60000);

      const dialysisSession = firstOrThrow(
        await DialysisSession.create(
          [
            {
              sessionNumber,
              patientId,
              admissionId,
              machineAssetId,
              nephrologistId,
              technicianUserId: input.technicianUserId,
              shift: input.shift,
              scheduledStart,
              scheduledEnd,
              status: DialysisSessionStatus.SCHEDULED,
              vascularAccessType: input.vascularAccessType,
              preDialysisWeightKg: input.preDialysisWeightKg,
              heparinDoseUnits: input.heparinDoseUnits,
              targetUltrafiltrationVolumeMl: input.targetUltrafiltrationVolumeMl,
              bloodFlowRateMlPerMin: input.bloodFlowRateMlPerMin,
              dialysateFlowRateMlPerMin: input.dialysateFlowRateMlPerMin,
              durationMinutes,
              preDialysisSystolicBP: input.preDialysisSystolicBP,
              preDialysisDiastolicBP: input.preDialysisDiastolicBP,
              notes: input.notes,
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "DialysisSession.create returned no document",
      );

      return dialysisSession;
    });
  }

  /** Single-document transition: SCHEDULED -> IN_PROGRESS, when the patient is actually put on the machine. */
  async startSession(sessionId: string, performedByUserId: string): Promise<DialysisSessionDocument> {
    const id = toObjectId(sessionId, "sessionId");
    const dialysisSession = await DialysisSession.findById(id);
    if (!dialysisSession) throw new NotFoundError(`Dialysis session ${sessionId} not found`);
    if (dialysisSession.status !== DialysisSessionStatus.SCHEDULED) {
      throw new ConflictError(`Session ${dialysisSession.sessionNumber} is ${dialysisSession.status}, not SCHEDULED`);
    }
    dialysisSession.status = DialysisSessionStatus.IN_PROGRESS;
    dialysisSession.startedByUserId = performedByUserId;
    await dialysisSession.save();
    return dialysisSession;
  }

  /** The Nephrology EMR's completion form: records the post-dialysis chart (weight, actual UF, post BP, complications) and closes the session out. */
  async completeSession(input: CompleteDialysisSessionInput): Promise<DialysisSessionDocument> {
    const id = toObjectId(input.sessionId, "sessionId");
    const dialysisSession = await DialysisSession.findById(id);
    if (!dialysisSession) throw new NotFoundError(`Dialysis session ${input.sessionId} not found`);
    if (dialysisSession.status !== DialysisSessionStatus.IN_PROGRESS) {
      throw new ConflictError(`Session ${dialysisSession.sessionNumber} is ${dialysisSession.status}, not IN_PROGRESS`);
    }
    if (input.postDialysisWeightKg <= 0) {
      throw new ValidationError("postDialysisWeightKg must be positive");
    }

    dialysisSession.postDialysisWeightKg = input.postDialysisWeightKg;
    dialysisSession.actualUltrafiltrationVolumeMl = input.actualUltrafiltrationVolumeMl;
    dialysisSession.postDialysisSystolicBP = input.postDialysisSystolicBP;
    dialysisSession.postDialysisDiastolicBP = input.postDialysisDiastolicBP;
    dialysisSession.complications = input.complications;
    dialysisSession.notes = input.notes ?? dialysisSession.notes;
    dialysisSession.status = DialysisSessionStatus.COMPLETED;
    await dialysisSession.save();
    return dialysisSession;
  }

  /** SCHEDULED -> CANCELLED (never happened) or IN_PROGRESS -> ABORTED (started, ended early) — the terminal status is derived from what state the session was in, not passed by the caller, so a cancellation can never masquerade as a clean completion. */
  async cancelOrAbortSession(sessionId: string, reason: string, performedByUserId: string): Promise<DialysisSessionDocument> {
    if (!reason?.trim()) throw new ValidationError("reason is required");
    const id = toObjectId(sessionId, "sessionId");
    const dialysisSession = await DialysisSession.findById(id);
    if (!dialysisSession) throw new NotFoundError(`Dialysis session ${sessionId} not found`);

    if (dialysisSession.status === DialysisSessionStatus.SCHEDULED) {
      dialysisSession.status = DialysisSessionStatus.CANCELLED;
    } else if (dialysisSession.status === DialysisSessionStatus.IN_PROGRESS) {
      dialysisSession.status = DialysisSessionStatus.ABORTED;
    } else {
      throw new ConflictError(`Session ${dialysisSession.sessionNumber} is ${dialysisSession.status} and cannot be cancelled or aborted`);
    }
    dialysisSession.cancellationReason = reason.trim();
    dialysisSession.cancelledByUserId = performedByUserId;
    await dialysisSession.save();
    return dialysisSession;
  }

  async listSessions(filters: { machineAssetId?: string; patientId?: string; status?: DialysisSessionStatus } = {}): Promise<
    DialysisSessionDocument[]
  > {
    const query: Record<string, unknown> = {};
    if (filters.machineAssetId) query.machineAssetId = toObjectId(filters.machineAssetId, "machineAssetId");
    if (filters.patientId) query.patientId = toObjectId(filters.patientId, "patientId");
    if (filters.status) query.status = filters.status;

    return DialysisSession.find(query)
      .sort({ scheduledStart: 1 })
      .populate("patientId", "uhid firstName lastName")
      .populate("machineAssetId", "assetCode name location")
      .populate("nephrologistId", "fullName");
  }
}

export const dialysisService = new DialysisService();
