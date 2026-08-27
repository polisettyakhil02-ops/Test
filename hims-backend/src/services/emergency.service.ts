import { withTransaction } from "../config/database.js";
import { ERVisit, type ERVisitDocument } from "../models/emergency/ERVisit.model.js";
import { ERBay, type ERBayDocument } from "../models/emergency/ERBay.model.js";
import { EmergencyEMR, type EmergencyEMRDocument } from "../models/emergency/EmergencyEMR.model.js";
import { Patient } from "../models/mpi/Patient.model.js";
import { Bed } from "../models/ipd/Bed.model.js";
import { Admission, type AdmissionDocument } from "../models/ipd/Admission.model.js";
import { type BedDocument } from "../models/ipd/Bed.model.js";
import {
  BedStatus,
  AdmissionStatus,
  AdmissionType,
  TriagePriority,
  ERVisitStatus,
  ERArrivalMode,
  AirwayStatus,
} from "../types/common.types.js";
import { generateErVisitNumber, generateAdmissionNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError, ResourceUnavailableError } from "../utils/errors.js";

export interface RegisterErVisitInput {
  patientId: string;
  chiefComplaint: string;
  arrivalMode: ERArrivalMode;
  triagePriority: TriagePriority;
  triageNotes?: string;
  isMedicoLegalCase: boolean;
  mlcNumber?: string;
  policeStationName?: string;
  mlcRemarks?: string;
  performedByUserId: string;
}

export interface AssignBayInput {
  erVisitId: string;
  bayId: string;
  performedByUserId: string;
}

export interface AssignBayResult {
  visit: ERVisitDocument;
  bay: ERBayDocument;
}

export interface RecordPrimaryAssessmentInput {
  erVisitId: string;
  airwayStatus: AirwayStatus;
  airwayNotes?: string;
  breathingRatePerMin?: number;
  breathingSpo2Percent?: number;
  breathingNotes?: string;
  circulationPulseRatePerMin?: number;
  circulationSystolicBP?: number;
  circulationDiastolicBP?: number;
  circulationCapillaryRefillSec?: number;
  circulationNotes?: string;
  disabilityGcsScore?: number;
  disabilityPupilResponse?: string;
  disabilityNotes?: string;
  exposureNotes?: string;
  overallImpression?: string;
  performedByUserId: string;
}

export interface ConvertToIpdAdmissionInput {
  erVisitId: string;
  bedId: string;
  attendingDoctorId: string;
  provisionalDiagnosis: string;
  guardianConsentObtained?: boolean;
  performedByUserId: string;
}

export interface ConvertToIpdAdmissionResult {
  admission: AdmissionDocument;
  bed: BedDocument;
  visit: ERVisitDocument;
}

export interface DischargeErVisitInput {
  erVisitId: string;
  status: ERVisitStatus;
  dispositionNotes?: string;
  performedByUserId: string;
}

/** Priority rank used purely to sort the triage board — lower sorts first (most acute at the top). */
const TRIAGE_RANK: Record<TriagePriority, number> = {
  [TriagePriority.RED]: 0,
  [TriagePriority.YELLOW]: 1,
  [TriagePriority.GREEN]: 2,
  [TriagePriority.BLACK]: 3,
};

/** ER visit states that still represent a live, unresolved case — everything else is a closed disposition. */
const ACTIVE_ER_STATUSES: ERVisitStatus[] = [ERVisitStatus.WAITING, ERVisitStatus.IN_TREATMENT];

const TERMINAL_DISPOSITIONS: ERVisitStatus[] = [
  ERVisitStatus.DISCHARGED,
  ERVisitStatus.LAMA,
  ERVisitStatus.DECEASED,
  ERVisitStatus.TRANSFERRED_OUT,
];

/**
 * ER Triage Board + Emergency EMR engine. The one operation here that
 * needs `withTransaction` for real ACID guarantees is
 * `convertToIpdAdmission` — everything else touches at most one
 * document that needs strict consistency (a bay claim, or a
 * single-collection create).
 */
export class EmergencyService {
  async registerErVisit(input: RegisterErVisitInput): Promise<ERVisitDocument> {
    if (!input.chiefComplaint?.trim()) {
      throw new ValidationError("chiefComplaint is required");
    }
    if (input.isMedicoLegalCase && !input.mlcNumber?.trim()) {
      throw new ValidationError("mlcNumber is required once a visit is flagged as a medico-legal case");
    }

    const patientId = toObjectId(input.patientId, "patientId");
    const patient = await Patient.findById(patientId).lean();
    if (!patient) {
      throw new NotFoundError(`Patient ${input.patientId} not found`);
    }

    const erVisitNumber = await generateErVisitNumber();
    const now = new Date();

    return ERVisit.create({
      erVisitNumber,
      patientId,
      chiefComplaint: input.chiefComplaint.trim(),
      arrivalMode: input.arrivalMode,
      arrivedAt: now,
      triagePriority: input.triagePriority,
      triageNotes: input.triageNotes,
      triagedAt: now,
      triagedByUserId: input.performedByUserId,
      isMedicoLegalCase: input.isMedicoLegalCase,
      mlcNumber: input.mlcNumber,
      policeStationName: input.policeStationName,
      mlcRemarks: input.mlcRemarks,
      status: ERVisitStatus.WAITING,
      createdBy: input.performedByUserId,
    });
  }

