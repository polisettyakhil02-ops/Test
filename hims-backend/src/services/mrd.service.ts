import { Types } from "mongoose";
import { Admission } from "../models/ipd/Admission.model.js";
import { MedicalRecordArchive, type MedicalRecordArchiveDocument, type IcdCodeEntry } from "../models/mrd/MedicalRecordArchive.model.js";
import { AdmissionStatus, MrdArchiveStatus, IcdCodingStatus, MrdFileRequestType, MrdFileRequestStatus } from "../types/common.types.js";
import { generateMrdArchiveNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors.js";

export interface CreateArchiveRecordInput {
  admissionId: string;
  fileBarcodeId: string;
  physicalLocation: string;
  performedByUserId: string;
}

export interface FinalizeIcdCodingInput {
  archiveId: string;
  icdCodes: IcdCodeEntry[];
  performedByUserId: string;
}

export interface LogFileRequestInput {
  archiveId: string;
  requestType: MrdFileRequestType;
  requestedByName: string;
  purpose: string;
}

/**
 * MRD's physical-file custody ledger, ICD-10 coding sign-off, and the
 * legal/insurance/patient-copy request log — all single-document writes
 * against `MedicalRecordArchive` (no `withTransaction` needed; see the
 * same reasoning in `specialtyEmr.service.ts`'s header comment).
 */
export class MrdService {
  async createArchiveRecord(input: CreateArchiveRecordInput): Promise<MedicalRecordArchiveDocument> {
    const admissionId = toObjectId(input.admissionId, "admissionId");
    const admission = await Admission.findById(admissionId).lean();
    if (!admission) throw new NotFoundError(`Admission ${input.admissionId} not found`);
    if (admission.status !== AdmissionStatus.DISCHARGED) {
      throw new ConflictError(`Admission ${admissionId.toString()} is ${admission.status}; only discharged admissions can be archived`);
    }

    const existing = await MedicalRecordArchive.findOne({ admissionId }).lean();
    if (existing) throw new ConflictError(`Admission ${admissionId.toString()} already has archive ${existing.archiveNumber}`);

    if (!input.fileBarcodeId.trim()) throw new ValidationError("fileBarcodeId is required");
    if (!input.physicalLocation.trim()) throw new ValidationError("physicalLocation is required");

    const archiveNumber = await generateMrdArchiveNumber();
    return MedicalRecordArchive.create({
      archiveNumber,
      admissionId,
      patientId: admission.patientId,
      fileBarcodeId: input.fileBarcodeId.trim(),
      physicalLocation: input.physicalLocation.trim(),
      status: MrdArchiveStatus.ARCHIVED,
      movementHistory: [],
      icdCodes: [],
      icdCodingStatus: IcdCodingStatus.PENDING,
      fileRequests: [],
      createdBy: input.performedByUserId,
    });
  }

  /** Discharged admissions with no archive record yet — the "create archive" form's patient picker. */
  async listEligibleForArchiving() {
    const archivedAdmissionIds = await MedicalRecordArchive.distinct("admissionId");
    return Admission.find({ status: AdmissionStatus.DISCHARGED, _id: { $nin: archivedAdmissionIds } })
      .sort({ dischargeDate: -1 })
      .limit(200)
      .populate("patientId", "uhid firstName lastName");
  }

  private async findByBarcode(fileBarcodeId: string): Promise<MedicalRecordArchiveDocument> {
    const archive = await MedicalRecordArchive.findOne({ fileBarcodeId: fileBarcodeId.trim() });
    if (!archive) throw new NotFoundError(`No archive found for barcode ${fileBarcodeId}`);
    return archive;
  }

  async checkOutFile(fileBarcodeId: string, reason: string, performedByUserId: string) {
    if (!reason.trim()) throw new ValidationError("reason is required");
    const archive = await this.findByBarcode(fileBarcodeId);
    if (archive.status !== MrdArchiveStatus.ARCHIVED) {
      throw new ConflictError(`File ${archive.fileBarcodeId} is already checked out`);
    }
    archive.status = MrdArchiveStatus.CHECKED_OUT;
    archive.currentMovement = {
      checkedOutAt: new Date(),
      checkedOutToUserId: performedByUserId,
      checkedOutReason: reason.trim(),
    };
    await archive.save();
    return archive;
  }

  async checkInFile(fileBarcodeId: string, performedByUserId: string) {
    const archive = await this.findByBarcode(fileBarcodeId);
    if (archive.status !== MrdArchiveStatus.CHECKED_OUT || !archive.currentMovement) {
      throw new ConflictError(`File ${archive.fileBarcodeId} is not currently checked out`);
    }
    archive.movementHistory.push({
      ...archive.currentMovement,
      checkedInAt: new Date(),
      checkedInByUserId: performedByUserId,
    });
    archive.currentMovement = undefined;
    archive.status = MrdArchiveStatus.ARCHIVED;
    await archive.save();
    return archive;
  }

  async finalizeIcdCoding(input: FinalizeIcdCodingInput) {
    if (input.icdCodes.length === 0) throw new ValidationError("At least one ICD-10 code is required");
    if (input.icdCodes.filter((c) => c.isPrimary).length !== 1) {
      throw new ValidationError("Exactly one ICD-10 code must be marked primary");
    }

    const archive = await MedicalRecordArchive.findById(toObjectId(input.archiveId, "archiveId"));
    if (!archive) throw new NotFoundError(`Archive ${input.archiveId} not found`);

    archive.icdCodes = input.icdCodes;
    archive.icdCodingStatus = IcdCodingStatus.CODED;
    archive.codedByUserId = input.performedByUserId;
    archive.codedAt = new Date();
    await archive.save();
    return archive;
  }

  async flagIcdQuery(archiveId: string, note: string) {
    if (!note.trim()) throw new ValidationError("A query note is required");
    const archive = await MedicalRecordArchive.findById(toObjectId(archiveId, "archiveId"));
    if (!archive) throw new NotFoundError(`Archive ${archiveId} not found`);
    archive.icdCodingStatus = IcdCodingStatus.QUERY_RAISED;
    await archive.save();
    return archive;
  }

  async logFileRequest(input: LogFileRequestInput) {
    if (!input.requestedByName.trim()) throw new ValidationError("requestedByName is required");
    if (!input.purpose.trim()) throw new ValidationError("purpose is required");

    const archive = await MedicalRecordArchive.findById(toObjectId(input.archiveId, "archiveId"));
    if (!archive) throw new NotFoundError(`Archive ${input.archiveId} not found`);

    archive.fileRequests.push({
      _id: new Types.ObjectId(),
      requestType: input.requestType,
      requestedByName: input.requestedByName.trim(),
      requestedAt: new Date(),
      purpose: input.purpose.trim(),
      status: MrdFileRequestStatus.PENDING,
    });
    await archive.save();
    return archive;
  }

  async resolveFileRequest(
    archiveId: string,
    requestId: string,
    resolution: { status: MrdFileRequestStatus.FULFILLED | MrdFileRequestStatus.DENIED; denialReason?: string },
    performedByUserId: string,
  ) {
    const archive = await MedicalRecordArchive.findById(toObjectId(archiveId, "archiveId"));
    if (!archive) throw new NotFoundError(`Archive ${archiveId} not found`);

    const request = archive.fileRequests.find((r) => r._id.toString() === requestId);
    if (!request) throw new NotFoundError(`File request ${requestId} not found on archive ${archive.archiveNumber}`);
    if (request.status !== MrdFileRequestStatus.PENDING) {
      throw new ConflictError(`Request ${requestId} is already ${request.status}`);
    }
    if (resolution.status === MrdFileRequestStatus.DENIED && !resolution.denialReason?.trim()) {
      throw new ValidationError("denialReason is required when denying a request");
    }

    request.status = resolution.status;
    if (resolution.status === MrdFileRequestStatus.FULFILLED) {
      request.fulfilledAt = new Date();
      request.fulfilledByUserId = performedByUserId;
    } else {
      request.denialReason = resolution.denialReason?.trim();
    }
    await archive.save();
    return archive;
  }

  async listArchives(filters: { patientId?: string; status?: MrdArchiveStatus; icdCodingStatus?: IcdCodingStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.patientId) query.patientId = toObjectId(filters.patientId, "patientId");
    if (filters.status) query.status = filters.status;
    if (filters.icdCodingStatus) query.icdCodingStatus = filters.icdCodingStatus;
    return MedicalRecordArchive.find(query).sort({ createdAt: -1 }).populate("patientId", "uhid firstName lastName");
  }

  /** The "pending ICD coding tasks post-discharge" dashboard — oldest backlog first. */
  async listPendingCoding() {
    return MedicalRecordArchive.find({ icdCodingStatus: { $in: [IcdCodingStatus.PENDING, IcdCodingStatus.QUERY_RAISED] } })
      .sort({ createdAt: 1 })
      .populate("patientId", "uhid firstName lastName");
  }

  async getArchiveByBarcode(fileBarcodeId: string) {
    return this.findByBarcode(fileBarcodeId);
  }
}

export const mrdService = new MrdService();
