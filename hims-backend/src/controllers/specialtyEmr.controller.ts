import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ivfService, obstetricService, dmoHandoverService } from "../services/specialtyEmr.service.js";
import {
  IvfProtocolType,
  IvfCycleStatus,
  FertilizationMethod,
  EmbryoStage,
  ObstetricRecordStatus,
  DeliveryMode,
  FetalPresentation,
  LiquorColor,
  Gender,
  DialysisShift,
  DmoCriticalityLevel,
  DmoHandoverStatus,
} from "../types/common.types.js";
import { AuthenticationError, ValidationError } from "../utils/errors.js";
import { formatZodError } from "../utils/validation.js";
import { toObjectId } from "../utils/objectId.js";

function requireUser(req: Request): string {
  if (!req.user) throw new AuthenticationError("Must be authenticated");
  return req.user.id;
}

/* ============================================================================
 * IVF EMR
 * ==========================================================================*/

const CreateIvfCycleSchema = z.object({
  patientId: z.string().min(1),
  partnerPatientId: z.string().optional(),
  fertilitySpecialistId: z.string().min(1),
  protocolType: z.nativeEnum(IvfProtocolType),
  stimulationStartDate: z.string().min(1),
  stimulationRegimen: z.string().min(1).max(2000),
});

export async function createIvfCycle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = CreateIvfCycleSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.createCycle({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

export async function listIvfCycles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as IvfCycleStatus) : undefined;
    const cycles = await ivfService.listCycles({ patientId, status });
    res.status(200).json({ data: cycles });
  } catch (err) {
    next(err);
  }
}

export async function getIvfCycle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const cycle = await ivfService.getCycle(cycleId);
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

const MonitoringVisitSchema = z.object({
  visitDate: z.string().min(1),
  cycleDay: z.number().int().min(1),
  leftOvaryFollicleCount: z.number().int().min(0).optional(),
  rightOvaryFollicleCount: z.number().int().min(0).optional(),
  leadFollicleSizeMm: z.number().min(0).optional(),
  endometrialThicknessMm: z.number().min(0).optional(),
  estradiolPgMl: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

export async function addIvfMonitoringVisit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = MonitoringVisitSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.addMonitoringVisit(
      cycleId,
      { ...parsed.data, visitDate: new Date(parsed.data.visitDate) },
      performedByUserId,
    );
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

const TriggerSchema = z.object({ triggerShotDate: z.string().min(1), triggerDrugName: z.string().min(1) });

export async function recordIvfTrigger(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = TriggerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.recordTrigger(cycleId, parsed.data.triggerShotDate, parsed.data.triggerDrugName);
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

const EggRetrievalSchema = z.object({
  eggRetrievalDate: z.string().min(1),
  oocytesRetrievedCount: z.number().int().min(0),
  matureOocytesCount: z.number().int().min(0),
  fertilizationMethod: z.nativeEnum(FertilizationMethod),
});

export async function recordEggRetrieval(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = EggRetrievalSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.recordEggRetrieval({ cycleId, ...parsed.data });
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

const FertilizationOutcomeSchema = z.object({
  embryosFormedCount: z.number().int().min(0),
  embryosFrozenCount: z.number().int().min(0),
});

export async function recordFertilizationOutcome(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = FertilizationOutcomeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.recordFertilizationOutcome({ cycleId, ...parsed.data });
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

const EmbryoTransferSchema = z.object({
  transferDate: z.string().min(1),
  embryosTransferredCount: z.number().int().min(1).max(5),
  embryoStage: z.nativeEnum(EmbryoStage),
  isFrozenTransfer: z.boolean(),
  catheterUsed: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export async function addEmbryoTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = EmbryoTransferSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.addEmbryoTransfer(cycleId, { ...parsed.data, transferDate: new Date(parsed.data.transferDate) });
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

const LutealSupportSchema = z.object({ lutealSupportNotes: z.string().min(1).max(1000) });

export async function recordLutealSupport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = LutealSupportSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.recordLutealSupport(cycleId, parsed.data.lutealSupportNotes);
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

const BetaHcgSchema = z.object({
  betaHcgTestDate: z.string().min(1),
  betaHcgResultMIUmL: z.number().min(0),
  isPregnant: z.boolean(),
});

export async function recordBetaHcgResult(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = BetaHcgSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.recordBetaHcgResult({ cycleId, ...parsed.data });
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

export async function cancelIvfCycle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { cycleId } = req.params;
    if (!cycleId) throw new ValidationError("cycleId route parameter is required");
    const parsed = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const cycle = await ivfService.cancelCycle(cycleId, parsed.data.reason);
    res.status(200).json({ data: cycle });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * Obstetric EMR
 * ==========================================================================*/

const CreateObstetricRecordSchema = z.object({
  patientId: z.string().min(1),
  obstetricianId: z.string().min(1),
  lmpDate: z.string().min(1),
  eddDate: z.string().optional(),
  gravida: z.number().int().min(1),
  para: z.number().int().min(0),
  abortions: z.number().int().min(0).optional(),
  livingChildren: z.number().int().min(0).optional(),
});

export async function createObstetricRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = CreateObstetricRecordSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const record = await obstetricService.createRecord({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function listObstetricRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as ObstetricRecordStatus) : undefined;
    const records = await obstetricService.listRecords({ patientId, status });
    res.status(200).json({ data: records });
  } catch (err) {
    next(err);
  }
}

export async function getObstetricRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { recordId } = req.params;
    if (!recordId) throw new ValidationError("recordId route parameter is required");
    const record = await obstetricService.getRecordForClient(recordId);
    res.status(200).json({ data: record });
  } catch (err) {
    next(err);
  }
}

const AncVisitSchema = z.object({
  visitDate: z.string().min(1),
  gestationWeeks: z.number().min(4).max(44),
  weightKg: z.number().min(0).max(300),
  bloodPressureSystolic: z.number().min(0).max(300),
  bloodPressureDiastolic: z.number().min(0).max(200),
  fundalHeightCm: z.number().min(0).optional(),
  fetalHeartRatePerMin: z.number().min(0).max(250).optional(),
  fetalPresentation: z.nativeEnum(FetalPresentation).optional(),
  urineAlbumin: z.enum(["NIL", "TRACE", "1+", "2+", "3+"]).optional(),
  pedalEdema: z.boolean(),
  notes: z.string().max(1000).optional(),
});

export async function addAncVisit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { recordId } = req.params;
    if (!recordId) throw new ValidationError("recordId route parameter is required");
    const parsed = AncVisitSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const record = await obstetricService.addAncVisit(recordId, { ...parsed.data, visitDate: new Date(parsed.data.visitDate) }, performedByUserId);
    res.status(200).json({ data: record });
  } catch (err) {
    next(err);
  }
}

const PartographReadingSchema = z.object({
  recordedAt: z.string().min(1),
  cervicalDilationCm: z.number().min(0).max(10),
  fetalHeartRatePerMin: z.number().min(0).max(250),
  contractionsPer10Min: z.number().min(0).max(10),
  descentOfHeadStation: z.number().min(-3).max(3),
  liquorColor: z.nativeEnum(LiquorColor),
  moulding: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  maternalPulsePerMin: z.number().min(0).max(250),
  maternalSystolicBP: z.number().min(0).max(300),
  maternalDiastolicBP: z.number().min(0).max(200),
  maternalTemperatureCelsius: z.number().min(30).max(45).optional(),
  oxytocinUnitsPerMin: z.number().min(0).optional(),
});

export async function addPartographReading(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { recordId } = req.params;
    if (!recordId) throw new ValidationError("recordId route parameter is required");
    const parsed = PartographReadingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const record = await obstetricService.addPartographReading(
      recordId,
      { ...parsed.data, recordedAt: new Date(parsed.data.recordedAt) },
      performedByUserId,
    );
    res.status(200).json({ data: record });
  } catch (err) {
    next(err);
  }
}

const DeliveryDetailsSchema = z.object({
  deliveryDate: z.string().min(1),
  deliveryMode: z.nativeEnum(DeliveryMode),
  babyWeightGrams: z.number().min(0),
  apgarScore1Min: z.number().min(0).max(10),
  apgarScore5Min: z.number().min(0).max(10),
  babySex: z.nativeEnum(Gender),
  isLiveBirth: z.boolean(),
  complications: z.string().max(1000).optional(),
  conductedByDoctorId: z.string().min(1),
});

export async function recordDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { recordId } = req.params;
    if (!recordId) throw new ValidationError("recordId route parameter is required");
    const parsed = DeliveryDetailsSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const { conductedByDoctorId, ...rest } = parsed.data;
    const record = await obstetricService.recordDelivery(recordId, {
      ...rest,
      deliveryDate: new Date(rest.deliveryDate),
      conductedByDoctorId: toObjectId(conductedByDoctorId, "conductedByDoctorId"),
    });
    res.status(200).json({ data: record });
  } catch (err) {
    next(err);
  }
}

