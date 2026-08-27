import crypto from "node:crypto";
import { Types, type ClientSession, type Model, type FilterQuery, type UpdateQuery } from "mongoose";
import { withTransaction } from "../config/database.js";
import { User, hashPassword, type UserDocument } from "../models/admin/User.model.js";
import { StaffProfile } from "../models/admin/StaffProfile.model.js";
import { Doctor } from "../models/opd/Doctor.model.js";
import { Department } from "../models/admin/Department.model.js";
import { Role, type PermissionGrant } from "../models/admin/Role.model.js";
import { Patient, type PatientDocument } from "../models/mpi/Patient.model.js";
import { Ward } from "../models/ipd/Ward.model.js";
import { Bed } from "../models/ipd/Bed.model.js";
import { TariffMaster } from "../models/billing/TariffMaster.model.js";
import { AuditLog } from "../models/audit/AuditLog.model.js";

// Every model that carries a direct `patientId` reference — the full set
// that must be repointed when two Patient records are merged. Verified
// against the models directory (`grep -rl patientId src/models`), not
// from memory, given how expensive a silently-missed one would be.
import { Prescription } from "../models/emr/Prescription.model.js";
import { Invoice } from "../models/billing/Invoice.model.js";
import { PreAuthorization } from "../models/billing/PreAuthorization.model.js";
import { InsurancePolicy } from "../models/billing/InsurancePolicy.model.js";
import { Payment } from "../models/billing/Payment.model.js";
import { OTSchedule } from "../models/ot/OTSchedule.model.js";
import { LabResult } from "../models/lims/LabResult.model.js";
import { Specimen } from "../models/lims/Specimen.model.js";
import { LabOrder } from "../models/lims/LabOrder.model.js";
import { Dispensation } from "../models/pharmacy/Dispensation.model.js";
import { MedicationAdministration } from "../models/nursing/MedicationAdministration.model.js";
import { VitalsLog } from "../models/nursing/VitalsLog.model.js";
import { DrugAllergy } from "../models/emr/DrugAllergy.model.js";
import { Diagnosis } from "../models/emr/Diagnosis.model.js";
import { ClinicalNote } from "../models/emr/ClinicalNote.model.js";
import { DischargeSummary } from "../models/ipd/DischargeSummary.model.js";
import { Admission } from "../models/ipd/Admission.model.js";
import { OPDVisit } from "../models/opd/OPDVisit.model.js";
import { OPDQueue } from "../models/opd/OPDQueue.model.js";

import { SystemRole, WardCategory, BedStatus, Gender, BloodGroup, type AuditAction } from "../types/common.types.js";
import type { Address, EmergencyContact } from "../types/common.types.js";
import { generateEmployeeCode } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from "../utils/errors.js";
import { invalidatePermissionCache } from "../middlewares/rbac.middleware.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strips fields that carry `select: false` in the schema but are still present on a just-created/just-fetched-with-session document object. */
function sanitizeUser(user: UserDocument): Record<string, unknown> {
  const obj = user.toObject() as unknown as Record<string, unknown>;
  delete obj.passwordHash;
  delete obj.mfaSecretEncrypted;
  return obj;
}

/* ============================================================================
 * Staff Directory Master
 * ==========================================================================*/

const STAFF_SORTABLE_FIELDS = new Set(["username", "email", "createdAt", "isActive"]);

export interface StaffListFilters {
  search?: string;
  role?: SystemRole;
  departmentId?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page: number;
  limit: number;
}

/**
 * Joins User (login identity) with whichever of Doctor / StaffProfile
 * actually holds this person's HR/clinical profile, via an aggregation
 * pipeline rather than fetch-then-JS-merge — a department filter lives on
 * the profile side, not on User, so pagination/total counts would be
 * wrong under a naive fetch-page-then-filter-in-JS approach. `$project`
 * explicitly drops passwordHash/mfaSecretEncrypted: `select: false` in
 * the schema is a query-level Mongoose feature that aggregation pipelines
 * do not honor automatically.
 */
