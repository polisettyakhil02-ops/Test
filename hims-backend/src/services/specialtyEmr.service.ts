import { Patient } from "../models/mpi/Patient.model.js";
import { Doctor } from "../models/opd/Doctor.model.js";
import { Admission } from "../models/ipd/Admission.model.js";
import { IvfCycle, type IvfCycleDocument, type StimulationMonitoringVisit, type EmbryoTransferRecord } from "../models/specialty_emr/IvfCycle.model.js";
import {
  ObstetricRecord,
  type ObstetricRecordDocument,
  type AncVisit,
  type PartographReading,
  type DeliveryDetails,
} from "../models/specialty_emr/ObstetricRecord.model.js";
import { DmoHandoverNote, type DmoHandoverNoteDocument } from "../models/specialty_emr/DmoHandoverNote.model.js";
import {
  IvfProtocolType,
  IvfCycleStatus,
  FertilizationMethod,
  ObstetricRecordStatus,
  DialysisShift,
  DmoCriticalityLevel,
  DmoHandoverStatus,
} from "../types/common.types.js";
import { generateIvfCycleNumber, generateObstetricRecordNumber, generateDmoHandoverNoteNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";

/**
 * IVF, Obstetric, and DMO handover EMRs — three unrelated specialties
 * bundled into one service file the same way `lims.service.ts` bundles
 * LabTest/LabOrder/Specimen/LabResult: each writes to exactly one of its
 * own collections per call, so none of these mutations need
 * `withTransaction` (the same single-document-write reasoning documented
 * on `EMRService.addPrescription` and every `DialysisService` transition —
 * a single Mongo document write is already atomic).
 */

async function requirePatient(patientId: string) {
  const id = toObjectId(patientId, "patientId");
  const patient = await Patient.findById(id).lean();
  if (!patient) throw new NotFoundError(`Patient ${patientId} not found`);
  return patient;
}

async function requireDoctor(doctorId: string, fieldName: string) {
  const id = toObjectId(doctorId, fieldName);
  const doctor = await Doctor.findById(id).lean();
  if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);
  return doctor;
}

/* ============================================================================
 * IVF EMR
 * ==========================================================================*/

export interface CreateIvfCycleInput {
  patientId: string;
  partnerPatientId?: string;
  fertilitySpecialistId: string;
  protocolType: IvfProtocolType;
  stimulationStartDate: string;
  stimulationRegimen: string;
  performedByUserId: string;
}

export interface RecordEggRetrievalInput {
  cycleId: string;
  eggRetrievalDate: string;
  oocytesRetrievedCount: number;
  matureOocytesCount: number;
  fertilizationMethod: FertilizationMethod;
}

export interface RecordFertilizationOutcomeInput {
  cycleId: string;
  embryosFormedCount: number;
  embryosFrozenCount: number;
}

export interface RecordBetaHcgInput {
  cycleId: string;
  betaHcgTestDate: string;
  betaHcgResultMIUmL: number;
  isPregnant: boolean;
}

export class IvfService {
  async createCycle(input: CreateIvfCycleInput): Promise<IvfCycleDocument> {
    await requirePatient(input.patientId);
    await requireDoctor(input.fertilitySpecialistId, "fertilitySpecialistId");
    if (input.partnerPatientId) await requirePatient(input.partnerPatientId);

    const cycleNumber = await generateIvfCycleNumber();
    return IvfCycle.create({
      cycleNumber,
      patientId: toObjectId(input.patientId, "patientId"),
      partnerPatientId: input.partnerPatientId ? toObjectId(input.partnerPatientId, "partnerPatientId") : undefined,
      fertilitySpecialistId: toObjectId(input.fertilitySpecialistId, "fertilitySpecialistId"),
      protocolType: input.protocolType,
      status: IvfCycleStatus.STIMULATION,
      stimulationStartDate: new Date(input.stimulationStartDate),
      stimulationRegimen: input.stimulationRegimen,
      monitoringVisits: [],
      embryoTransfers: [],
      createdBy: input.performedByUserId,
    });
  }

  private async getActiveCycle(cycleId: string): Promise<IvfCycleDocument> {
    const cycle = await IvfCycle.findById(toObjectId(cycleId, "cycleId"));
    if (!cycle) throw new NotFoundError(`IVF cycle ${cycleId} not found`);
    if (cycle.status === IvfCycleStatus.CANCELLED) {
      throw new ConflictError(`Cycle ${cycle.cycleNumber} is cancelled`);
    }
    return cycle;
  }

