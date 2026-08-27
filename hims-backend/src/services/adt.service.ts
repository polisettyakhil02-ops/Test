import { withTransaction } from "../config/database.js";
import { Bed, type BedDocument } from "../models/ipd/Bed.model.js";
import { Admission, type AdmissionDocument } from "../models/ipd/Admission.model.js";
import { BedStatus, AdmissionStatus, AdmissionType } from "../types/common.types.js";
import { generateAdmissionNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError, ResourceUnavailableError } from "../utils/errors.js";

export interface AdmitPatientInput {
  patientId: string;
  bedId: string;
  admittingDoctorId: string;
  attendingDoctorId: string;
  admissionType: AdmissionType;
  provisionalDiagnosis: string;
  guardianConsentObtained: boolean;
  referredFromOPDVisitId?: string;
  performedByUserId: string;
}

export interface AdmitPatientResult {
  admission: AdmissionDocument;
  bed: BedDocument;
}

/** The frontend's discharge form vocabulary — broader than `AdmissionStatus` since it distinguishes *why* a stay ended, not just its terminal state. Mapped onto the schema's actual status values below. */
export type DischargeType = "ROUTINE" | "LAMA" | "DAMA" | "TRANSFER_OUT" | "DECEASED";

/**
 * `DAMA` (Discharge Against Medical Advice, a formal discharge the
 * patient insists on) and `LAMA` (Left Against Medical Advice, walking
 * out without one) are distinct clinical workflows in most Indian
 * hospital systems, but this schema only models one terminal status for
 * "left early against advice" — both map onto it. `TRANSFER_OUT` (to a
 * different facility) ends this admission the same way a routine
 * discharge does, so it maps onto `DISCHARGED` too; it isn't
 * `AdmissionStatus.TRANSFERRED`, which means an in-hospital bed/ward
 * transfer with the admission still open, not an end-of-stay event.
 */
const DISCHARGE_TYPE_TO_STATUS: Record<DischargeType, AdmissionStatus> = {
  ROUTINE: AdmissionStatus.DISCHARGED,
  TRANSFER_OUT: AdmissionStatus.DISCHARGED,
  LAMA: AdmissionStatus.LAMA,
  DAMA: AdmissionStatus.LAMA,
  DECEASED: AdmissionStatus.DECEASED,
};

/** Admission states that still represent an active bed stay and can legally be discharged. Anything else (already DISCHARGED/LAMA/DECEASED/ABSCONDED) is a terminal state. */
const ACTIVE_ADMISSION_STATUSES: AdmissionStatus[] = [
  AdmissionStatus.ADMITTED,
  AdmissionStatus.TRANSFERRED,
  AdmissionStatus.DISCHARGE_PENDING,
];

export interface DischargePatientInput {
  admissionId: string;
  dischargeType?: DischargeType;
  reason?: string;
  performedByUserId: string;
}

export interface DischargePatientResult {
  admission: AdmissionDocument;
  bed: BedDocument;
}

/**
 * Bed ADT Engine. `admitPatient` is the sole way a patient occupies a bed:
 * it claims the bed and creates the Admission record atomically, so two
 * concurrent admit requests for the same bed can never both succeed (the
 * loser sees a clean `ResourceUnavailableError`, not a silently
 * overwritten occupant) and a failure creating the Admission document
 * (e.g. a validation error) automatically releases the bed claim rather
 * than leaving it stuck OCCUPIED with no admission behind it.
 */