export async function listStaff(filters: StaffListFilters): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const userMatch: Record<string, unknown> = {};
  if (filters.role) userMatch.roles = filters.role;
  if (filters.isActive !== undefined) userMatch.isActive = filters.isActive;
  if (filters.search) {
    const re = new RegExp(escapeRegex(filters.search), "i");
    userMatch.$or = [{ username: re }, { email: re }, { phone: re }];
  }

  const departmentMatch = filters.departmentId
    ? [
        {
          $match: {
            $or: [
              { "staffProfile.departmentId": toObjectId(filters.departmentId, "departmentId") },
              { "doctorProfile.departmentId": toObjectId(filters.departmentId, "departmentId") },
            ],
          },
        },
      ]
    : [];

  const [result] = await User.aggregate([
    { $match: userMatch },
    { $lookup: { from: "staff_profiles", localField: "_id", foreignField: "userId", as: "staffProfile" } },
    { $lookup: { from: "doctors", localField: "_id", foreignField: "userId", as: "doctorProfile" } },
    {
      $addFields: {
        staffProfile: { $arrayElemAt: ["$staffProfile", 0] },
        doctorProfile: { $arrayElemAt: ["$doctorProfile", 0] },
      },
    },
    ...departmentMatch,
    { $project: { passwordHash: 0, mfaSecretEncrypted: 0 } },
    {
      $sort: {
        [filters.sortBy && STAFF_SORTABLE_FIELDS.has(filters.sortBy) ? filters.sortBy : "createdAt"]:
          filters.sortOrder === "asc" ? 1 : -1,
      },
    },
    {
      $facet: {
        data: [{ $skip: (filters.page - 1) * filters.limit }, { $limit: filters.limit }],
        totalCount: [{ $count: "count" }],
      },
    },
  ]);

  const total = (result?.totalCount?.[0]?.count as number | undefined) ?? 0;
  const items = (result?.data as Record<string, unknown>[] | undefined) ?? [];
  return { items, total };
}

export interface CreateStaffInput {
  username: string;
  email: string;
  phone?: string;
  password: string;
  roles: SystemRole[];
  fullName: string;
  departmentId: string;
  designation?: string;
  dateOfJoining: string;
  qualifications?: string[];
  licenseNumber?: string;
  specializations?: string[];
  registrationCouncil?: string;
  registrationNumber?: string;
  consultationFee?: number;
  followUpFee?: number;
}

/**
 * Creates the User (login identity) plus its Doctor or StaffProfile
 * record together — a person with no profile can't be scheduled,
 * assigned a department, or shown correctly in this directory, so the
 * two writes must commit or fail as one unit.
 */