export async function dischargePostnatal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    requireUser(req);
    const { recordId } = req.params;
    if (!recordId) throw new ValidationError("recordId route parameter is required");
    const record = await obstetricService.dischargePostnatal(recordId);
    res.status(200).json({ data: record });
  } catch (err) {
    next(err);
  }
}

/* ============================================================================
 * DMO Handover
 * ==========================================================================*/

const CreateDmoNoteSchema = z.object({
  patientId: z.string().min(1),
  admissionId: z.string().optional(),
  dutyDoctorId: z.string().min(1),
  shift: z.nativeEnum(DialysisShift),
  shiftDate: z.string().min(1),
  criticalityLevel: z.nativeEnum(DmoCriticalityLevel),
  situation: z.string().min(1),
  background: z.string().min(1),
  assessment: z.string().min(1),
  recommendation: z.string().min(1),
  actionItems: z.array(z.string().min(1)).optional(),
});

export async function createDmoHandoverNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const parsed = CreateDmoNoteSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(formatZodError(parsed.error));
    const note = await dmoHandoverService.createNote({ ...parsed.data, performedByUserId });
    res.status(201).json({ data: note });
  } catch (err) {
    next(err);
  }
}

export async function listDmoHandoverNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as DmoHandoverStatus) : undefined;
    const notes = await dmoHandoverService.listNotes({ patientId, status });
    res.status(200).json({ data: notes });
  } catch (err) {
    next(err);
  }
}

export async function acknowledgeDmoHandoverNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const performedByUserId = requireUser(req);
    const { noteId } = req.params;
    if (!noteId) throw new ValidationError("noteId route parameter is required");
    const note = await dmoHandoverService.acknowledgeNote(noteId, performedByUserId);
    res.status(200).json({ data: note });
  } catch (err) {
    next(err);
  }
}