  async addMonitoringVisit(cycleId: string, visit: Omit<StimulationMonitoringVisit, "recordedByUserId">, performedByUserId: string) {
    const cycle = await this.getActiveCycle(cycleId);
    cycle.monitoringVisits.push({ ...visit, recordedByUserId: performedByUserId });
    await cycle.save();
    return cycle;
  }

  async recordTrigger(cycleId: string, triggerShotDate: string, triggerDrugName: string) {
    const cycle = await this.getActiveCycle(cycleId);
    cycle.triggerShotDate = new Date(triggerShotDate);
    cycle.triggerDrugName = triggerDrugName;
    cycle.status = IvfCycleStatus.TRIGGERED;
    await cycle.save();
    return cycle;
  }

  async recordEggRetrieval(input: RecordEggRetrievalInput) {
    const cycle = await this.getActiveCycle(input.cycleId);
    if (input.matureOocytesCount > input.oocytesRetrievedCount) {
      throw new ValidationError("matureOocytesCount cannot exceed oocytesRetrievedCount");
    }
    cycle.eggRetrievalDate = new Date(input.eggRetrievalDate);
    cycle.oocytesRetrievedCount = input.oocytesRetrievedCount;
    cycle.matureOocytesCount = input.matureOocytesCount;
    cycle.fertilizationMethod = input.fertilizationMethod;
    cycle.status = IvfCycleStatus.RETRIEVAL_DONE;
    await cycle.save();
    return cycle;
  }

  async recordFertilizationOutcome(input: RecordFertilizationOutcomeInput) {
    const cycle = await this.getActiveCycle(input.cycleId);
    if (cycle.status !== IvfCycleStatus.RETRIEVAL_DONE) {
      throw new ConflictError(`Cycle ${cycle.cycleNumber} is ${cycle.status}, not RETRIEVAL_DONE`);
    }
    if (input.embryosFrozenCount > input.embryosFormedCount) {
      throw new ValidationError("embryosFrozenCount cannot exceed embryosFormedCount");
    }
    cycle.embryosFormedCount = input.embryosFormedCount;
    cycle.embryosFrozenCount = input.embryosFrozenCount;
    cycle.status = IvfCycleStatus.FERTILIZATION_DONE;
    await cycle.save();
    return cycle;
  }

  async addEmbryoTransfer(cycleId: string, transfer: EmbryoTransferRecord) {
    const cycle = await this.getActiveCycle(cycleId);
    cycle.embryoTransfers.push(transfer);
    cycle.status = IvfCycleStatus.EMBRYO_TRANSFERRED;
    await cycle.save();
    return cycle;
  }

  /** The two-week luteal-support window between transfer and the beta-hCG pregnancy test. */
  async recordLutealSupport(cycleId: string, lutealSupportNotes: string) {
    const cycle = await this.getActiveCycle(cycleId);
    if (cycle.status !== IvfCycleStatus.EMBRYO_TRANSFERRED) {
      throw new ConflictError(`Cycle ${cycle.cycleNumber} is ${cycle.status}, not EMBRYO_TRANSFERRED`);
    }
    cycle.lutealSupportNotes = lutealSupportNotes;
    cycle.status = IvfCycleStatus.LUTEAL_SUPPORT;
    await cycle.save();
    return cycle;
  }

  async recordBetaHcgResult(input: RecordBetaHcgInput) {
    const cycle = await this.getActiveCycle(input.cycleId);
    cycle.betaHcgTestDate = new Date(input.betaHcgTestDate);
    cycle.betaHcgResultMIUmL = input.betaHcgResultMIUmL;
    cycle.isPregnant = input.isPregnant;
    cycle.status = input.isPregnant ? IvfCycleStatus.PREGNANCY_CONFIRMED : IvfCycleStatus.NOT_PREGNANT;
    await cycle.save();
    return cycle;
  }

  async cancelCycle(cycleId: string, reason: string) {
    if (!reason.trim()) throw new ValidationError("reason is required");
    const cycle = await this.getActiveCycle(cycleId);
    cycle.status = IvfCycleStatus.CANCELLED;
    cycle.cancellationReason = reason.trim();
    await cycle.save();
    return cycle;
  }

  async listCycles(filters: { patientId?: string; status?: IvfCycleStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.patientId) query.patientId = toObjectId(filters.patientId, "patientId");
    if (filters.status) query.status = filters.status;
    return IvfCycle.find(query)
      .sort({ stimulationStartDate: -1 })
      .populate("patientId", "uhid firstName lastName")
      .populate("fertilitySpecialistId", "fullName");
  }