export async function createStaffMember(input: CreateStaffInput) {
  const isDoctor = input.roles.includes(SystemRole.DOCTOR);

  if (isDoctor) {
    if (!input.phone || !input.specializations?.length || !input.registrationCouncil || !input.registrationNumber || input.consultationFee == null) {
      throw new ValidationError(
        "phone, specializations, registrationCouncil, registrationNumber, and consultationFee are required when roles include DOCTOR",
      );
    }
  } else if (!input.designation) {
    throw new ValidationError("designation is required for non-doctor staff");
  }

  const departmentId = toObjectId(input.departmentId, "departmentId");
  const department = await Department.findById(departmentId).lean();
  if (!department) {
    throw new NotFoundError(`Department ${input.departmentId} not found`);
  }

  return withTransaction(async (session) => {
    const passwordHash = await hashPassword(input.password);

    const user = firstOrThrow(
      await User.create(
        [
          {
            username: input.username.toLowerCase(),
            email: input.email.toLowerCase(),
            phone: input.phone,
            passwordHash,
            roles: input.roles,
            isActive: true,
            isLocked: false,
            failedLoginAttempts: 0,
            mustChangePassword: true,
            passwordChangedAt: new Date(),
            mfaEnabled: false,
          },
        ],
        { session },
      ),
      "User.create returned no document",
    );

    const employeeCode = await generateEmployeeCode();

    if (isDoctor) {
      const doctor = firstOrThrow(
        await Doctor.create(
          [
            {
              userId: user._id,
              employeeCode,
              fullName: input.fullName,
              qualifications: input.qualifications ?? [],
              specializations: input.specializations as string[],
              registrationCouncil: input.registrationCouncil as string,
              registrationNumber: input.registrationNumber as string,
              departmentId,
              phone: input.phone as string,
              email: input.email.toLowerCase(),
              consultationFee: input.consultationFee as number,
              followUpFee: input.followUpFee,
              averageConsultationMinutes: 15,
              isActive: true,
            },
          ],
          { session },
        ),
        "Doctor.create returned no document",
      );
      return { user: sanitizeUser(user), profile: doctor, profileType: "DOCTOR" as const };
    }

    const staffProfile = firstOrThrow(
      await StaffProfile.create(
        [
          {
            userId: user._id,
            employeeCode,
            fullName: input.fullName,
            role: input.roles[0] as SystemRole,
            departmentId,
            designation: input.designation as string,
            dateOfJoining: new Date(input.dateOfJoining),
            shiftAssignments: [],
            qualifications: input.qualifications ?? [],
            licenseNumber: input.licenseNumber,
            isActive: true,
          },
        ],
        { session },
      ),
      "StaffProfile.create returned no document",
    );
    return { user: sanitizeUser(user), profile: staffProfile, profileType: "STAFF" as const };
  });
}

export interface UpdateStaffInput {
  email?: string;
  phone?: string;
  roles?: SystemRole[];
  isActive?: boolean;
  fullName?: string;
  departmentId?: string;
  designation?: string;
  qualifications?: string[];
  licenseNumber?: string;
  specializations?: string[];
  registrationCouncil?: string;
  registrationNumber?: string;
  consultationFee?: number;
  followUpFee?: number;
}

/**
 * Updates User fields and whichever profile (Doctor or StaffProfile)
 * this person actually has. Does not support switching a person between
 * the two profile types (e.g. promoting a nurse into a doctor role) —
 * that's a data-migration operation this directory doesn't attempt;
 * it's a create-new / deactivate-old operation instead.
 */
export async function updateStaffMember(userId: string, patch: UpdateStaffInput) {
  const id = toObjectId(userId, "userId");

  return withTransaction(async (session) => {
    const user = await User.findById(id).session(session);
    if (!user) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    if (patch.email) user.email = patch.email.toLowerCase();
    if (patch.phone !== undefined) user.phone = patch.phone;
    if (patch.roles) user.roles = patch.roles;
    if (patch.isActive !== undefined) user.isActive = patch.isActive;
    await user.save({ session });

    const doctor = await Doctor.findOne({ userId: id }).session(session);
    if (doctor) {
      if (patch.fullName) doctor.fullName = patch.fullName;
      if (patch.departmentId) doctor.departmentId = toObjectId(patch.departmentId, "departmentId");
      if (patch.qualifications) doctor.qualifications = patch.qualifications;
      if (patch.specializations) doctor.specializations = patch.specializations;
      if (patch.registrationCouncil) doctor.registrationCouncil = patch.registrationCouncil;
      if (patch.registrationNumber) doctor.registrationNumber = patch.registrationNumber;
      if (patch.consultationFee != null) doctor.consultationFee = patch.consultationFee;
      if (patch.followUpFee != null) doctor.followUpFee = patch.followUpFee;
      if (patch.phone !== undefined) doctor.phone = patch.phone;
      if (patch.email) doctor.email = patch.email.toLowerCase();
      if (patch.isActive !== undefined) doctor.isActive = patch.isActive;
      await doctor.save({ session });
      return { user: sanitizeUser(user), profile: doctor, profileType: "DOCTOR" as const };
    }

    const staffProfile = await StaffProfile.findOne({ userId: id }).session(session);
    if (staffProfile) {
      if (patch.fullName) staffProfile.fullName = patch.fullName;
      if (patch.departmentId) staffProfile.departmentId = toObjectId(patch.departmentId, "departmentId");
      if (patch.designation) staffProfile.designation = patch.designation;
      if (patch.qualifications) staffProfile.qualifications = patch.qualifications;
      if (patch.licenseNumber !== undefined) staffProfile.licenseNumber = patch.licenseNumber;
      if (patch.isActive !== undefined) staffProfile.isActive = patch.isActive;
      await staffProfile.save({ session });
      return { user: sanitizeUser(user), profile: staffProfile, profileType: "STAFF" as const };
    }

    throw new NotFoundError(`No StaffProfile or Doctor record found for user ${userId}`);
  });
}

