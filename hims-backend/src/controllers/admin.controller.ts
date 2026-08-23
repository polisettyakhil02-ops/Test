import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Department } from "../models/admin/Department.model.js";
import * as adminService from "../services/admin.service.js";
import {
  SystemRole,
  WardCategory,
  BedStatus,
  AuditAction,
  Gender,
  BloodGroup,
  PHONE_REGEX,
  EMAIL_REGEX,
} from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

function parsePagination(req: Request): { page: number; limit: number } {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
  return { page, limit };
}

/** Field-name allowlisting happens in the service layer (`admin.service.ts`); this just parses the two query params into the shape every list endpoint accepts. */
function parseSort(req: Request): { sortBy?: string; sortOrder?: "asc" | "desc" } {
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : undefined;
  const sortOrder = req.query.sortOrder === "asc" || req.query.sortOrder === "desc" ? req.query.sortOrder : undefined;
  return { sortBy, sortOrder };
}

/* ============================================================================
 * Staff Directory Master
 * ==========================================================================*/

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req);
    const { items, total } = await adminService.listStaff({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      role: typeof req.query.role === "string" ? (req.query.role as SystemRole) : undefined,
      departmentId: typeof req.query.departmentId === "string" ? req.query.departmentId : undefined,
      isActive: req.query.isActive === undefined ? undefined : req.query.isActive === "true",
      ...parseSort(req),
      page,
      limit,
    });
    res.status(200).json({ data: items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

const CreateUserSchema = z
  .object({
    username: z.string().min(3).max(50),
    email: z.string().regex(EMAIL_REGEX, "Invalid email"),
    phone: z.string().regex(PHONE_REGEX, "Invalid phone number").optional(),
    password: z.string().min(10, "Password must be at least 10 characters"),
    roles: z.array(z.nativeEnum(SystemRole)).min(1, "At least one role is required"),
    fullName: z.string().min(1).max(150),
    departmentId: z.string().min(1),
    designation: z.string().min(1).optional(),
    dateOfJoining: z.string().min(1),
    qualifications: z.array(z.string()).optional(),
    licenseNumber: z.string().optional(),
    specializations: z.array(z.string()).optional(),
    registrationCouncil: z.string().optional(),
    registrationNumber: z.string().optional(),
    consultationFee: z.number().min(0).optional(),
    followUpFee: z.number().min(0).optional(),
  })
  .strict();

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const result = await adminService.createStaffMember(parsed.data);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const UpdateUserSchema = z
  .object({
    email: z.string().regex(EMAIL_REGEX, "Invalid email").optional(),
    phone: z.string().regex(PHONE_REGEX, "Invalid phone number").optional(),
    roles: z.array(z.nativeEnum(SystemRole)).min(1).optional(),
    isActive: z.boolean().optional(),
    fullName: z.string().min(1).max(150).optional(),
    departmentId: z.string().min(1).optional(),
    designation: z.string().min(1).optional(),
    qualifications: z.array(z.string()).optional(),
    licenseNumber: z.string().optional(),
    specializations: z.array(z.string()).optional(),
    registrationCouncil: z.string().optional(),
    registrationNumber: z.string().optional(),
    consultationFee: z.number().min(0).optional(),
    followUpFee: z.number().min(0).optional(),
  })
  .strict();

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError("id route parameter is required");

    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const result = await adminService.updateStaffMember(id, parsed.data);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

const SetUserStatusSchema = z.object({ isActive: z.boolean() }).strict();

export async function setUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError("id route parameter is required");

    const parsed = SetUserStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const result = await adminService.setStaffActiveStatus(id, parsed.data.isActive);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * Staff records are never hard-deleted — every collection in the system
 * references a User/Doctor/StaffProfile by id (createdBy, prescribedBy,
 * audit trails, ...), and a HIMS's compliance obligations mean that
 * history must stay intact. DELETE here is a deactivation, exposed under
 * the REST-conventional verb the spec asked for.
 */
export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError("id route parameter is required");

    const result = await adminService.setStaffActiveStatus(id, false);
    res.status(200).json({ data: result, message: "Staff member deactivated (accounts are never hard-deleted)" });
  } catch (err) {
    next(err);
  }
}

export async function resetUserPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError("id route parameter is required");

    const result = await adminService.resetStaffPassword(id);
    res.status(200).json({
      data: result,
      message: "Temporary password generated — relay it to the staff member out of band. It will not be shown again.",
    });
  } catch (err) {
    next(err);
  }
}