  async getCycle(cycleId: string) {
    const cycle = await IvfCycle.findById(toObjectId(cycleId, "cycleId"))
      .populate("patientId", "uhid firstName lastName")
      .populate("fertilitySpecialistId", "fullName");
    if (!cycle) throw new NotFoundError(`IVF cycle ${cycleId} not found`);
    return cycle;
  }
}

/* ============================================================================
 * Obstetric EMR
 * ==========================================================================*/

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Naegele's rule: EDD = LMP + 280 days, used only as a default the doctor can override. */
function estimateDueDate(lmpDate: Date): Date {
  return new Date(lmpDate.getTime() + 280 * MS_PER_DAY);
}

export interface CreateObstetricRecordInput {
  patientId: string;
  obstetricianId: string;
  lmpDate: string;
  eddDate?: string;
  gravida: number;
  para: number;
  abortions?: number;
  livingChildren?: number;
  performedByUserId: string;
}

export class ObstetricService {
  async createRecord(input: CreateObstetricRecordInput): Promise<ObstetricRecordDocument> {
    await requirePatient(input.patientId);
    await requireDoctor(input.obstetricianId, "obstetricianId");

    const lmpDate = new Date(input.lmpDate);
    if (Number.isNaN(lmpDate.getTime())) throw new ValidationError("lmpDate must be a valid date");

    const recordNumber = await generateObstetricRecordNumber();
    return ObstetricRecord.create({
      recordNumber,
      patientId: toObjectId(input.patientId, "patientId"),
      obstetricianId: toObjectId(input.obstetricianId, "obstetricianId"),
      lmpDate,
      eddDate: input.eddDate ? new Date(input.eddDate) : estimateDueDate(lmpDate),
      gravida: input.gravida,
      para: input.para,
      abortions: input.abortions ?? 0,
      livingChildren: input.livingChildren ?? 0,
      status: ObstetricRecordStatus.ANTENATAL,
      ancVisits: [],
      partographReadings: [],
      createdBy: input.performedByUserId,
    });
  }

  private async getRecord(recordId: string): Promise<ObstetricRecordDocument> {
    const record = await ObstetricRecord.findById(toObjectId(recordId, "recordId"));
    if (!record) throw new NotFoundError(`Obstetric record ${recordId} not found`);
    return record;
  }

  async addAncVisit(recordId: string, visit: Omit<AncVisit, "recordedByUserId">, performedByUserId: string) {
    const record = await this.getRecord(recordId);
    if (record.status !== ObstetricRecordStatus.ANTENATAL) {
      throw new ConflictError(`Record ${record.recordNumber} is ${record.status}, not ANTENATAL`);
    }
    record.ancVisits.push({ ...visit, recordedByUserId: performedByUserId });
    await record.save();
    return record;
  }

  /** First partograph reading flips the record into labor and stamps `laborOnsetAt`; subsequent readings just append to the chart. */
  async addPartographReading(recordId: string, reading: Omit<PartographReading, "recordedByUserId">, performedByUserId: string) {
    const record = await this.getRecord(recordId);
    if (record.status === ObstetricRecordStatus.DELIVERED || record.status === ObstetricRecordStatus.POSTNATAL_DISCHARGED) {
      throw new ConflictError(`Record ${record.recordNumber} is ${record.status}; labor has already concluded`);
    }
    if (record.status === ObstetricRecordStatus.ANTENATAL) {
      record.status = ObstetricRecordStatus.IN_LABOR;
      record.laborOnsetAt = reading.recordedAt ? new Date(reading.recordedAt) : new Date();
    }
    record.partographReadings.push({ ...reading, recordedByUserId: performedByUserId });
    await record.save();
    return record;
  }

  async recordDelivery(recordId: string, delivery: DeliveryDetails) {
    const record = await this.getRecord(recordId);
    if (record.status !== ObstetricRecordStatus.IN_LABOR) {
      throw new ConflictError(`Record ${record.recordNumber} is ${record.status}, not IN_LABOR`);
    }
    record.deliveryDetails = delivery;
    record.status = ObstetricRecordStatus.DELIVERED;
    await record.save();
    return record;
  }

  async dischargePostnatal(recordId: string) {
    const record = await this.getRecord(recordId);
    if (record.status !== ObstetricRecordStatus.DELIVERED) {
      throw new ConflictError(`Record ${record.recordNumber} is ${record.status}, not DELIVERED`);
    }
    record.status = ObstetricRecordStatus.POSTNATAL_DISCHARGED;
    await record.save();
    return record;
  }