/** Backs both the dedicated status-toggle endpoint and the "delete" endpoint — see admin.controller.ts for why DELETE is a deactivation, not a hard delete. */
export async function setStaffActiveStatus(userId: string, isActive: boolean) {
  const id = toObjectId(userId, "userId");

  return withTransaction(async (session) => {
    const user = await User.findByIdAndUpdate(id, { isActive }, { new: true, session });
    if (!user) {
      throw new NotFoundError(`User ${userId} not found`);
    }
    await Doctor.updateOne({ userId: id }, { isActive }, { session });
    await StaffProfile.updateOne({ userId: id }, { isActive }, { session });
    return sanitizeUser(user);
  });
}

/** Generates a fresh random temporary password, hashes it, and forces a change on next login. The plaintext is returned exactly once — never persisted, never logged — for the admin to relay to the staff member out of band. */
export async function resetStaffPassword(userId: string): Promise<{ temporaryPassword: string }> {
  const id = toObjectId(userId, "userId");
  const temporaryPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await User.findByIdAndUpdate(
    id,
    { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
    { new: true },
  );
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  return { temporaryPassword };
}

/* ============================================================================
 * Patient Directory Master
 * ==========================================================================*/

const PATIENT_SORTABLE_FIELDS = new Set(["firstName", "lastName", "uhid", "createdAt"]);

export interface PatientListFilters {
  search?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page: number;
  limit: number;
}

export async function listPatients(filters: PatientListFilters): Promise<{ items: PatientDocument[]; total: number }> {
  // Records merged away into another UHID are hidden from the directory by
  // default — they're still queryable directly by id, just not part of
  // the primary search surface once superseded.
  const query: Record<string, unknown> = { mergedIntoPatientId: { $exists: false } };
  if (filters.isActive !== undefined) query.isActive = filters.isActive;
  if (filters.search) {
    const re = new RegExp(escapeRegex(filters.search), "i");
    query.$or = [{ firstName: re }, { lastName: re }, { uhid: re }, { phone: re }];
  }

  const sortField = filters.sortBy && PATIENT_SORTABLE_FIELDS.has(filters.sortBy) ? filters.sortBy : "createdAt";
  const sortDirection = filters.sortOrder === "asc" ? 1 : -1;

  const [total, items] = await Promise.all([
    Patient.countDocuments(query),
    Patient.find(query)
      .sort({ [sortField]: sortDirection })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit) as unknown as Promise<PatientDocument[]>,
  ]);

  return { items, total };
}

export interface UpdatePatientInput {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  address?: Address;
  emergencyContacts?: EmergencyContact[];
}

