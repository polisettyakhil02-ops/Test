import type { Types } from "mongoose";
import { withTransaction } from "../config/database.js";
import { Patient } from "../models/mpi/Patient.model.js";
import { Doctor } from "../models/opd/Doctor.model.js";
import { LabTest, type ReferenceRange } from "../models/lims/LabTest.model.js";
import { LabOrder, type LabOrderDocument, type LabOrderTestLine } from "../models/lims/LabOrder.model.js";
import { Specimen, type SpecimenDocument } from "../models/lims/Specimen.model.js";
import { LabResult, type LabResultDocument, type ResultParameter } from "../models/lims/LabResult.model.js";
import { EncounterType, LabOrderPriority, LabOrderStatus, SpecimenStatus, ResultFlag, Gender } from "../types/common.types.js";
import { generateLabOrderNumber, generateSpecimenBarcode } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/errors.js";

export interface CreateLabOrderInput {
  patientId: string;
  orderingDoctorId: string;
  encounterType: EncounterType;
  opdVisitId?: string;
  admissionId?: string;
  clinicalNoteId?: string;
  labTestIds: string[];
  priority?: LabOrderPriority;
  clinicalNotes?: string;
  performedByUserId: string;
}

export interface CreateLabOrderResult {
  order: LabOrderDocument;
  specimens: SpecimenDocument[];
}

export interface SubmitLabResultParameterInput {
  parameterName: string;
  value: string;
  numericValue?: number;
  unit?: string;
}

export interface SubmitLabResultInput {
  labOrderId: string;
  labOrderTestLineId: string;
  parameters: SubmitLabResultParameterInput[];
  interpretiveComment?: string;
  performedByUserId: string;
}

export interface SubmitLabResultResult {
  order: LabOrderDocument;
  result: LabResultDocument;
}

export interface ReceiveSpecimenInput {
  barcodeValue: string;
  performedByUserId: string;
}

export interface ReceiveSpecimenResult {
  specimen: SpecimenDocument;
  order: LabOrderDocument;
}

