import { withTransaction } from "../config/database.js";
import { Patient, type PatientDocument } from "../models/mpi/Patient.model.js";
import { Doctor, type DoctorDocument } from "../models/opd/Doctor.model.js";
import { Asset, type AssetDocument } from "../models/assets/Asset.model.js";
import { RadiologyOrder, type RadiologyOrderDocument } from "../models/radiology/RadiologyOrder.model.js";
import { RadiologyReport, type RadiologyReportDocument } from "../models/radiology/RadiologyReport.model.js";
import {
  AssetCategory,
  AssetStatus,
  EncounterType,
  LabOrderPriority,
  RadiologyOrderStatus,
  RadiologyReportStatus,
} from "../types/common.types.js";
import { generateRadiologyOrderNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { ValidationError, NotFoundError, ConflictError, ResourceUnavailableError } from "../utils/errors.js";

/** The imaging subset of `AssetCategory` — the same enum Step 11's biomedical registry already uses for these devices, constrained here rather than duplicated as a parallel "RadiologyModality" enum. */
const IMAGING_MODALITIES: AssetCategory[] = [
  AssetCategory.XRAY,
  AssetCategory.CT_SCAN,
  AssetCategory.MRI,
  AssetCategory.ULTRASOUND,
];

export interface CreateRadiologyOrderInput {
  patientId: string;
  orderingDoctorId: string;
  encounterType: EncounterType;
  opdVisitId?: string;
  admissionId?: string;
  modality: AssetCategory;
  bodyPart: string;
  clinicalIndication: string;
  contrastRequired?: boolean;
  priority?: LabOrderPriority;
  performedByUserId: string;
}

export interface ScheduleRadiologyOrderInput {
  orderId: string;
  machineAssetId: string;
  scheduledAt: string;
}

export interface SaveReportDraftInput {
  radiologyOrderId: string;
  radiologistId: string;
  findings: string;
  impression: string;
  isCriticalFinding?: boolean;
  criticalFindingNotifiedTo?: string;
}

export interface FinalizeReportInput {
  reportId: string;
  performedByUserId: string;
}

export interface FinalizeReportResult {
  report: RadiologyReportDocument;
  order: RadiologyOrderDocument;
}

/** Mirrors a (heavily simplified) DICOM Modality Worklist response: one entry per scheduled procedure step, keyed by accession number. See `getModalityWorklist`'s own doc comment for what this is and isn't. */
export interface ModalityWorklistEntry {
  accessionNumber: string;
  scheduledProcedureStepStartDateTime?: Date;
  modality: AssetCategory;
  patientId?: string;
  patientName?: string;
  patientBirthDate?: Date;
  patientSex?: string;
  requestedProcedureDescription: string;
  referringPhysicianName?: string;
  studyInstanceUID: string;
}

/** Orders still waiting on a machine slot, in progress, or finished but unreported — the technician worklist's default view. */
const RADIOLOGY_WORKLIST_STATUSES: RadiologyOrderStatus[] = [
  RadiologyOrderStatus.ORDERED,
  RadiologyOrderStatus.SCHEDULED,
  RadiologyOrderStatus.IN_PROGRESS,
  RadiologyOrderStatus.COMPLETED,
];

/** STAT first, then URGENT, then ROUTINE — same in-app ranking used across every other worklist in this codebase (MongoDB can't sort an enum by clinical severity natively). */
const PRIORITY_RANK: Record<LabOrderPriority, number> = {
  [LabOrderPriority.STAT]: 0,
  [LabOrderPriority.URGENT]: 1,
  [LabOrderPriority.ROUTINE]: 2,
};

/**
 * Radiology & RIS engine. `createOrder` is a plain single-document write
 * (no specimen-equivalent object to accession); `finalizeReport` is this
 * module's one real multi-collection transaction, closing the report and
 * advancing its order to `REPORTED` atomically.
 */
export class RadiologyService {
  async listMachines(): Promise<AssetDocument[]> {
    return Asset.find({ category: { $in: IMAGING_MODALITIES }, isActive: true }).sort({ name: 1 });
  }

  async createOrder(input: CreateRadiologyOrderInput): Promise<RadiologyOrderDocument> {
    if (!IMAGING_MODALITIES.includes(input.modality)) {
      throw new ValidationError(`modality must be one of: ${IMAGING_MODALITIES.join(", ")}`);
    }
    if (!input.bodyPart?.trim()) {
      throw new ValidationError("bodyPart is required");
    }
    if (!input.clinicalIndication?.trim()) {
      throw new ValidationError("clinicalIndication is required");
    }

    const patientId = toObjectId(input.patientId, "patientId");
    const orderingDoctorId = toObjectId(input.orderingDoctorId, "orderingDoctorId");

    const [patient, doctor] = await Promise.all([
      Patient.findById(patientId).lean<PatientDocument>(),
      Doctor.findById(orderingDoctorId).lean<DoctorDocument>(),
    ]);
    if (!patient) {
      throw new NotFoundError(`Patient ${input.patientId} not found`);
    }
    if (!doctor || !doctor.isActive) {
      throw new NotFoundError(`Doctor ${input.orderingDoctorId} not found or inactive`);
    }

    const orderNumber = await generateRadiologyOrderNumber();

    return RadiologyOrder.create({
      orderNumber,
      patientId,
      orderingDoctorId,
      encounterType: input.encounterType,
      opdVisitId: input.opdVisitId ? toObjectId(input.opdVisitId, "opdVisitId") : undefined,
      admissionId: input.admissionId ? toObjectId(input.admissionId, "admissionId") : undefined,
      modality: input.modality,
      bodyPart: input.bodyPart.trim(),
      clinicalIndication: input.clinicalIndication.trim(),
      contrastRequired: input.contrastRequired ?? false,
      priority: input.priority ?? LabOrderPriority.ROUTINE,
      status: RadiologyOrderStatus.ORDERED,
      orderedAt: new Date(),
      createdBy: input.performedByUserId,
    });
  }

  /** Assigns a machine + time and moves ORDERED -> SCHEDULED, checking the asset is actually the ordered modality and currently ACTIVE — the same machine-fitness check `DialysisService.scheduleDialysisSession` runs before booking a dialysis machine. */
  async scheduleOrder(input: ScheduleRadiologyOrderInput): Promise<RadiologyOrderDocument> {
    const orderId = toObjectId(input.orderId, "orderId");
    const machineAssetId = toObjectId(input.machineAssetId, "machineAssetId");
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new ValidationError("scheduledAt must be a valid date");
    }

    const order = await RadiologyOrder.findById(orderId);
    if (!order) {
      throw new NotFoundError(`Radiology order ${input.orderId} not found`);
    }
    if (order.status !== RadiologyOrderStatus.ORDERED) {
      throw new ConflictError(`Order ${order.orderNumber} is ${order.status}, not ORDERED`);
    }

    const machine = await Asset.findById(machineAssetId).lean();
    if (!machine) {
      throw new NotFoundError(`Asset ${input.machineAssetId} not found`);
    }
    if (machine.category !== order.modality) {
      throw new ValidationError(`Asset ${machine.assetCode} is a ${machine.category}, not the ordered ${order.modality}`);
    }
    if (machine.status !== AssetStatus.ACTIVE) {
      throw new ResourceUnavailableError(`${machine.name} is ${machine.status} and cannot be scheduled`);
    }

    order.machineAssetId = machine._id;
    order.scheduledAt = scheduledAt;
    order.status = RadiologyOrderStatus.SCHEDULED;
    await order.save();
    return order;
  }

  /** SCHEDULED -> IN_PROGRESS, when the patient is actually on the table. */
  async startExam(orderId: string): Promise<RadiologyOrderDocument> {
    const id = toObjectId(orderId, "orderId");
    const order = await RadiologyOrder.findById(id);
    if (!order) {
      throw new NotFoundError(`Radiology order ${orderId} not found`);
    }
    if (order.status !== RadiologyOrderStatus.SCHEDULED) {
      throw new ConflictError(`Order ${order.orderNumber} is ${order.status}, not SCHEDULED`);
    }
    order.status = RadiologyOrderStatus.IN_PROGRESS;
    await order.save();
    return order;
  }

  /** The technician's "mark scan Completed" action — from SCHEDULED (a quick study, no separate start) or IN_PROGRESS. */
  async markCompleted(orderId: string): Promise<RadiologyOrderDocument> {
    const id = toObjectId(orderId, "orderId");
    const order = await RadiologyOrder.findById(id);
    if (!order) {
      throw new NotFoundError(`Radiology order ${orderId} not found`);
    }
    if (order.status !== RadiologyOrderStatus.SCHEDULED && order.status !== RadiologyOrderStatus.IN_PROGRESS) {
      throw new ConflictError(`Order ${order.orderNumber} is ${order.status} and cannot be marked completed`);
    }
    order.status = RadiologyOrderStatus.COMPLETED;
    order.performedAt = new Date();
    await order.save();
    return order;
  }

  async listWorklist(filters: { status?: RadiologyOrderStatus[]; modality?: AssetCategory } = {}): Promise<RadiologyOrderDocument[]> {
    const statuses = filters.status && filters.status.length > 0 ? filters.status : RADIOLOGY_WORKLIST_STATUSES;
    const query: Record<string, unknown> = { status: { $in: statuses } };
    if (filters.modality) {
      query.modality = filters.modality;
    }

    const orders = await RadiologyOrder.find(query)
      .populate("patientId", "uhid firstName lastName dateOfBirth gender")
      .populate("orderingDoctorId", "fullName")
      .populate("machineAssetId", "assetCode name location");

    return orders.sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.orderedAt.getTime() - b.orderedAt.getTime(),
    );
  }

  /**
   * Mimics a DICOM Modality Worklist (MWL): the JSON a physical scanner's
   * console would auto-populate from, so a technician never re-types
   * patient demographics at the machine. This is a REST/JSON stand-in,
   * not a real MWL SCP — an actual modality speaks the DICOM C-FIND
   * protocol over its own network service, which this HTTP API doesn't
   * (and, per the request's own wording, only needs to "mimic"). Field
   * names follow the DICOM MWL attributes they represent (`PatientName`
   * as `Family^Given`, `PatientSex` as a single-letter code) so the shape
   * is recognizable to anyone who's actually integrated a modality.
   */
  async getModalityWorklist(machineAssetId: string, date?: string): Promise<ModalityWorklistEntry[]> {
    const id = toObjectId(machineAssetId, "machineAssetId");
    const day = date ? new Date(date) : new Date();
    if (Number.isNaN(day.getTime())) {
      throw new ValidationError("date must be a valid date");
    }
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const orders = await RadiologyOrder.find({
      machineAssetId: id,
      status: { $in: [RadiologyOrderStatus.SCHEDULED, RadiologyOrderStatus.IN_PROGRESS] },
      scheduledAt: { $gte: dayStart, $lt: dayEnd },
    })
      .sort({ scheduledAt: 1 })
      .populate<{ patientId: PatientDocument }>("patientId", "uhid firstName lastName dateOfBirth gender")
      .populate<{ orderingDoctorId: DoctorDocument }>("orderingDoctorId", "fullName");

    return orders.map((order) => ({
      accessionNumber: order.orderNumber,
      scheduledProcedureStepStartDateTime: order.scheduledAt,
      modality: order.modality,
      patientId: order.patientId.uhid,
      patientName: `${order.patientId.lastName}^${order.patientId.firstName}`,
      patientBirthDate: order.patientId.dateOfBirth,
      patientSex: order.patientId.gender?.charAt(0),
      requestedProcedureDescription: order.bodyPart,
      referringPhysicianName: order.orderingDoctorId.fullName,
      studyInstanceUID: order._id.toString(),
    }));
  }

  /** Creates or updates the one report a radiology order ever has (the split-screen editor's autosave), refusing to touch it once finalized. */
  async saveReportDraft(input: SaveReportDraftInput): Promise<RadiologyReportDocument> {
    const radiologyOrderId = toObjectId(input.radiologyOrderId, "radiologyOrderId");
    const radiologistId = toObjectId(input.radiologistId, "radiologistId");

    const order = await RadiologyOrder.findById(radiologyOrderId).lean();
    if (!order) {
      throw new NotFoundError(`Radiology order ${input.radiologyOrderId} not found`);
    }
    if (order.status !== RadiologyOrderStatus.COMPLETED && order.status !== RadiologyOrderStatus.REPORTED) {
      throw new ConflictError(`Order ${order.orderNumber} is ${order.status} — the scan must be COMPLETED before a report can be written`);
    }

    const existing = await RadiologyReport.findOne({ radiologyOrderId });
    if (existing) {
      if (existing.status === RadiologyReportStatus.FINALIZED) {
        throw new ConflictError(`The report for order ${order.orderNumber} is already finalized`);
      }
      existing.radiologistId = radiologistId;
      existing.findings = input.findings;
      existing.impression = input.impression;
      if (input.isCriticalFinding !== undefined) {
        existing.isCriticalFinding = input.isCriticalFinding;
      }
      if (input.criticalFindingNotifiedTo !== undefined) {
        existing.criticalFindingNotifiedTo = input.criticalFindingNotifiedTo;
      }
      await existing.save();
      return existing;
    }

    return RadiologyReport.create({
      radiologyOrderId,
      patientId: order.patientId,
      radiologistId,
      findings: input.findings,
      impression: input.impression,
      isCriticalFinding: input.isCriticalFinding ?? false,
      criticalFindingNotifiedTo: input.criticalFindingNotifiedTo,
      status: RadiologyReportStatus.DRAFT,
      dictatedAt: new Date(),
    });
  }

  /**
   * Locks the report and advances its order to `REPORTED` in one
   * transaction — a report can never show FINALIZED without its order
   * reflecting it, or vice versa. Requires non-empty findings/impression,
   * and — mirroring `LabResult`'s critical-value rule — requires a
   * critical finding to record who was notified before it can be locked.
   */
  async finalizeReport(input: FinalizeReportInput): Promise<FinalizeReportResult> {
    const reportId = toObjectId(input.reportId, "reportId");

    return withTransaction(async (session) => {
      const report = await RadiologyReport.findById(reportId).session(session);
      if (!report) {
        throw new NotFoundError(`Radiology report ${input.reportId} not found`);
      }
      if (report.status === RadiologyReportStatus.FINALIZED) {
        throw new ConflictError("This report is already finalized");
      }
      if (!report.findings.trim() || !report.impression.trim()) {
        throw new ValidationError("Both findings and impression are required before finalizing");
      }
      if (report.isCriticalFinding && !report.criticalFindingNotifiedTo?.trim()) {
        throw new ValidationError("A critical finding must record who was notified before the report can be finalized");
      }

      report.status = RadiologyReportStatus.FINALIZED;
      report.finalizedAt = new Date();
      report.finalizedByUserId = input.performedByUserId;
      await report.save({ session });

      const order = await RadiologyOrder.findById(report.radiologyOrderId).session(session);
      if (!order) {
        throw new NotFoundError(`Radiology order ${report.radiologyOrderId.toString()} not found`);
      }
      order.status = RadiologyOrderStatus.REPORTED;
      order.reportId = report._id;
      await order.save({ session });

      return { report, order };
    });
  }

  /** Single-order lookup — what the split-screen report editor loads from when a radiologist opens (or refreshes/deep-links to) one study directly, rather than depending on the worklist page's own cached list. */
  async getOrderById(orderId: string): Promise<RadiologyOrderDocument | null> {
    const id = toObjectId(orderId, "orderId");
    return RadiologyOrder.findById(id)
      .populate("patientId", "uhid firstName lastName dateOfBirth gender")
      .populate("orderingDoctorId", "fullName")
      .populate("machineAssetId", "assetCode name location");
  }

  async getReportForOrder(radiologyOrderId: string): Promise<RadiologyReportDocument | null> {
    const id = toObjectId(radiologyOrderId, "radiologyOrderId");
    return RadiologyReport.findOne({ radiologyOrderId: id });
  }
}

export const radiologyService = new RadiologyService();