export async function updatePatientDemographics(patientId: string, patch: UpdatePatientInput, updatedByUserId: string) {
  const id = toObjectId(patientId, "patientId");
  const patient = await Patient.findById(id);
  if (!patient) {
    throw new NotFoundError(`Patient ${patientId} not found`);
  }

  if (patch.firstName) patient.firstName = patch.firstName;
  if (patch.middleName !== undefined) patient.middleName = patch.middleName;
  if (patch.lastName) patient.lastName = patch.lastName;
  if (patch.dateOfBirth) patient.dateOfBirth = new Date(patch.dateOfBirth);
  if (patch.gender) patient.gender = patch.gender;
  if (patch.bloodGroup) patient.bloodGroup = patch.bloodGroup;
  if (patch.phone) patient.phone = patch.phone;
  if (patch.alternatePhone !== undefined) patient.alternatePhone = patch.alternatePhone;
  if (patch.email !== undefined) patient.email = patch.email;
  if (patch.address) patient.address = patch.address;
  if (patch.emergencyContacts) patient.emergencyContacts = patch.emergencyContacts;
  patient.updatedBy = updatedByUserId;

  await patient.save();
  return patient;
}

export async function deactivatePatient(patientId: string) {
  const id = toObjectId(patientId, "patientId");
  const patient = await Patient.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!patient) {
    throw new NotFoundError(`Patient ${patientId} not found`);
  }
  return patient;
}

async function reassignPatientRef<T extends { patientId: Types.ObjectId }>(
  refModel: Model<T>,
  fromPatientId: Types.ObjectId,
  toPatientId: Types.ObjectId,
  session: ClientSession,
): Promise<number> {
  const result = await refModel.updateMany(
    { patientId: fromPatientId } as FilterQuery<T>,
    { $set: { patientId: toPatientId } } as UpdateQuery<T>,
    { session },
  );
  return result.modifiedCount;
}

export interface MergePatientsInput {
  primaryPatientId: string;
  duplicatePatientId: string;
}

export interface MergePatientsResult {
  primaryPatient: PatientDocument;
  recordsReassigned: Record<string, number>;
}

/**
 * Merges a duplicate UHID record into the primary one: every clinical,
 * financial, and operational document referencing the duplicate's
 * `patientId` (19 collections — see the import block above) is
 * repointed at the primary, then the duplicate is marked inactive with
 * `mergedIntoPatientId` set (never hard-deleted — the record must stay
 * resolvable for anyone who has its old UHID on file). One transaction:
 * a merge that repoints half the collections and fails on the rest
 * would corrupt the patient's medical record.
 */
