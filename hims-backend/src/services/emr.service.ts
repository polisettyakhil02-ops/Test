import { Types } from "mongoose";
import { withTransaction } from "../config/database.js";
import { ClinicalNote, type ClinicalNoteDocument } from "../models/emr/ClinicalNote.model.js";
import { Diagnosis } from "../models/emr/Diagnosis.model.js";
import { Prescription, type PrescriptionDocument, type PrescriptionItem } from "../models/emr/Prescription.model.js";
import { Drug } from "../models/pharmacy/Drug.model.js";
import { OPDVisit } from "../models/opd/OPDVisit.model.js";
import { Admission } from "../models/ipd/Admission.model.js";
import { DischargeSummary } from "../models/ipd/DischargeSummary.model.js";
import { LabOrder } from "../models/lims/LabOrder.model.js";
import { EncounterType, PrescriptionStatus, DrugRoute } from "../types/common.types.js";
import { generatePrescriptionNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

export interface DiagnosisInput {
  icd10Code: string;
  icd10Description: string;
  diagnosisType: "PROVISIONAL" | "CONFIRMED" | "DIFFERENTIAL" | "RULED_OUT";
  isChronic?: boolean;
  isPrimary?: boolean;
  notes?: string;
}

export interface AddClinicalNoteInput {
  patientId: string;
  doctorId: string;
  encounterType: EncounterType;
  opdVisitId?: string;
  admissionId?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnoses: DiagnosisInput[];
  isSigned?: boolean;
  performedByUserId: string;
}

export interface PrescriptionItemInput {
  drugId: string;
  doseValue: number;
  doseUnit: "mg" | "mcg" | "g" | "ml" | "IU" | "tablet" | "drop" | "puff";
  route: DrugRoute;
  frequencyPerDay: number;
  durationDays: number;
  isPRN?: boolean;
  instructions?: string;
}

export interface AddPrescriptionInput {
  patientId: string;
  doctorId: string;
  clinicalNoteId: string;
  encounterType: "OPD" | "IPD";
  items: PrescriptionItemInput[];
  allergyOverride?: boolean;
  allergyOverrideReason?: string;
  performedByUserId: string;
}

export interface TimelineEntry {
  type: "OPD_VISIT" | "ADMISSION" | "CLINICAL_NOTE" | "DIAGNOSIS" | "PRESCRIPTION" | "LAB_ORDER" | "DISCHARGE_SUMMARY";
  date: Date;
  summary: string;
  refId: Types.ObjectId;
  data: unknown;
}

export class EMRService {
  /**
   * Creates the SOAP clinical note and its associated ICD-10 diagnoses
   * together: the note is inserted first (to mint the `clinicalNoteId`
   * every diagnosis references), the diagnoses are inserted next, and the
   * note is updated with the resulting `diagnosisIds` — all inside one
   * transaction so a diagnosis can never exist detached from a note, or a
   * note reference a diagnosis that failed to save.
   */
  async addClinicalNote(input: AddClinicalNoteInput): Promise<ClinicalNoteDocument> {
    if ((input.opdVisitId ? 1 : 0) + (input.admissionId ? 1 : 0) !== 1) {
      throw new ValidationError("Exactly one of opdVisitId or admissionId must be provided");
    }

    const patientId = toObjectId(input.patientId, "patientId");
    const doctorId = toObjectId(input.doctorId, "doctorId");
    const opdVisitId = input.opdVisitId ? toObjectId(input.opdVisitId, "opdVisitId") : undefined;
    const admissionId = input.admissionId ? toObjectId(input.admissionId, "admissionId") : undefined;

    return withTransaction(async (session) => {
      if (opdVisitId) {
        const visitExists = await OPDVisit.exists({ _id: opdVisitId, patientId }).session(session);
        if (!visitExists) {
          throw new NotFoundError(`OPD visit ${input.opdVisitId} not found for this patient`);
        }
      }
      if (admissionId) {
        const admissionExists = await Admission.exists({ _id: admissionId, patientId }).session(session);
        if (!admissionExists) {
          throw new NotFoundError(`Admission ${input.admissionId} not found for this patient`);
        }
      }

      const note = firstOrThrow(
        await ClinicalNote.create(
          [
            {
              patientId,
              doctorId,
              encounterType: input.encounterType,
              opdVisitId,
              admissionId,
              encounterDate: new Date(),
              subjective: input.subjective,
              objective: input.objective,
              assessment: input.assessment,
              plan: input.plan,
              diagnosisIds: [],
              prescriptionIds: [],
              labOrderIds: [],
              allergyCheckAcknowledged: true,
              isSigned: input.isSigned ?? false,
              signedAt: input.isSigned ? new Date() : undefined,
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "ClinicalNote.create returned no document",
      );

      if (input.diagnoses.length > 0) {
        const diagnosisDocs = await Diagnosis.create(
          input.diagnoses.map((d) => ({
            patientId,
            clinicalNoteId: note._id,
            icd10Code: d.icd10Code,
            icd10Description: d.icd10Description,
            diagnosisType: d.diagnosisType,
            isChronic: d.isChronic ?? false,
            isPrimary: d.isPrimary ?? false,
            diagnosedByDoctorId: doctorId,
            diagnosedAt: new Date(),
            notes: d.notes,
          })),
          { session },
        );

        note.diagnosisIds = diagnosisDocs.map((d) => d._id);
        await note.save({ session });
      }

      return note;
    });
  }

  /**
   * Creates the prescription with each item's `computedTotalQuantity`
   * derived from the dosage calculator inputs (`frequencyPerDay *
   * durationDays` — one unit per scheduled administration). A single
   * document write is already atomic at the Mongo level, so this doesn't
   * need `withTransaction`; the allergy hard-stop runs as part of the
   * document's own `pre("validate")` hook (see Prescription.model.ts).
   */
  async addPrescription(input: AddPrescriptionInput): Promise<PrescriptionDocument> {
    if (input.allergyOverride && !input.allergyOverrideReason?.trim()) {
      throw new ValidationError("allergyOverrideReason is required when allergyOverride is true");
    }

    const patientId = toObjectId(input.patientId, "patientId");
    const doctorId = toObjectId(input.doctorId, "doctorId");
    const clinicalNoteId = toObjectId(input.clinicalNoteId, "clinicalNoteId");

    const drugIds = input.items.map((item) => toObjectId(item.drugId, "items[].drugId"));
    const drugs = await Drug.find({ _id: { $in: drugIds } }).lean();
    const drugById = new Map(drugs.map((d) => [d._id.toString(), d]));

    const items: PrescriptionItem[] = input.items.map((itemInput) => {
      const drug = drugById.get(itemInput.drugId);
      if (!drug || !drug.isActive) {
        throw new NotFoundError(`Drug ${itemInput.drugId} not found or inactive`);
      }

      return {
        _id: new Types.ObjectId(),
        drugId: drug._id,
        drugName: drug.brandName ? `${drug.genericName} (${drug.brandName})` : drug.genericName,
        doseValue: itemInput.doseValue,
        doseUnit: itemInput.doseUnit,
        route: itemInput.route,
        frequencyPerDay: itemInput.frequencyPerDay,
        durationDays: itemInput.durationDays,
        isPRN: itemInput.isPRN ?? false,
        instructions: itemInput.instructions,
        computedTotalQuantity: itemInput.frequencyPerDay * itemInput.durationDays,
        quantityDispensed: 0,
        itemStatus: PrescriptionStatus.ORDERED,
      };
    });

    const prescriptionNumber = await generatePrescriptionNumber();

    const prescription = await Prescription.create({
      prescriptionNumber,
      patientId,
      doctorId,
      clinicalNoteId,
      encounterType: input.encounterType,
      items,
      status: PrescriptionStatus.ORDERED,
      allergyOverride: input.allergyOverride ?? false,
      allergyOverrideReason: input.allergyOverrideReason,
      prescribedAt: new Date(),
      createdBy: input.performedByUserId,
    });

    // Link the prescription back onto the note it was written from so the
    // note's own record of what it produced stays complete.
    await ClinicalNote.updateOne({ _id: clinicalNoteId }, { $addToSet: { prescriptionIds: prescription._id } });

    return prescription;
  }

  /**
   * Fans out across every clinical collection for this patient and
   * merges the results into one chronologically-sorted timeline. Read-
   * only and not transaction-bound: a slightly stale cross-collection
   * view is an acceptable tradeoff for a dashboard read, unlike the
   * write paths above.
   */
  async getPatientTimeline(patientIdInput: string): Promise<TimelineEntry[]> {
    const patientId = toObjectId(patientIdInput, "patientId");

    const [opdVisits, admissions, notes, diagnoses, prescriptions, labOrders, dischargeSummaries] = await Promise.all([
      OPDVisit.find({ patientId }).sort({ visitDate: -1 }).lean(),
      Admission.find({ patientId }).sort({ admissionDate: -1 }).lean(),
      ClinicalNote.find({ patientId }).sort({ encounterDate: -1 }).lean(),
      Diagnosis.find({ patientId }).sort({ diagnosedAt: -1 }).lean(),
      Prescription.find({ patientId }).sort({ prescribedAt: -1 }).lean(),
      LabOrder.find({ patientId }).sort({ orderedAt: -1 }).lean(),
      DischargeSummary.find({ patientId }).sort({ dischargeDate: -1 }).lean(),
    ]);

    const entries: TimelineEntry[] = [
      ...opdVisits.map((v) => ({
        type: "OPD_VISIT" as const,
        date: v.visitDate,
        summary: `OPD visit — ${v.chiefComplaint}`,
        refId: v._id,
        data: v,
      })),
      ...admissions.map((a) => ({
        type: "ADMISSION" as const,
        date: a.admissionDate,
        summary: `Admission (${a.admissionType}) — ${a.provisionalDiagnosis}`,
        refId: a._id,
        data: a,
      })),
      ...notes.map((n) => ({
        type: "CLINICAL_NOTE" as const,
        date: n.encounterDate,
        summary: `Clinical note (${n.encounterType})`,
        refId: n._id,
        data: n,
      })),
      ...diagnoses.map((d) => ({
        type: "DIAGNOSIS" as const,
        date: d.diagnosedAt,
        summary: `${d.icd10Code} — ${d.icd10Description}`,
        refId: d._id,
        data: d,
      })),
      ...prescriptions.map((p) => ({
        type: "PRESCRIPTION" as const,
        date: p.prescribedAt,
        summary: `Prescription ${p.prescriptionNumber} (${p.status})`,
        refId: p._id,
        data: p,
      })),
      ...labOrders.map((o) => ({
        type: "LAB_ORDER" as const,
        date: o.orderedAt,
        summary: `Lab order ${o.orderNumber} (${o.status})`,
        refId: o._id,
        data: o,
      })),
      ...dischargeSummaries.map((s) => ({
        type: "DISCHARGE_SUMMARY" as const,
        date: s.dischargeDate,
        summary: `Discharge summary — ${s.finalDiagnosis}`,
        refId: s._id,
        data: s,
      })),
    ];

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return entries;
  }
}

export const emrService = new EMRService();
