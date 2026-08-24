import { User } from "../models/admin/User.model.js";
import { Patient } from "../models/mpi/Patient.model.js";
import { Doctor, type DoctorDocument } from "../models/opd/Doctor.model.js";
import { OPDVisit } from "../models/opd/OPDVisit.model.js";
import { Admission } from "../models/ipd/Admission.model.js";
import { authService, type RequestContext } from "./auth.service.js";
import { opdService } from "./opd.service.js";
import { AdmissionStatus } from "../types/common.types.js";
import { signMobileAccessToken } from "../utils/jwt.js";
import { env } from "../config/env.js";
import { toObjectId } from "../utils/objectId.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";

/**
 * Backs the mobile REST gateway (`/api/mobile/*`): a Patient App and a
 * Doctor App, each getting only the lightweight, role-scoped slice of data
 * their screen actually needs — never the full web-shaped DTOs the SPA's
 * hooks consume.
 */

export interface MobileLoginInput extends RequestContext {
  username: string;
  password: string;
  deviceId: string;
}

export interface MobileLoginResult {
  accessToken: string;
  expiresInSeconds: number;
  profile: { id: string; username: string; fullName?: string; roles: string[] };
}

/**
 * Reuses `AuthService.login` in full (bcrypt check, lockout counter, audit
 * trail — the security-critical parts a mobile login must not skip) and
 * then mints a *separate*, strictly mobile-scoped token from its result
 * rather than handing back the web session token pair it also issues; the
 * web refresh token `login()` creates as a side effect is simply never
 * returned to the mobile client, so it sits unused and expires like any
 * other dormant token — the mobile app carries only its own credential.
 */
export async function mobileLogin(input: MobileLoginInput): Promise<MobileLoginResult> {
  const { profile } = await authService.login({
    username: input.username,
    password: input.password,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  const accessToken = signMobileAccessToken({
    sub: profile.id,
    username: profile.username,
    roles: profile.roles,
    deviceId: input.deviceId,
  });

  return {
    accessToken,
    expiresInSeconds: env.JWT_MOBILE_ACCESS_TTL_SECONDS,
    profile: { id: profile.id, username: profile.username, fullName: profile.fullName, roles: profile.roles },
  };
}

async function requireLinkedPatient(userId: string) {
  const user = await User.findById(toObjectId(userId, "userId")).select("patientId").lean();
  if (!user?.patientId) {
    throw new ForbiddenError("This account is not linked to a patient record");
  }
  const patient = await Patient.findById(user.patientId).lean();
  if (!patient) throw new NotFoundError("Linked patient record not found");
  return patient;
}

async function requireLinkedDoctor(userId: string): Promise<DoctorDocument> {
  const doctor = await Doctor.findOne({ userId: toObjectId(userId, "userId") });
  if (!doctor) throw new ForbiddenError("This account is not linked to a doctor profile");
  return doctor;
}

export interface MobileAppointmentSummary {
  visitId: string;
  visitNumber: string;
  doctorName: string;
  visitDate: string;
  status: string;
  chiefComplaint: string;
}

/** GET /api/mobile/patient/appointments — the patient's own upcoming/past visits, trimmed to what a booking-list screen actually renders. `status` comes from the linked `OPDQueue` token (OPDVisit itself has no status field — `closedAt` is its only lifecycle marker) since that's the live WAITING/CALLED/IN_CONSULTATION/COMPLETED state a patient actually wants to see. */
export async function listMyAppointments(userId: string): Promise<MobileAppointmentSummary[]> {
  const patient = await requireLinkedPatient(userId);
  const visits = await OPDVisit.find({ patientId: patient._id })
    .sort({ visitDate: -1 })
    .limit(50)
    .select("visitNumber visitDate chiefComplaint doctorId queueTokenId")
    .populate("doctorId", "fullName")
    .populate("queueTokenId", "status")
    .lean();

  return visits.map((visit) => ({
    visitId: visit._id.toString(),
    visitNumber: visit.visitNumber,
    doctorName: (visit.doctorId as unknown as { fullName?: string })?.fullName ?? "",
    visitDate: visit.visitDate.toISOString(),
    status: (visit.queueTokenId as unknown as { status?: string })?.status ?? "UNKNOWN",
    chiefComplaint: visit.chiefComplaint,
  }));
}

export interface BookMobileAppointmentInput {
  doctorId: string;
  visitDate?: string;
  chiefComplaint: string;
  isFollowUp?: boolean;
}

/** POST /api/mobile/patient/appointments — books strictly for the authenticated patient's own linked record, never a caller-supplied patientId. */
export async function bookMyAppointment(userId: string, input: BookMobileAppointmentInput): Promise<MobileAppointmentSummary> {
  const patient = await requireLinkedPatient(userId);
  const result = await opdService.bookAppointment({
    patientId: patient._id.toString(),
    doctorId: input.doctorId,
    visitDate: input.visitDate,
    isFollowUp: input.isFollowUp,
    chiefComplaint: input.chiefComplaint,
    performedByUserId: userId,
  });

  const doctor = await Doctor.findById(result.visit.doctorId).select("fullName").lean();
  return {
    visitId: result.visit._id.toString(),
    visitNumber: result.visit.visitNumber,
    doctorName: doctor?.fullName ?? "",
    visitDate: result.visit.visitDate.toISOString(),
    status: result.queueToken.status,
    chiefComplaint: result.visit.chiefComplaint,
  };
}

export interface MobileIpdRoundEntry {
  admissionId: string;
  admissionNumber: string;
  patientName: string;
  uhid: string;
  wardName: string;
  bedNumber: string;
  admissionDate: string;
  provisionalDiagnosis: string;
}

/** GET /api/mobile/doctor/ipd-rounds — the doctor's own currently-admitted patients, the lightweight list their phone actually needs on rounds (no full admission/EMR payload). */
export async function listMyIpdRounds(userId: string): Promise<MobileIpdRoundEntry[]> {
  const doctor = await requireLinkedDoctor(userId);
  const admissions = await Admission.find({
    attendingDoctorId: doctor._id,
    status: { $in: [AdmissionStatus.ADMITTED, AdmissionStatus.TRANSFERRED, AdmissionStatus.DISCHARGE_PENDING] },
  })
    .sort({ admissionDate: -1 })
    .select("admissionNumber patientId currentWardId currentBedId admissionDate provisionalDiagnosis")
    .populate("patientId", "uhid firstName lastName")
    .populate("currentWardId", "name")
    .populate("currentBedId", "bedNumber")
    .lean();

  return admissions.map((admission) => {
    const patient = admission.patientId as unknown as { uhid: string; firstName: string; lastName: string };
    const ward = admission.currentWardId as unknown as { name: string };
    const bed = admission.currentBedId as unknown as { bedNumber: string };
    return {
      admissionId: admission._id.toString(),
      admissionNumber: admission.admissionNumber,
      patientName: `${patient.firstName} ${patient.lastName}`,
      uhid: patient.uhid,
      wardName: ward.name,
      bedNumber: bed.bedNumber,
      admissionDate: admission.admissionDate.toISOString(),
      provisionalDiagnosis: admission.provisionalDiagnosis,
    };
  });
}