  /**
   * Claims a free ER bay for a live visit — the same conditional-claim
   * pattern as `ADTService.admitPatient`'s bed claim (`{ status: VACANT }`
   * in the filter is the whole double-booking guard). Also releases
   * whatever bay the visit previously held, so re-assigning a patient
   * (e.g. moving them from a crash cart to a bed) can never leave two
   * bays simultaneously pointing at the same visit.
   */
  async assignBay(input: AssignBayInput): Promise<AssignBayResult> {
    const erVisitId = toObjectId(input.erVisitId, "erVisitId");
    const bayId = toObjectId(input.bayId, "bayId");

    return withTransaction(async (session) => {
      const visit = await ERVisit.findById(erVisitId).session(session);
      if (!visit) {
        throw new NotFoundError(`ER visit ${input.erVisitId} not found`);
      }
      if (!ACTIVE_ER_STATUSES.includes(visit.status)) {
        throw new ConflictError(`ER visit ${visit.erVisitNumber} is ${visit.status} and cannot be assigned a bay`);
      }

      const claimedBay = await ERBay.findOneAndUpdate(
        { _id: bayId, status: BedStatus.VACANT },
        { $set: { status: BedStatus.OCCUPIED, currentErVisitId: visit._id } },
        { new: true, session },
      );
      if (!claimedBay) {
        const existing = await ERBay.findById(bayId).session(session).lean();
        if (!existing) {
          throw new NotFoundError(`ER bay ${input.bayId} not found`);
        }
        throw new ResourceUnavailableError(`Bay ${existing.bayNumber} is not available (current status: ${existing.status})`);
      }

      if (visit.erBayId && !visit.erBayId.equals(claimedBay._id)) {
        await ERBay.updateOne(
          { _id: visit.erBayId, status: BedStatus.OCCUPIED },
          { $set: { status: BedStatus.VACANT }, $unset: { currentErVisitId: "" } },
          { session },
        );
      }

      visit.erBayId = claimedBay._id;
      visit.status = ERVisitStatus.IN_TREATMENT;
      await visit.save({ session });

      return { visit, bay: claimedBay };
    });
  }

  /** Appends one ABCDE reassessment entry to the visit's resuscitation timeline. Single-collection write — no transaction needed. */
  async recordPrimaryAssessment(input: RecordPrimaryAssessmentInput): Promise<EmergencyEMRDocument> {
    const erVisitId = toObjectId(input.erVisitId, "erVisitId");
    const visit = await ERVisit.findById(erVisitId).lean();
    if (!visit) {
      throw new NotFoundError(`ER visit ${input.erVisitId} not found`);
    }

    return EmergencyEMR.create({
      erVisitId,
      patientId: visit.patientId,
      airwayStatus: input.airwayStatus,
      airwayNotes: input.airwayNotes,
      breathingRatePerMin: input.breathingRatePerMin,
      breathingSpo2Percent: input.breathingSpo2Percent,
      breathingNotes: input.breathingNotes,
      circulationPulseRatePerMin: input.circulationPulseRatePerMin,
      circulationSystolicBP: input.circulationSystolicBP,
      circulationDiastolicBP: input.circulationDiastolicBP,
      circulationCapillaryRefillSec: input.circulationCapillaryRefillSec,
      circulationNotes: input.circulationNotes,
      disabilityGcsScore: input.disabilityGcsScore,
      disabilityPupilResponse: input.disabilityPupilResponse,
      disabilityNotes: input.disabilityNotes,
      exposureNotes: input.exposureNotes,
      overallImpression: input.overallImpression,
      recordedByUserId: input.performedByUserId,
      recordedAt: new Date(),
    });
  }