export async function listDepartments(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const departments = await Department.find({ isActive: true }).sort({ name: 1 }).lean();
    res.status(200).json({ data: departments });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * Patient Directory Master
 * ==========================================================================*/

export async function listPatientsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req);
    const { items, total } = await adminService.listPatients({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      isActive: req.query.isActive === undefined ? undefined : req.query.isActive === "true",
      ...parseSort(req),
      page,
      limit,
    });
    res.status(200).json({ data: items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().min(1),
  postalCode: z.string().min(1),
});

const EmergencyContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().regex(PHONE_REGEX, "Invalid phone number"),
  alternatePhone: z.string().regex(PHONE_REGEX, "Invalid phone number").optional(),
});

const UpdatePatientSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    middleName: z.string().max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    dateOfBirth: z.string().min(1).optional(),
    gender: z.nativeEnum(Gender).optional(),
    bloodGroup: z.nativeEnum(BloodGroup).optional(),
    phone: z.string().regex(PHONE_REGEX, "Invalid phone number").optional(),
    alternatePhone: z.string().regex(PHONE_REGEX, "Invalid phone number").optional(),
    email: z.string().regex(EMAIL_REGEX, "Invalid email").optional(),
    address: AddressSchema.optional(),
    emergencyContacts: z.array(EmergencyContactSchema).min(1).optional(),
  })
  .strict();

export async function updatePatientAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthenticationError("Must be authenticated");
    const { id } = req.params;
    if (!id) throw new ValidationError("id route parameter is required");

    const parsed = UpdatePatientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const patient = await adminService.updatePatientDemographics(id, parsed.data, req.user.id);
    res.status(200).json({ data: patient });
  } catch (err) {
    next(err);
  }
}

export async function deletePatientAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError("id route parameter is required");

    const patient = await adminService.deactivatePatient(id);
    res.status(200).json({ data: patient, message: "Patient record deactivated (records are never hard-deleted)" });
  } catch (err) {
    next(err);
  }
}

const MergePatientsSchema = z
  .object({
    primaryPatientId: z.string().min(1),
    duplicatePatientId: z.string().min(1),
  })
  .strict();

export async function mergePatientsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = MergePatientsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const result = await adminService.mergePatients(parsed.data);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * Ward & Bed Tariff Master
 * ==========================================================================*/

export async function listWardsAdmin(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const wards = await adminService.listWardsWithTariffs();
    res.status(200).json({ data: wards });
  } catch (err) {
    next(err);
  }
}

const CreateWardSchema = z
  .object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(20),
    category: z.nativeEnum(WardCategory),
    floor: z.string().min(1),
    totalBedCapacity: z.number().int().min(1).max(500),
    baseRent: z.number().min(0),
    nurseStationExtension: z.string().optional(),
    generateBeds: z.boolean().optional(),
  })
  .strict();

export async function createWardAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = CreateWardSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const ward = await adminService.createWard(parsed.data);
    res.status(201).json({ data: ward });
  } catch (err) {
    next(err);
  }
}

const UpdateWardSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    floor: z.string().min(1).optional(),
    totalBedCapacity: z.number().int().min(1).max(500).optional(),
    nurseStationExtension: z.string().optional(),
    isActive: z.boolean().optional(),
    baseRent: z.number().min(0).optional(),
  })
  .strict();

export async function updateWardAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError("id route parameter is required");

    const parsed = UpdateWardSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const ward = await adminService.updateWard(id, parsed.data);
    res.status(200).json({ data: ward });
  } catch (err) {
    next(err);
  }
}

const SetBedStatusSchema = z
  .object({
    status: z.nativeEnum(BedStatus),
    reason: z.string().max(500).optional(),
  })
  .strict();

export async function setBedStatusAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { bedId } = req.params;
    if (!bedId) throw new ValidationError("bedId route parameter is required");

    const parsed = SetBedStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const bed = await adminService.setBedStatus(bedId, parsed.data.status, parsed.data.reason);
    res.status(200).json({ data: bed });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * Global Audit Inspector
 * ==========================================================================*/

export async function listAuditLogsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = parsePagination(req);
    const { items, total } = await adminService.listAuditLogs({
      userId: typeof req.query.userId === "string" ? req.query.userId : undefined,
      actionType:
        typeof req.query.actionType === "string"
          ? (req.query.actionType.split(",").filter(Boolean) as AuditAction[])
          : undefined,
      targetResource: typeof req.query.targetResource === "string" ? req.query.targetResource : undefined,
      status: req.query.status === "SUCCESS" || req.query.status === "FAILED" ? req.query.status : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      ...parseSort(req),
      page,
      limit,
    });
    res.status(200).json({ data: items, meta: { page, limit, total, pageCount: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}
