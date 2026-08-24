import { withTransaction } from "../config/database.js";
import { BloodDonor, type BloodDonorDocument } from "../models/bloodbank/BloodDonor.model.js";
import { BloodBag, type BloodBagDocument } from "../models/bloodbank/BloodBag.model.js";
import { CrossMatchRequest, type CrossMatchRequestDocument } from "../models/bloodbank/CrossMatchRequest.model.js";
import { Patient } from "../models/mpi/Patient.model.js";
import { Gender, BloodGroup, BloodComponentType, BloodBagStatus, CrossMatchStatus } from "../types/common.types.js";
import { generateDonorCode, generateBloodBagNumber, generateCrossMatchRequestNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/errors.js";

export interface RegisterDonorInput {
  fullName: string;
  age: number;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  address?: string;
  medicalNotes?: string;
  performedByUserId: string;
}

export interface LogDonationInput {
  donorId: string;
  componentType: BloodComponentType;
  volumeMl: number;
  collectionDate: string;
  storageLocation: string;
  screeningTestsPassed: boolean;
  performedByUserId: string;
}

export interface LogDonationResult {
  bag: BloodBagDocument;
  donor: BloodDonorDocument;
}

/** Shelf life in days per component — whole blood/PRBC store refrigerated (short), platelets shortest of all (room temp, clot risk), plasma/cryo frozen (long). Used to compute `BloodBag.expiryDate` at collection time. */
const SHELF_LIFE_DAYS: Record<BloodComponentType, number> = {
  [BloodComponentType.WHOLE_BLOOD]: 35,
  [BloodComponentType.PRBC]: 42,
  [BloodComponentType.PLATELETS]: 5,
  [BloodComponentType.FFP]: 365,
  [BloodComponentType.CRYOPRECIPITATE]: 365,
};

export interface RaiseCrossMatchRequestInput {
  patientId: string;
  admissionId?: string;
  bloodGroupRequired: BloodGroup;
  componentType: BloodComponentType;
  unitsRequired: number;
  urgent?: boolean;
  performedByUserId: string;
}

export interface PerformCrossMatchInput {
  crossMatchRequestId: string;
  compatible: boolean;
  resultNotes?: string;
  performedByUserId: string;
}

export interface DispenseBloodBagInput {
  crossMatchRequestId: string;
  bagId: string;
  admissionId: string;
  performedByUserId: string;
}

/**
 * Blood Bank Inventory, Donor, and Cross-Match engine. The one rule this
 * module exists to enforce in code — not just on paper — is
 * `dispenseBloodBag`'s pair of guards: a bag can only leave the fridge if
 * it was reserved against a request that came back COMPATIBLE, and only
 * if it has not expired since being reserved.
 */
export class BloodBankService {
  async registerDonor(input: RegisterDonorInput): Promise<BloodDonorDocument> {
    if (!input.fullName?.trim()) throw new ValidationError("fullName is required");
    const donorCode = await generateDonorCode();
    return BloodDonor.create({
      donorCode,
      fullName: input.fullName.trim(),
      age: input.age,
      gender: input.gender,
      bloodGroup: input.bloodGroup,
      phone: input.phone,
      address: input.address,
      medicalNotes: input.medicalNotes,
      totalDonations: 0,
      isEligible: true,
      createdBy: input.performedByUserId,
    });
  }

  async listDonors(filters: { bloodGroup?: BloodGroup } = {}): Promise<BloodDonorDocument[]> {
    const query: Record<string, unknown> = {};
    if (filters.bloodGroup) query.bloodGroup = filters.bloodGroup;
    return BloodDonor.find(query).sort({ fullName: 1 });
  }

  /**
   * Logs one donation camp collection: creates the `BloodBag` and bumps
   * the donor's running totals atomically, so a bag can never exist
   * without the donor's history reflecting it (or vice versa). A bag that
   * fails its screening panel is created `DISCARDED`, never `AVAILABLE` —
   * it still exists as a record (for traceability/wastage reporting) but
   * can never enter the dispensable pool.
   */
  async logDonation(input: LogDonationInput): Promise<LogDonationResult> {
    if (input.volumeMl <= 0) throw new ValidationError("volumeMl must be positive");
    const donorId = toObjectId(input.donorId, "donorId");
    const collectionDate = new Date(input.collectionDate);
    if (Number.isNaN(collectionDate.getTime())) throw new ValidationError("collectionDate must be a valid date");

    return withTransaction(async (session) => {
      const donor = await BloodDonor.findById(donorId).session(session);
      if (!donor) throw new NotFoundError(`Donor ${input.donorId} not found`);
      if (!donor.isEligible) {
        throw new ConflictError(`${donor.fullName} (${donor.donorCode}) is currently marked ineligible to donate`);
      }

      const shelfLifeDays = SHELF_LIFE_DAYS[input.componentType];
      const expiryDate = new Date(collectionDate.getTime() + shelfLifeDays * 24 * 60 * 60 * 1000);
      const bagNumber = await generateBloodBagNumber();

      const bag = firstOrThrow(
        await BloodBag.create(
          [
            {
              bagNumber,
              donorId: donor._id,
              bloodGroup: donor.bloodGroup,
              componentType: input.componentType,
              volumeMl: input.volumeMl,
              collectionDate,
              expiryDate,
              screeningTestsPassed: input.screeningTestsPassed,
              status: input.screeningTestsPassed ? BloodBagStatus.AVAILABLE : BloodBagStatus.DISCARDED,
              storageLocation: input.storageLocation,
              discardReason: input.screeningTestsPassed ? undefined : "Failed donor screening panel",
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "BloodBag.create returned no document",
      );

      donor.lastDonationDate = collectionDate;
      donor.totalDonations += 1;
      await donor.save({ session });

      return { bag, donor };
    });
  }

  /** Inventory grid grouped by blood group + component — each row carries whether it's dispensable right now (AVAILABLE and not past `expiryDate`), computed live rather than trusting a background job to have already flipped stale bags to EXPIRED. */
  async listInventory(filters: { bloodGroup?: BloodGroup; componentType?: BloodComponentType } = {}): Promise<
    { bag: BloodBagDocument; isExpired: boolean; isDispensable: boolean }[]
  > {
    const query: Record<string, unknown> = {};
    if (filters.bloodGroup) query.bloodGroup = filters.bloodGroup;
    if (filters.componentType) query.componentType = filters.componentType;

    const bags = await BloodBag.find(query).sort({ bloodGroup: 1, componentType: 1, expiryDate: 1 });
    const now = new Date();
    return bags.map((bag) => {
      const isExpired = bag.expiryDate.getTime() <= now.getTime();
      return { bag, isExpired, isDispensable: bag.status === BloodBagStatus.AVAILABLE && !isExpired };
    });
  }

  async raiseCrossMatchRequest(input: RaiseCrossMatchRequestInput): Promise<CrossMatchRequestDocument> {
    if (input.unitsRequired <= 0) throw new ValidationError("unitsRequired must be positive");
    const patientId = toObjectId(input.patientId, "patientId");
    const patient = await Patient.findById(patientId).lean();
    if (!patient) throw new NotFoundError(`Patient ${input.patientId} not found`);

    const requestNumber = await generateCrossMatchRequestNumber();
    return CrossMatchRequest.create({
      requestNumber,
      patientId,
      admissionId: input.admissionId ? toObjectId(input.admissionId, "admissionId") : undefined,
      bloodGroupRequired: input.bloodGroupRequired,
      componentType: input.componentType,
      unitsRequired: input.unitsRequired,
      status: CrossMatchStatus.PENDING,
      urgent: input.urgent ?? false,
      requestedByUserId: input.performedByUserId,
      requestedAt: new Date(),
    });
  }

  /**
   * Records the lab's compatibility result. A COMPATIBLE result reserves
   * the actual units (AVAILABLE -> RESERVED) in the same transaction as
   * the status change, selected first-expiring-first (FEFO) among
   * non-expired stock — so "compatible" always comes with real units
   * already held against it, never just an approval with nothing backing
   * it. Insufficient matching stock aborts the whole reservation rather
   * than partially reserving fewer units than requested.
   */
  async performCrossMatch(input: PerformCrossMatchInput): Promise<CrossMatchRequestDocument> {
    const requestId = toObjectId(input.crossMatchRequestId, "crossMatchRequestId");
    if (!input.compatible && !input.resultNotes?.trim()) {
      throw new ValidationError("resultNotes is required when recording an incompatible result");
    }

    return withTransaction(async (session) => {
      const request = await CrossMatchRequest.findById(requestId).session(session);
      if (!request) throw new NotFoundError(`Cross-match request ${input.crossMatchRequestId} not found`);
      if (request.status !== CrossMatchStatus.PENDING) {
        throw new ConflictError(`Cross-match request ${request.requestNumber} is already ${request.status}`);
      }

      if (!input.compatible) {
        request.status = CrossMatchStatus.INCOMPATIBLE;
        request.resultNotes = input.resultNotes;
        request.performedByUserId = input.performedByUserId;
        request.performedAt = new Date();
        await request.save({ session });
        return request;
      }

      const now = new Date();
      const candidateBags = await BloodBag.find({
        bloodGroup: request.bloodGroupRequired,
        componentType: request.componentType,
        status: BloodBagStatus.AVAILABLE,
        expiryDate: { $gt: now },
      })
        .sort({ expiryDate: 1 })
        .limit(request.unitsRequired)
        .session(session);

      if (candidateBags.length < request.unitsRequired) {
        throw new ConflictError(
          `Only ${candidateBags.length} of ${request.unitsRequired} required unit(s) of ${request.componentType} (${request.bloodGroupRequired}) are available`,
        );
      }

      const bagIds = candidateBags.map((bag) => bag._id);
      await BloodBag.updateMany(
        { _id: { $in: bagIds } },
        { $set: { status: BloodBagStatus.RESERVED } },
        { session },
      );

      request.status = CrossMatchStatus.COMPATIBLE;
      request.crossMatchedBagIds = bagIds;
      request.resultNotes = input.resultNotes;
      request.performedByUserId = input.performedByUserId;
      request.performedAt = now;
      await request.save({ session });

      return request;
    });
  }

  /**
   * The dispensing guard: a bag is only ever handed to a ward if (1) it
   * is one of the exact units reserved against a request that came back
   * `COMPATIBLE` — never any other AVAILABLE bag of the right group, even
   * one sitting right next to it — and (2) it has not expired since being
   * reserved. Either failure raises a `ConflictError` instead of issuing
   * the unit.
   */
  async dispenseBloodBag(input: DispenseBloodBagInput): Promise<{ bag: BloodBagDocument; request: CrossMatchRequestDocument }> {
    const requestId = toObjectId(input.crossMatchRequestId, "crossMatchRequestId");
    const bagId = toObjectId(input.bagId, "bagId");
    const admissionId = toObjectId(input.admissionId, "admissionId");

    return withTransaction(async (session) => {
      const request = await CrossMatchRequest.findById(requestId).session(session);
      if (!request) throw new NotFoundError(`Cross-match request ${input.crossMatchRequestId} not found`);
      if (request.status !== CrossMatchStatus.COMPATIBLE) {
        throw new ConflictError(
          `Cross-match request ${request.requestNumber} is ${request.status}, not COMPATIBLE — this blood bag cannot be dispensed against it`,
        );
      }
      if (!request.crossMatchedBagIds.some((id) => id.equals(bagId))) {
        throw new ConflictError(`Bag ${input.bagId} was not reserved against cross-match request ${request.requestNumber}`);
      }

      const bag = await BloodBag.findById(bagId).session(session);
      if (!bag) throw new NotFoundError(`Blood bag ${input.bagId} not found`);
      if (bag.status !== BloodBagStatus.RESERVED) {
        throw new ConflictError(`Bag ${bag.bagNumber} is ${bag.status}, not RESERVED — it cannot be dispensed`);
      }
      if (bag.expiryDate.getTime() <= Date.now()) {
        bag.status = BloodBagStatus.EXPIRED;
        await bag.save({ session });
        throw new ConflictError(`Bag ${bag.bagNumber} expired on ${bag.expiryDate.toISOString()} and cannot be dispensed`);
      }

      bag.status = BloodBagStatus.ISSUED;
      bag.issuedToAdmissionId = admissionId;
      bag.issuedAt = new Date();
      bag.issuedByUserId = input.performedByUserId;
      await bag.save({ session });

      const stillReserved = await BloodBag.countDocuments({
        _id: { $in: request.crossMatchedBagIds },
        status: BloodBagStatus.RESERVED,
      }).session(session);
      if (stillReserved === 0) {
        request.status = CrossMatchStatus.FULFILLED;
        await request.save({ session });
      }

      return { bag, request };
    });
  }

  async listCrossMatchRequests(filters: { status?: CrossMatchStatus } = {}): Promise<CrossMatchRequestDocument[]> {
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    return CrossMatchRequest.find(query)
      .sort({ urgent: -1, requestedAt: 1 })
      .populate("patientId", "uhid firstName lastName bloodGroup");
  }
}

export const bloodBankService = new BloodBankService();
