import { withTransaction } from "../config/database.js";
import { Bed, type BedDocument } from "../models/ipd/Bed.model.js";
import { Admission, type AdmissionDocument } from "../models/ipd/Admission.model.js";
import { BedStatus, AdmissionStatus, AdmissionType } from "../types/common.types.js";
import { generateAdmissionNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ResourceUnavailableError } from "../utils/errors.js";

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
}

export const adtService = new ADTService();