export async function mergePatients(input: MergePatientsInput): Promise<MergePatientsResult> {
  const primaryId = toObjectId(input.primaryPatientId, "primaryPatientId");
  const duplicateId = toObjectId(input.duplicatePatientId, "duplicatePatientId");

  if (primaryId.equals(duplicateId)) {
    throw new ValidationError("primaryPatientId and duplicatePatientId must be different");
  }

  return withTransaction(async (session) => {
    const [primary, duplicate] = await Promise.all([
      Patient.findById(primaryId).session(session),
      Patient.findById(duplicateId).session(session),
    ]);
    if (!primary) {
      throw new NotFoundError(`Patient ${input.primaryPatientId} not found`);
    }
    if (!duplicate) {
      throw new NotFoundError(`Patient ${input.duplicatePatientId} not found`);
    }
    if (duplicate.mergedIntoPatientId) {
      throw new ConflictError(`Patient ${duplicate.uhid} has already been merged into another record`);
    }

    const recordsReassigned: Record<string, number> = {};
    const reassignments: Array<[string, () => Promise<number>]> = [
      ["Prescription", () => reassignPatientRef(Prescription, duplicateId, primaryId, session)],
      ["Invoice", () => reassignPatientRef(Invoice, duplicateId, primaryId, session)],
      ["PreAuthorization", () => reassignPatientRef(PreAuthorization, duplicateId, primaryId, session)],
      ["InsurancePolicy", () => reassignPatientRef(InsurancePolicy, duplicateId, primaryId, session)],
      ["Payment", () => reassignPatientRef(Payment, duplicateId, primaryId, session)],
      ["OTSchedule", () => reassignPatientRef(OTSchedule, duplicateId, primaryId, session)],
      ["LabResult", () => reassignPatientRef(LabResult, duplicateId, primaryId, session)],
      ["Specimen", () => reassignPatientRef(Specimen, duplicateId, primaryId, session)],
      ["LabOrder", () => reassignPatientRef(LabOrder, duplicateId, primaryId, session)],
      ["Dispensation", () => reassignPatientRef(Dispensation, duplicateId, primaryId, session)],
      ["MedicationAdministration", () => reassignPatientRef(MedicationAdministration, duplicateId, primaryId, session)],
      ["VitalsLog", () => reassignPatientRef(VitalsLog, duplicateId, primaryId, session)],
      ["DrugAllergy", () => reassignPatientRef(DrugAllergy, duplicateId, primaryId, session)],
      ["Diagnosis", () => reassignPatientRef(Diagnosis, duplicateId, primaryId, session)],
      ["ClinicalNote", () => reassignPatientRef(ClinicalNote, duplicateId, primaryId, session)],
      ["DischargeSummary", () => reassignPatientRef(DischargeSummary, duplicateId, primaryId, session)],
      ["Admission", () => reassignPatientRef(Admission, duplicateId, primaryId, session)],
      ["OPDVisit", () => reassignPatientRef(OPDVisit, duplicateId, primaryId, session)],
      ["OPDQueue", () => reassignPatientRef(OPDQueue, duplicateId, primaryId, session)],
    ];

    // Sequential, not Promise.all: every operation shares one ClientSession,
    // and the MongoDB driver requires operations on a single session to run
    // one at a time, not concurrently.
    for (const [name, run] of reassignments) {
      recordsReassigned[name] = await run();
    }

    // Merge each duplicate's known-allergy summary and emergency contacts
    // forward so the primary record doesn't lose safety-relevant
    // information the duplicate had captured.
    if (duplicate.knownAllergySummary && !primary.knownAllergySummary) {
      primary.knownAllergySummary = duplicate.knownAllergySummary;
    }
    if (duplicate.emergencyContacts.length > 0) {
      primary.emergencyContacts = [...primary.emergencyContacts, ...duplicate.emergencyContacts];
    }
    await primary.save({ session });

    duplicate.isActive = false;
    duplicate.mergedIntoPatientId = primaryId;
    await duplicate.save({ session });

    return { primaryPatient: primary, recordsReassigned };
  });
}

/* ============================================================================
 * Ward & Bed Tariff Master
 * ==========================================================================*/

async function upsertBedRentTariff(category: WardCategory, price: number, session: ClientSession): Promise<void> {
  const tariff = await TariffMaster.findOne({ serviceCategory: "BED_RENT" }).session(session);

  if (!tariff) {
    await TariffMaster.create(
      [
        {
          serviceCode: "BED-RENT-STD",
          serviceName: "Standard Bed Rent",
          serviceCategory: "BED_RENT",
          basePrice: price,
          wardCategoryPrices: [{ wardCategory: category, price }],
          taxRatePercent: 0,
          isTaxInclusive: false,
          effectiveFrom: new Date(),
          isActive: true,
        },
      ],
      { session },
    );
    return;
  }

  const existingEntry = tariff.wardCategoryPrices.find((p) => p.wardCategory === category);
  if (existingEntry) {
    existingEntry.price = price;
  } else {
    tariff.wardCategoryPrices.push({ wardCategory: category, price });
  }
  await tariff.save({ session });
}