  /**
   * The Triage Board's one-click "Admit" action. Deliberately does NOT
   * delegate to `ADTService.admitPatient` — that call opens its own
   * transaction, and composing two independent transactions here (claim
   * the bed + create the Admission, then separately close out the ER
   * visit) would leave a window where a successful IPD admission exists
   * but the ER visit still shows WAITING/IN_TREATMENT if the second step
   * failed. Instead the bed claim, the Admission, closing the ER visit,
   * and freeing the ER bay all happen inside one `withTransaction` call,
   * so it either all lands or none of it does.
   */
  async convertToIpdAdmission(input: ConvertToIpdAdmissionInput): Promise<ConvertToIpdAdmissionResult> {
    if (!input.provisionalDiagnosis?.trim()) {
      throw new ValidationError("provisionalDiagnosis is required");
    }

    const erVisitId = toObjectId(input.erVisitId, "erVisitId");
    const bedId = toObjectId(input.bedId, "bedId");
    const attendingDoctorId = toObjectId(input.attendingDoctorId, "attendingDoctorId");

    return withTransaction(async (session) => {
      const visit = await ERVisit.findById(erVisitId).session(session);
      if (!visit) {
        throw new NotFoundError(`ER visit ${input.erVisitId} not found`);
      }
      if (!ACTIVE_ER_STATUSES.includes(visit.status)) {
        throw new ConflictError(`ER visit ${visit.erVisitNumber} is ${visit.status} and cannot be converted to an admission`);
      }

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

      const admissionNumber = await generateAdmissionNumber();
      const now = new Date();

      const admission = firstOrThrow(
        await Admission.create(
          [
            {
              admissionNumber,
              patientId: visit.patientId,
              admittingDoctorId: attendingDoctorId,
              attendingDoctorId,
              admissionType: AdmissionType.EMERGENCY,
              status: AdmissionStatus.ADMITTED,
              currentWardId: claimedBed.wardId,
              currentBedId: claimedBed._id,
              admissionDate: now,
              provisionalDiagnosis: input.provisionalDiagnosis.trim(),
              bedMovementHistory: [
                {
                  wardId: claimedBed.wardId,
                  bedId: claimedBed._id,
                  movementType: "ADMIT",
                  effectiveAt: now,
                  performedByUserId: input.performedByUserId,
                },
              ],
              referredFromErVisitId: visit._id,
              guardianConsentObtained: input.guardianConsentObtained ?? false,
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "Admission.create returned no document",
      );

      claimedBed.currentAdmissionId = admission._id;
      await claimedBed.save({ session });

      if (visit.erBayId) {
        await ERBay.updateOne(
          { _id: visit.erBayId, status: BedStatus.OCCUPIED },
          { $set: { status: BedStatus.CLEANING }, $unset: { currentErVisitId: "" } },
          { session },
        );
      }

      visit.status = ERVisitStatus.ADMITTED;
      visit.dispositionAdmissionId = admission._id;
      visit.dispositionNotes = `Converted to IPD admission ${admissionNumber}`;
      await visit.save({ session });

      return { admission, bed: claimedBed, visit };
    });
  }

  /** Closes out an ER visit that ends WITHOUT becoming an admission (discharged home, LAMA, deceased, or transferred to another facility), freeing its bay for housekeeping. */
  async dischargeErVisit(input: DischargeErVisitInput): Promise<ERVisitDocument> {
    if (!TERMINAL_DISPOSITIONS.includes(input.status)) {
      throw new ValidationError(`status must be one of: ${TERMINAL_DISPOSITIONS.join(", ")}`);
    }

    const erVisitId = toObjectId(input.erVisitId, "erVisitId");

    return withTransaction(async (session) => {
      const visit = await ERVisit.findById(erVisitId).session(session);
      if (!visit) {
        throw new NotFoundError(`ER visit ${input.erVisitId} not found`);
      }
      if (!ACTIVE_ER_STATUSES.includes(visit.status)) {
        throw new ConflictError(`ER visit ${visit.erVisitNumber} is already ${visit.status}`);
      }

      if (visit.erBayId) {
        await ERBay.updateOne(
          { _id: visit.erBayId, status: BedStatus.OCCUPIED },
          { $set: { status: BedStatus.CLEANING }, $unset: { currentErVisitId: "" } },
          { session },
        );
      }

      visit.status = input.status;
      visit.dispositionNotes = input.dispositionNotes;
      visit.dischargedAt = new Date();
      visit.dischargedByUserId = input.performedByUserId;
      await visit.save({ session });

      return visit;
    });
  }

  /** The Triage Board's data source: active visits ranked by acuity, then by who's been waiting longest within the same colour. `activeOnly: false` returns the full day's list instead, e.g. for a shift-handover report. */
  async listErVisits(filters: { activeOnly?: boolean } = {}): Promise<ERVisitDocument[]> {
    const query = filters.activeOnly === false ? {} : { status: { $in: ACTIVE_ER_STATUSES } };
    const visits = await ERVisit.find(query)
      .populate("patientId", "uhid firstName lastName dateOfBirth gender bloodGroup")
      .populate("erBayId", "bayNumber bayType")
      .populate("treatingDoctorId", "fullName");

    return visits.sort((a, b) => {
      const rankDiff = TRIAGE_RANK[a.triagePriority] - TRIAGE_RANK[b.triagePriority];
      if (rankDiff !== 0) return rankDiff;
      return a.arrivedAt.getTime() - b.arrivedAt.getTime();
    });
  }

  async listErBays(): Promise<ERBayDocument[]> {
    return ERBay.find({ isActive: true }).sort({ bayNumber: 1 });
  }

  async getEmergencyEmrHistory(erVisitId: string): Promise<EmergencyEMRDocument[]> {
    const id = toObjectId(erVisitId, "erVisitId");
    return EmergencyEMR.find({ erVisitId: id }).sort({ recordedAt: 1 });
  }
}

export const emergencyService = new EmergencyService();
