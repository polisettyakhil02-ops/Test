import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Ward } from "../models/ipd/Ward.model.js";
import { Bed } from "../models/ipd/Bed.model.js";
import { adtService } from "../services/adt.service.js";
import { WardCategory, AdmissionType } from "../types/common.types.js";
import { AuthenticationError, ValidationError, NotFoundError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";

const AdmitPatientSchema = z.object({
  patientId: z.string().min(1),
  bedId: z.string().min(1),
  // Cross-checked against the target bed's actual category below rather
  // than used to look up the ward — the bed's own `wardId` is what
  // ADTService.admitPatient trusts, since a client-supplied ward could
  // otherwise be spoofed to disagree with the bed it's admitting into.
  wardType: z.nativeEnum(WardCategory).optional(),
  admittingDoctorId: z.string().min(1),
  attendingDoctorId: z.string().min(1),
  admissionType: z.nativeEnum(AdmissionType),
  provisionalDiagnosis: z.string().min(1).max(1000),
  guardianConsentObtained: z.boolean().optional().default(false),
  referredFromOPDVisitId: z.string().optional(),
});

/**
 * POST /api/ipd/admit — admits a patient onto a bed via
 * `ADTService.admitPatient` (atomic bed claim + Admission creation).
 * Receptionist/Admin only, per route-level RBAC.
 */
export async function admitPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError("Must be authenticated");
    }

    const parsed = AdmitPatientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(formatZodError(parsed.error));
    }
    const input = parsed.data;

    if (input.wardType) {
      const bed = await Bed.findById(input.bedId).select("category bedNumber").lean();
      if (!bed) {
        throw new NotFoundError(`Bed ${input.bedId} not found`);
      }
      if (bed.category !== input.wardType) {
        throw new ValidationError(
          `wardType mismatch: bed ${bed.bedNumber} is in a ${bed.category} ward, not ${input.wardType}`,
        );
      }
    }

    const result = await adtService.admitPatient({
      patientId: input.patientId,
      bedId: input.bedId,
      admittingDoctorId: input.admittingDoctorId,
      attendingDoctorId: input.attendingDoctorId,
      admissionType: input.admissionType,
      provisionalDiagnosis: input.provisionalDiagnosis,
      guardianConsentObtained: input.guardianConsentObtained,
      referredFromOPDVisitId: input.referredFromOPDVisitId,
      performedByUserId: req.user.id,
    });

    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ipd/wards — a visual bed-management map: every active ward
 * with its beds, each bed's live occupancy status, and a per-ward status
 * tally, for the drag-and-drop / color-coded bed grid on the frontend.
 */
export async function getWardsMap(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [wards, beds] = await Promise.all([
      Ward.find({ isActive: true }).sort({ floor: 1, name: 1 }).lean(),
      Bed.find().lean(),
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

    const wardsMap = wards.map((ward) => {
      const wardBeds = bedsByWard.get(ward._id.toString()) ?? [];
      const occupancySummary = wardBeds.reduce<Record<string, number>>((acc, bed) => {
        acc[bed.status] = (acc[bed.status] ?? 0) + 1;
        return acc;
      }, {});

      return {
        ward: {
          id: ward._id,
          name: ward.name,
          code: ward.code,
          category: ward.category,
          floor: ward.floor,
          totalBedCapacity: ward.totalBedCapacity,
        },
        occupancySummary,
        beds: wardBeds.map((bed) => ({
          id: bed._id,
          bedNumber: bed.bedNumber,
          category: bed.category,
          status: bed.status,
          currentAdmissionId: bed.currentAdmissionId,
          hasOxygenSupply: bed.hasOxygenSupply,
          hasVentilator: bed.hasVentilator,
          hasCardiacMonitor: bed.hasCardiacMonitor,
        })),
      };
    });

    res.status(200).json({ data: wardsMap });
  } catch (err) {
    next(err);
  }
}