export async function listWardsWithTariffs() {
  const [wards, beds, bedRentTariffs] = await Promise.all([
    Ward.find().sort({ floor: 1, name: 1 }).lean(),
    Bed.find().lean(),
    TariffMaster.find({ serviceCategory: "BED_RENT" }).lean(),
  ]);

  const bedsByWard = new Map<string, typeof beds>();
  for (const bed of beds) {
    const key = bed.wardId.toString();
    const list = bedsByWard.get(key);
    if (list) {
      list.push(bed);
    } else {
      bedsByWard.set(key, [bed]);
    }
  }

  return wards.map((ward) => {
    const wardBeds = bedsByWard.get(ward._id.toString()) ?? [];
    const tariff = bedRentTariffs.find((t) => t.wardCategoryPrices.some((p) => p.wardCategory === ward.category));
    const priceEntry = tariff?.wardCategoryPrices.find((p) => p.wardCategory === ward.category);
    const baseRent = priceEntry?.price ?? tariff?.basePrice ?? 0;

    const occupancySummary = wardBeds.reduce<Record<string, number>>((acc, bed) => {
      acc[bed.status] = (acc[bed.status] ?? 0) + 1;
      return acc;
    }, {});

    return { ward, beds: wardBeds, baseRent, occupancySummary };
  });
}

export interface CreateWardInput {
  name: string;
  code: string;
  category: WardCategory;
  floor: string;
  totalBedCapacity: number;
  baseRent: number;
  nurseStationExtension?: string;
  generateBeds?: boolean;
}

/** Creates the Ward, its beds (unless `generateBeds` is explicitly false), and upserts its BED_RENT tariff entry — one transaction. */
export async function createWard(input: CreateWardInput) {
  return withTransaction(async (session) => {
    const ward = firstOrThrow(
      await Ward.create(
        [
          {
            name: input.name,
            code: input.code.toUpperCase(),
            category: input.category,
            floor: input.floor,
            totalBedCapacity: input.totalBedCapacity,
            nurseStationExtension: input.nurseStationExtension,
            isActive: true,
          },
        ],
        { session },
      ),
      "Ward.create returned no document",
    );

    if (input.generateBeds !== false) {
      const bedDocs = Array.from({ length: input.totalBedCapacity }, (_, i) => ({
        wardId: ward._id,
        bedNumber: `${ward.code}-${String(i + 1).padStart(3, "0")}`,
        category: ward.category,
        status: BedStatus.VACANT,
        ratePerDay: input.baseRent,
        hasOxygenSupply: false,
        hasVentilator: false,
        hasCardiacMonitor: false,
      }));
      await Bed.insertMany(bedDocs, { session });
    }

    await upsertBedRentTariff(input.category, input.baseRent, session);

    return ward;
  });
}

export interface UpdateWardInput {
  name?: string;
  floor?: string;
  totalBedCapacity?: number;
  nurseStationExtension?: string;
  isActive?: boolean;
  baseRent?: number;
}

export async function updateWard(wardId: string, patch: UpdateWardInput) {
  const id = toObjectId(wardId, "wardId");

  return withTransaction(async (session) => {
    const ward = await Ward.findById(id).session(session);
    if (!ward) {
      throw new NotFoundError(`Ward ${wardId} not found`);
    }

    if (patch.name) ward.name = patch.name;
    if (patch.floor) ward.floor = patch.floor;
    if (patch.totalBedCapacity != null) ward.totalBedCapacity = patch.totalBedCapacity;
    if (patch.nurseStationExtension !== undefined) ward.nurseStationExtension = patch.nurseStationExtension;
    if (patch.isActive !== undefined) ward.isActive = patch.isActive;
    await ward.save({ session });

    if (patch.baseRent != null) {
      await upsertBedRentTariff(ward.category, patch.baseRent, session);
    }

    return ward;
  });
}

const ADMIN_SETTABLE_BED_STATUSES: BedStatus[] = [
  BedStatus.VACANT,
  BedStatus.MAINTENANCE,
  BedStatus.CLEANING,
  BedStatus.BLOCKED,
  BedStatus.RESERVED,
];

