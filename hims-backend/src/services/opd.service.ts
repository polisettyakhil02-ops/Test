import { withTransaction } from "../config/database.js";
import { Patient } from "../models/mpi/Patient.model.js";
import { Doctor } from "../models/opd/Doctor.model.js";
import { OPDQueue, TokenStatus, type OPDQueueDocument } from "../models/opd/OPDQueue.model.js";
import { OPDVisit, type OPDVisitDocument } from "../models/opd/OPDVisit.model.js";
import { redis, REDIS_KEYS } from "../config/redis.js";
import { generateVisitNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { NotFoundError } from "../utils/errors.js";

export interface BookAppointmentInput {
  patientId: string;
  doctorId: string;
  /** ISO date/datetime; defaults to today. Only the calendar date is used — the queue is per doctor per day, not per time slot. */
  visitDate?: string;
  isFollowUp?: boolean;
  chiefComplaint: string;
  priority?: "NORMAL" | "SENIOR_CITIZEN" | "EMERGENCY" | "VIP";
  performedByUserId: string;
}

export interface BookAppointmentResult {
  queueToken: OPDQueueDocument;
  visit: OPDVisitDocument;
}

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * OPD front-desk booking: issues the next queue token for the doctor's
 * day (via the Redis per-doctor-per-day counter also used by the
 * token-display board) and creates the linked OPDVisit in one
 * transaction, so a visit can never exist without a token or vice versa.
 * Does not validate against `DoctorSchedule` slot capacity — that's a
 * front-desk UX concern (which slots to offer) layered on top of this,
 * not a hard constraint on booking itself.
 */
export class OPDService {
  async bookAppointment(input: BookAppointmentInput): Promise<BookAppointmentResult> {
    const patientId = toObjectId(input.patientId, "patientId");
    const doctorId = toObjectId(input.doctorId, "doctorId");
    const visitDateOnly = toDateOnly(input.visitDate ? new Date(input.visitDate) : new Date());

    return withTransaction(async (session) => {
      const [patient, doctor] = await Promise.all([
        Patient.findById(patientId).session(session).lean(),
        Doctor.findById(doctorId).session(session),
      ]);
      if (!patient) {
        throw new NotFoundError(`Patient ${input.patientId} not found`);
      }
      if (!doctor || !doctor.isActive) {
        throw new NotFoundError(`Doctor ${input.doctorId} not found or inactive`);
      }

      // The token counter lives in Redis (not the transaction) since it's
      // a display-board sequence, not a financial/inventory quantity; the
      // compound unique index on OPDQueue is the durable collision
      // backstop if two counters somehow raced.
      const dateKey = visitDateOnly.toISOString().slice(0, 10);
      const tokenNumber = await redis.incr(REDIS_KEYS.opdQueueToken(input.doctorId, dateKey));

      const queueToken = firstOrThrow(
        await OPDQueue.create(
          [
            {
              doctorId,
              patientId,
              visitDate: visitDateOnly,
              tokenNumber,
              status: TokenStatus.WAITING,
              isFollowUp: input.isFollowUp ?? false,
              checkedInAt: new Date(),
              priority: input.priority ?? "NORMAL",
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "OPDQueue.create returned no document",
      );

      const visitNumber = await generateVisitNumber();
      const consultationFeeCharged =
        input.isFollowUp && doctor.followUpFee != null ? doctor.followUpFee : doctor.consultationFee;

      const visit = firstOrThrow(
        await OPDVisit.create(
          [
            {
              visitNumber,
              patientId,
              doctorId,
              queueTokenId: queueToken._id,
              departmentId: doctor.departmentId,
              visitDate: visitDateOnly,
              chiefComplaint: input.chiefComplaint,
              isFollowUp: input.isFollowUp ?? false,
              consultationFeeCharged,
              isFeeWaived: false,
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "OPDVisit.create returned no document",
      );

      return { queueToken, visit };
    });
  }
}

export const opdService = new OPDService();