export class ADTService {
  async admitPatient(input: AdmitPatientInput): Promise<AdmitPatientResult> {
    this.validateInput(input);

    const patientId = toObjectId(input.patientId, "patientId");
    const bedId = toObjectId(input.bedId, "bedId");
    const admittingDoctorId = toObjectId(input.admittingDoctorId, "admittingDoctorId");
    const attendingDoctorId = toObjectId(input.attendingDoctorId, "attendingDoctorId");
    const referredFromOPDVisitId = input.referredFromOPDVisitId
      ? toObjectId(input.referredFromOPDVisitId, "referredFromOPDVisitId")
      : undefined;

    return withTransaction(async (session) => {
      // 1. Atomically claim the bed: the { status: VACANT } filter is the
      //    entire double-booking guard — only one concurrent request can
      //    match and flip it, the other gets back null.
      const claimedBed = await Bed.findOneAndUpdate(
        { _id: bedId, status: BedStatus.VACANT },
        { $set: { status: BedStatus.OCCUPIED } },
        { new: true, session },
      );

      if (!claimedBed) {
        const existingBed = await Bed.findById(bedId).session(session).lean();
        if (!existingBed) {
          throw new NotFoundError(`Bed ${input.bedId} does not exist`);
        }
        throw new ResourceUnavailableError(
          `Bed ${existingBed.bedNumber} is not available for admission (current status: ${existingBed.status})`,
        );
      }

      // 2. Create the admission, seeded with the ADT movement history entry.
      const admissionNumber = await generateAdmissionNumber();
      const now = new Date();

      const admission = firstOrThrow(
        await Admission.create(
          [
            {
              admissionNumber,
              patientId,
              admittingDoctorId,
              attendingDoctorId,
              admissionType: input.admissionType,
              status: AdmissionStatus.ADMITTED,
              currentWardId: claimedBed.wardId,
              currentBedId: claimedBed._id,
              admissionDate: now,
              provisionalDiagnosis: input.provisionalDiagnosis,
              bedMovementHistory: [
                {
                  wardId: claimedBed.wardId,
                  bedId: claimedBed._id,
                  movementType: "ADMIT",
                  effectiveAt: now,
                  performedByUserId: input.performedByUserId,
                },
              ],
              referredFromOPDVisitId,
              guardianConsentObtained: input.guardianConsentObtained,
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "Admission.create returned no document",
      );

      // 3. Link the bed back to the admission it now holds.
      claimedBed.currentAdmissionId = admission._id;
      await claimedBed.save({ session });

      return { admission, bed: claimedBed };
    });
  }

  private validateInput(input: AdmitPatientInput): void {
    if (!input.provisionalDiagnosis?.trim()) {
      throw new ValidationError("provisionalDiagnosis is required");
    }
  }

  /**
   * The natural counterpart to `admitPatient`: closes out the Admission
   * and frees the bed atomically, so a failure partway through can never
   * leave the two out of sync (an admission marked DISCHARGED with a bed
   * still stuck OCCUPIED, or vice versa). The bed goes to `CLEANING`, not
   * straight back to `VACANT` — a just-vacated bed needs housekeeping
   * before it's fit to admit into again; a separate ward/infrastructure
   * workflow (see `admin.service.ts`'s bed-status management) is what
   * marks it `VACANT` once that's done.
   */
  async dischargePatient(input: DischargePatientInput): Promise<DischargePatientResult> {
    const admissionId = toObjectId(input.admissionId, "admissionId");

    return withTransaction(async (session) => {
      const admission = await Admission.findById(admissionId).session(session);
      if (!admission) {
        throw new NotFoundError(`Admission ${input.admissionId} not found`);
      }
      if (!ACTIVE_ADMISSION_STATUSES.includes(admission.status)) {
        throw new ConflictError(
          `Admission ${admission.admissionNumber} is already ${admission.status} and cannot be discharged again`,
        );
      }

      const now = new Date();
      const dischargeStatus = input.dischargeType
        ? DISCHARGE_TYPE_TO_STATUS[input.dischargeType]
        : AdmissionStatus.DISCHARGED;

      admission.status = dischargeStatus;
      admission.actualDischargeDate = now;
      admission.bedMovementHistory.push({
        wardId: admission.currentWardId,
        bedId: admission.currentBedId,
        movementType: "DISCHARGE",
        reason: input.reason,
        effectiveAt: now,
        performedByUserId: input.performedByUserId,
      });
      await admission.save({ session });

      // Mirrors admitPatient's conditional claim: only flip the bed if it's
      // still the OCCUPIED bed this admission expects. If it isn't (a data
      // anomaly, or a concurrent operation already changed it), abort the
      // whole transaction rather than silently overwriting an unexpected
      // bed state or leaving the admission and bed out of sync.
      const freedBed = await Bed.findOneAndUpdate(
        { _id: admission.currentBedId, status: BedStatus.OCCUPIED },
        { $set: { status: BedStatus.CLEANING }, $unset: { currentAdmissionId: "" } },
        { new: true, session },
      );

      if (!freedBed) {
        const existingBed = await Bed.findById(admission.currentBedId).session(session).lean();
        if (!existingBed) {
          throw new NotFoundError(`Bed ${admission.currentBedId.toString()} not found`);
        }
        throw new ResourceUnavailableError(
          `Bed ${existingBed.bedNumber} was not OCCUPIED (current status: ${existingBed.status}); refusing to discharge against a bed/admission state mismatch`,
        );
      }

      return { admission, bed: freedBed };
    });
  }
}

export const adtService = new ADTService();