/** Age in whole years as of `at` (defaults to now) — used to select the correct age-banded reference range. */
function calculateAgeYears(dateOfBirth: Date, at: Date = new Date()): number {
  let age = at.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    at.getMonth() > dateOfBirth.getMonth() ||
    (at.getMonth() === dateOfBirth.getMonth() && at.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

/**
 * Picks the most specific applicable `ReferenceRange` for one parameter:
 * a sex-specific, age-banded range outranks a sex-specific range with no
 * age band, which outranks an `ALL`-sex range with an age band, which
 * outranks a plain `ALL`-sex range with no band. A range whose gender or
 * age band doesn't match the patient is excluded outright, never merely
 * deprioritized.
 */
function selectReferenceRange(
  ranges: ReferenceRange[],
  parameterName: string,
  patientGender: Gender,
  patientAgeYears: number,
): ReferenceRange | undefined {
  let best: ReferenceRange | undefined;
  let bestScore = -1;

  for (const range of ranges) {
    if (range.parameterName !== parameterName) {
      continue;
    }

    const genderMatches = !range.gender || range.gender === "ALL" || range.gender === patientGender;
    if (!genderMatches) {
      continue;
    }

    const hasAgeBand = range.ageMinYears !== undefined || range.ageMaxYears !== undefined;
    if (hasAgeBand) {
      const withinMin = range.ageMinYears === undefined || patientAgeYears >= range.ageMinYears;
      const withinMax = range.ageMaxYears === undefined || patientAgeYears <= range.ageMaxYears;
      if (!withinMin || !withinMax) {
        continue;
      }
    }

    const genderScore = range.gender && range.gender !== "ALL" ? 2 : 1;
    const ageScore = hasAgeBand ? 2 : 1;
    const score = genderScore + ageScore;
    if (score > bestScore) {
      bestScore = score;
      best = range;
    }
  }

  return best;
}

/**
 * Numeric flag derivation. Critical thresholds are checked before the
 * normal band so a value that is both "outside normal" and "beyond
 * critical" is reported at its more severe flag, never the milder one.
 * A parameter with no matching reference range, or no numeric value at
 * all (a qualitative result like "Positive"/"Reactive"), can't be
 * range-checked and defaults to NORMAL rather than guessed at.
 */
function determineFlag(range: ReferenceRange | undefined, numericValue: number | undefined): ResultFlag {
  if (!range || numericValue === undefined) {
    return ResultFlag.NORMAL;
  }
  if (range.criticalLow !== undefined && numericValue <= range.criticalLow) {
    return ResultFlag.CRITICAL_LOW;
  }
  if (range.criticalHigh !== undefined && numericValue >= range.criticalHigh) {
    return ResultFlag.CRITICAL_HIGH;
  }
  if (numericValue < range.normalLow) {
    return ResultFlag.LOW;
  }
  if (numericValue > range.normalHigh) {
    return ResultFlag.HIGH;
  }
  return ResultFlag.NORMAL;
}

/** Worst-flag-wins severity ranking used to roll per-parameter flags up into `LabResult.overallFlag`. */
const FLAG_SEVERITY: Record<ResultFlag, number> = {
  [ResultFlag.NORMAL]: 0,
  [ResultFlag.LOW]: 1,
  [ResultFlag.HIGH]: 1,
  [ResultFlag.ABNORMAL]: 2,
  [ResultFlag.CRITICAL_LOW]: 3,
  [ResultFlag.CRITICAL_HIGH]: 3,
};

/**
 * Laboratory Information Management System core engine.
 *
 * `createLabOrder` also accessions one `Specimen` per distinct
 * `specimenType` among the ordered tests — tests sharing a physical draw
 * (e.g. CBC + ESR from one EDTA tube, per `Specimen.model.ts`'s own doc
 * comment) share one barcode — rather than leaving specimen creation to a
 * separate endpoint this step doesn't build. Pre-generating the barcode
 * at order time (before physical collection) mirrors real lab systems,
 * where order entry prints the specimen labels a phlebotomist then
 * applies; the specimen starts life at its schema default,
 * `PENDING_COLLECTION`.
 */
export class LIMSService {
  async createLabOrder(input: CreateLabOrderInput): Promise<CreateLabOrderResult> {
    if (input.labTestIds.length === 0) {
      throw new ValidationError("At least one labTestId is required");
    }

    const patientId = toObjectId(input.patientId, "patientId");
    const orderingDoctorId = toObjectId(input.orderingDoctorId, "orderingDoctorId");
    const labTestObjectIds = input.labTestIds.map((id) => toObjectId(id, "labTestId"));

    return withTransaction(async (session) => {
      const [patient, doctor, labTests] = await Promise.all([
        Patient.findById(patientId).session(session).lean(),
        Doctor.findById(orderingDoctorId).session(session).lean(),
        LabTest.find({ _id: { $in: labTestObjectIds }, isActive: true }).session(session).lean(),
      ]);

      if (!patient) {
        throw new NotFoundError(`Patient ${input.patientId} not found`);
      }
      if (!doctor || !doctor.isActive) {
        throw new NotFoundError(`Doctor ${input.orderingDoctorId} not found or inactive`);
      }
      if (labTests.length !== labTestObjectIds.length) {
        throw new NotFoundError("One or more labTestIds are invalid or inactive");
      }

      const orderNumber = await generateLabOrderNumber();

      const order = firstOrThrow(
        await LabOrder.create(
          [
            {
              orderNumber,
              patientId,
              orderingDoctorId,
              encounterType: input.encounterType,
              opdVisitId: input.opdVisitId ? toObjectId(input.opdVisitId, "opdVisitId") : undefined,
              admissionId: input.admissionId ? toObjectId(input.admissionId, "admissionId") : undefined,
              clinicalNoteId: input.clinicalNoteId ? toObjectId(input.clinicalNoteId, "clinicalNoteId") : undefined,
              tests: labTests.map((test) => ({
                labTestId: test._id,
                testCode: test.testCode,
                testName: test.testName,
                status: LabOrderStatus.ORDERED,
              })),
              priority: input.priority ?? LabOrderPriority.ROUTINE,
              clinicalNotes: input.clinicalNotes,
              status: LabOrderStatus.ORDERED,
              orderedAt: new Date(),
              createdBy: input.performedByUserId,
            },
          ],
          { session },
        ),
        "LabOrder.create returned no document",
      );

      // Group the ordered tests by specimenType so tests sharing one draw
      // share one Specimen, then create a Specimen per group and link each
      // test line back to it.
      const testsBySpecimenType = new Map<string, (typeof labTests)[number][]>();
      for (const test of labTests) {
        const group = testsBySpecimenType.get(test.specimenType);
        if (group) {
          group.push(test);
        } else {
          testsBySpecimenType.set(test.specimenType, [test]);
        }
      }

      const specimens: SpecimenDocument[] = [];
      const specimenIdByTestCode = new Map<string, Types.ObjectId>();

      for (const [specimenType, tests] of testsBySpecimenType) {
        const representativeTest = tests[0];
        if (!representativeTest) {
          continue;
        }
        const barcodeValue = await generateSpecimenBarcode();
        const specimen = firstOrThrow(
          await Specimen.create(
            [
              {
                barcodeValue,
                labOrderId: order._id,
                patientId,
                specimenType,
                containerType: representativeTest.containerType,
              },
            ],
            { session },
          ),
          "Specimen.create returned no document",
        );
        specimens.push(specimen);
        for (const test of tests) {
          specimenIdByTestCode.set(test.testCode, specimen._id);
        }
      }

      for (const line of order.tests) {
        line.specimenId = specimenIdByTestCode.get(line.testCode);
      }
      await order.save({ session });

      return { order, specimens };
    });
  }

  /**
   * Step 13: the Laboratory's own intake step — the far side of
   * `PhlebotomyService.collectSpecimen`. A specimen a phlebotomist has
   * physically drawn (`COLLECTED`) doesn't count as "in the lab" until
   * someone at the bench actually receives it, so this is a distinct
   * transition, not folded into `collectSpecimen`: the two happen at
   * different desks, often minutes to hours apart, and `submitLabResult`
   * below refuses to accept a result until this step has run. Same
   * transactional shape as `collectSpecimen` — the `Specimen` and every
   * `LabOrderTestLine` sharing it advance together.
   */
  async receiveSpecimen(input: ReceiveSpecimenInput): Promise<ReceiveSpecimenResult> {
    if (!input.barcodeValue?.trim()) {
      throw new ValidationError("barcodeValue is required");
    }

    return withTransaction(async (session) => {
      const specimen = await Specimen.findOne({ barcodeValue: input.barcodeValue.trim() }).session(session);
      if (!specimen) {
        throw new NotFoundError(`No specimen found for barcode "${input.barcodeValue}"`);
      }
      if (specimen.status !== SpecimenStatus.COLLECTED) {
        throw new ConflictError(
          `Specimen ${specimen.barcodeValue} is ${specimen.status}, not COLLECTED — it must be collected before the lab can receive it`,
        );
      }

      specimen.status = SpecimenStatus.RECEIVED;
      specimen.receivedAt = new Date();
      specimen.receivedByUserId = input.performedByUserId;
      await specimen.save({ session });

      const order = await LabOrder.findById(specimen.labOrderId).session(session);
      if (!order) {
        throw new NotFoundError(`Lab order ${specimen.labOrderId.toString()} not found for specimen ${specimen.barcodeValue}`);
      }

      const lines = order.tests as unknown as Array<LabOrderTestLine & { _id: Types.ObjectId }>;
      for (const line of lines) {
        if (line.specimenId?.toString() === specimen._id.toString() && line.status === LabOrderStatus.SAMPLE_COLLECTED) {
          line.status = LabOrderStatus.IN_LAB;
        }
      }

      const inLabOrLater: LabOrderStatus[] = [
        LabOrderStatus.IN_LAB,
        LabOrderStatus.RESULT_ENTERED,
        LabOrderStatus.VERIFIED,
        LabOrderStatus.REPORTED,
      ];
      const allLinesInLabOrLater = order.tests.every((t) => inLabOrLater.includes(t.status));
      if (allLinesInLabOrLater && order.status === LabOrderStatus.SAMPLE_COLLECTED) {
        order.status = LabOrderStatus.IN_LAB;
      }
      await order.save({ session });

      return { specimen, order };
    });
  }

  /**
   * Enters a result for one test line: compares each submitted parameter
   * against the sex/age-appropriate `LabTest.referenceRanges` band and
   * derives its flag (see `determineFlag`/`selectReferenceRange` above),
   * then atomically creates the `LabResult` and updates the owning
   * `LabOrder`'s test-line status (and, once every line has a result, the
   * order's own status) in one transaction — a result can never exist
   * without its order reflecting it, or vice versa.
   */
  async submitLabResult(input: SubmitLabResultInput): Promise<SubmitLabResultResult> {
    if (input.parameters.length === 0) {
      throw new ValidationError("At least one parameter is required");
    }

    const labOrderId = toObjectId(input.labOrderId, "labOrderId");
    const labOrderTestLineId = toObjectId(input.labOrderTestLineId, "labOrderTestLineId");

    return withTransaction(async (session) => {
      const order = await LabOrder.findById(labOrderId).session(session);
      if (!order) {
        throw new NotFoundError(`Lab order ${input.labOrderId} not found`);
      }

      // `LabOrderTestLine` (the plain interface `LabOrderAttrs.tests` is
      // typed against) doesn't declare `_id`, even though the schema gives
      // every test-line subdocument one at runtime — so this reaches for it
      // through a narrow cast rather than `DocumentArray.id()`, which TS
      // doesn't see as available on the plain-array-typed `order.tests`.
      // `.find()` still returns a reference into the real Mongoose
      // subdocument, so mutating it below is tracked by `order.save()` the
      // same as any other subdocument mutation in this codebase.
      const lines = order.tests as unknown as Array<LabOrderTestLine & { _id: Types.ObjectId }>;
      const line = lines.find((t) => t._id.toString() === labOrderTestLineId.toString());
      if (!line) {
        throw new NotFoundError(`Test line ${input.labOrderTestLineId} not found on order ${order.orderNumber}`);
      }
      if (line.resultId) {
        throw new ConflictError(
          `A result has already been submitted for ${line.testName} on order ${order.orderNumber}`,
        );
      }
      if (!line.specimenId) {
        throw new ConflictError(`No specimen is linked to ${line.testName} on order ${order.orderNumber}`);
      }

      const [labTest, patient, specimen] = await Promise.all([
        LabTest.findById(line.labTestId).session(session).lean(),
        Patient.findById(order.patientId).session(session).lean(),
        Specimen.findById(line.specimenId).session(session).lean(),
      ]);
      // Step 13: the barcode-scan gate — a result can never be entered for
      // a specimen phlebotomy hasn't collected and the lab hasn't received,
      // closing the loop this step's request describes ("...before it
      // reaches the Laboratory module").
      if (!specimen || specimen.status !== SpecimenStatus.RECEIVED) {
        throw new ConflictError(
          `Specimen for ${line.testName} has not been received in the lab yet (current status: ${specimen?.status ?? "unknown"}) — it must be collected and received before a result can be entered`,
        );
      }
      if (!labTest) {
        throw new NotFoundError(`Lab test ${line.labTestId.toString()} no longer exists`);
      }
      if (!patient) {
        throw new NotFoundError(`Patient ${order.patientId.toString()} not found`);
      }

      const patientAgeYears = calculateAgeYears(patient.dateOfBirth);

      const parameters: ResultParameter[] = input.parameters.map((p) => {
        const range = selectReferenceRange(labTest.referenceRanges, p.parameterName, patient.gender, patientAgeYears);
        const flag = determineFlag(range, p.numericValue);
        return {
          parameterName: p.parameterName,
          value: p.value,
          numericValue: p.numericValue,
          unit: p.unit ?? range?.unit,
          referenceRangeText: range ? `${range.normalLow} - ${range.normalHigh} ${range.unit}` : "Not established",
          flag,
        };
      });

      const overallFlag = parameters.reduce<ResultFlag>(
        (worst, p) => (FLAG_SEVERITY[p.flag] > FLAG_SEVERITY[worst] ? p.flag : worst),
        ResultFlag.NORMAL,
      );

      const result = firstOrThrow(
        await LabResult.create(
          [
            {
              labOrderId: order._id,
              labOrderTestLineId: line._id,
              patientId: order.patientId,
              specimenId: line.specimenId,
              labTestId: line.labTestId,
              parameters,
              overallFlag,
              interpretiveComment: input.interpretiveComment,
              performedByUserId: input.performedByUserId,
              performedAt: new Date(),
              isCriticalValueNotified: false,
              isAmended: false,
            },
          ],
          { session },
        ),
        "LabResult.create returned no document",
      );

      line.status = LabOrderStatus.RESULT_ENTERED;
      line.resultId = result._id;

      const completionStatuses: LabOrderStatus[] = [
        LabOrderStatus.RESULT_ENTERED,
        LabOrderStatus.VERIFIED,
        LabOrderStatus.REPORTED,
      ];
      const allLinesResulted = order.tests.every((t) => completionStatuses.includes(t.status));
      if (allLinesResulted) {
        order.status = LabOrderStatus.RESULT_ENTERED;
      }
      await order.save({ session });

      return { order, result };
    });
  }
}

export const limsService = new LIMSService();