  async listRecords(filters: { patientId?: string; status?: ObstetricRecordStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.patientId) query.patientId = toObjectId(filters.patientId, "patientId");
    if (filters.status) query.status = filters.status;
    return ObstetricRecord.find(query)
      .sort({ lmpDate: -1 })
      .populate("patientId", "uhid firstName lastName")
      .populate("obstetricianId", "fullName");
  }

  async getRecordForClient(recordId: string) {
    const record = await ObstetricRecord.findById(toObjectId(recordId, "recordId"))
      .populate("patientId", "uhid firstName lastName")
      .populate("obstetricianId", "fullName");
    if (!record) throw new NotFoundError(`Obstetric record ${recordId} not found`);
    return record;
  }
}

/* ============================================================================
 * DMO Handover
 * ==========================================================================*/

export interface CreateDmoHandoverNoteInput {
  patientId: string;
  admissionId?: string;
  dutyDoctorId: string;
  shift: DialysisShift;
  shiftDate: string;
  criticalityLevel: DmoCriticalityLevel;
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  actionItems?: string[];
  performedByUserId: string;
}

export class DmoHandoverService {
  async createNote(input: CreateDmoHandoverNoteInput): Promise<DmoHandoverNoteDocument> {
    await requirePatient(input.patientId);
    await requireDoctor(input.dutyDoctorId, "dutyDoctorId");
    if (input.admissionId) {
      const admissionId = toObjectId(input.admissionId, "admissionId");
      const admissionExists = await Admission.exists({ _id: admissionId, patientId: toObjectId(input.patientId, "patientId") });
      if (!admissionExists) throw new NotFoundError(`Admission ${input.admissionId} not found for this patient`);
    }

    const noteNumber = await generateDmoHandoverNoteNumber();
    return DmoHandoverNote.create({
      noteNumber,
      patientId: toObjectId(input.patientId, "patientId"),
      admissionId: input.admissionId ? toObjectId(input.admissionId, "admissionId") : undefined,
      dutyDoctorId: toObjectId(input.dutyDoctorId, "dutyDoctorId"),
      shift: input.shift,
      shiftDate: new Date(input.shiftDate),
      criticalityLevel: input.criticalityLevel,
      situation: input.situation,
      background: input.background,
      assessment: input.assessment,
      recommendation: input.recommendation,
      actionItems: input.actionItems ?? [],
      status: DmoHandoverStatus.PENDING_ACKNOWLEDGEMENT,
      createdBy: input.performedByUserId,
    });
  }

  async acknowledgeNote(noteId: string, performedByUserId: string) {
    const note = await DmoHandoverNote.findById(toObjectId(noteId, "noteId"));
    if (!note) throw new NotFoundError(`DMO handover note ${noteId} not found`);
    if (note.status === DmoHandoverStatus.ACKNOWLEDGED) {
      throw new ConflictError(`Note ${note.noteNumber} is already acknowledged`);
    }
    note.status = DmoHandoverStatus.ACKNOWLEDGED;
    note.acknowledgedByUserId = performedByUserId;
    note.acknowledgedAt = new Date();
    await note.save();
    return note;
  }

  /** The morning board's data source — pending notes float first, most critical first, oldest first within a criticality band. */
  async listNotes(filters: { patientId?: string; status?: DmoHandoverStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.patientId) query.patientId = toObjectId(filters.patientId, "patientId");
    if (filters.status) query.status = filters.status;

    const notes = await DmoHandoverNote.find(query)
      .populate("patientId", "uhid firstName lastName")
      .populate("dutyDoctorId", "fullName")
      .lean();

    const criticalityRank: Record<DmoCriticalityLevel, number> = {
      [DmoCriticalityLevel.CRITICAL]: 0,
      [DmoCriticalityLevel.URGENT]: 1,
      [DmoCriticalityLevel.WATCH]: 2,
    };
    const statusRank: Record<DmoHandoverStatus, number> = {
      [DmoHandoverStatus.PENDING_ACKNOWLEDGEMENT]: 0,
      [DmoHandoverStatus.ACKNOWLEDGED]: 1,
    };

    return notes.sort((a, b) => {
      if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
      if (criticalityRank[a.criticalityLevel] !== criticalityRank[b.criticalityLevel]) {
        return criticalityRank[a.criticalityLevel] - criticalityRank[b.criticalityLevel];
      }
      return b.shiftDate.getTime() - a.shiftDate.getTime();
    });
  }
}

export const ivfService = new IvfService();
export const obstetricService = new ObstetricService();
export const dmoHandoverService = new DmoHandoverService();