/** Occupied is deliberately excluded — a bed only becomes OCCUPIED through ADTService.admitPatient, never through this admin override. */
export async function setBedStatus(bedId: string, status: BedStatus, reason: string | undefined) {
  if (!ADMIN_SETTABLE_BED_STATUSES.includes(status)) {
    throw new ValidationError(`Cannot set bed status to ${status} through this endpoint`);
  }

  const id = toObjectId(bedId, "bedId");
  const bed = await Bed.findById(id);
  if (!bed) {
    throw new NotFoundError(`Bed ${bedId} not found`);
  }
  if (bed.currentAdmissionId) {
    throw new ConflictError("Cannot change the status of an occupied bed here — discharge the patient through the IPD workflow first");
  }

  bed.status = status;
  bed.outOfServiceReason = status === BedStatus.MAINTENANCE || status === BedStatus.BLOCKED ? reason : undefined;
  if (status === BedStatus.VACANT) {
    bed.lastSanitizedAt = new Date();
  }
  await bed.save();
  return bed;
}

/* ============================================================================
 * Global Audit Inspector
 * ==========================================================================*/

const AUDIT_LOG_SORTABLE_FIELDS = new Set(["occurredAt", "action", "resourceType", "status"]);

export interface AuditLogFilters {
  userId?: string;
  actionType?: AuditAction | AuditAction[];
  targetResource?: string;
  status?: "SUCCESS" | "FAILED";
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page: number;
  limit: number;
}

export async function listAuditLogs(filters: AuditLogFilters) {
  const query: Record<string, unknown> = {};
  if (filters.userId) query.performedByUserId = filters.userId;
  if (filters.actionType) {
    query.action = Array.isArray(filters.actionType) ? { $in: filters.actionType } : filters.actionType;
  }
  if (filters.targetResource) query.resourceType = filters.targetResource;
  if (filters.status) query.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    const range: Record<string, Date> = {};
    if (filters.dateFrom) range.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) range.$lte = new Date(filters.dateTo);
    query.occurredAt = range;
  }

  const sortField = filters.sortBy && AUDIT_LOG_SORTABLE_FIELDS.has(filters.sortBy) ? filters.sortBy : "occurredAt";
  const sortDirection = filters.sortOrder === "asc" ? 1 : -1;

  const [total, items] = await Promise.all([
    AuditLog.countDocuments(query),
    AuditLog.find(query)
      .sort({ [sortField]: sortDirection })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit)
      .lean(),
  ]);

  return { items, total };
}

/* ============================================================================
 * Role & Permission Matrix
 * ==========================================================================*/

function formatRoleDisplayName(role: SystemRole): string {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Ensures every `SystemRole` has a `Role` document, auto-seeding one with
 * an empty permission grant list the first time a role is seen — there's
 * no separate seed script, so this is what makes the permission-matrix
 * editor (`RoleManagement.tsx`) usable on a brand-new database — then
 * returns them all.
 */
export async function listRoles() {
  const existingRoles = new Set((await Role.distinct("systemRole")) as SystemRole[]);
  const missing = Object.values(SystemRole).filter((role) => !existingRoles.has(role));

  if (missing.length > 0) {
    await Role.insertMany(
      missing.map((role) => ({
        systemRole: role,
        displayName: formatRoleDisplayName(role),
        permissions: [],
        // SUPER_ADMIN bypasses both authorizeRoles and authorizePermission
        // unconditionally (see rbac.middleware.ts) — its grants would be
        // decorative at best and misleading at worst if left editable here.
        isEditable: role !== SystemRole.SUPER_ADMIN,
      })),
      { ordered: false },
    );
  }

  return Role.find().sort({ displayName: 1 });
}

export async function updateRolePermissions(systemRole: SystemRole, permissions: PermissionGrant[]) {
  const role = await Role.findOne({ systemRole });
  if (!role) throw new NotFoundError(`Role ${systemRole} not found`);
  if (!role.isEditable) {
    throw new ForbiddenError(`${role.displayName}'s permissions cannot be edited`);
  }

  role.permissions = permissions;
  await role.save();
  // Otherwise the next request for this role would keep serving the stale
  // grants out of Redis for up to PERMISSION_CACHE_TTL_SECONDS.
  await invalidatePermissionCache(systemRole);
  return role;
}
