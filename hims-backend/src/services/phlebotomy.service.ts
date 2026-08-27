import type { Types } from "mongoose";
import { withTransaction } from "../config/database.js";
import { Specimen, type SpecimenDocument } from "../models/lims/Specimen.model.js";
import { LabOrder, type LabOrderDocument, type LabOrderTestLine } from "../models/lims/LabOrder.model.js";
import { SpecimenStatus, LabOrderStatus } from "../types/common.types.js";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors.js";

export interface CollectSpecimenInput {
  barcodeValue: string;
  performedByUserId: string;
}

export interface CollectSpecimenResult {
  specimen: SpecimenDocument;
  order: LabOrderDocument;
}

/**
 * Phlebotomy & Queue Management. No new schema: `LIMSService.createLabOrder`
 * (Step 8) already generates a barcoded `Specimen` — `PENDING_COLLECTION`
 * by default — the instant a doctor orders a lab test, and `SpecimenStatus`
 * / `LabOrderStatus` already carry every state this module needs
 * (`PENDING_COLLECTION` → `COLLECTED` here; `COLLECTED` → `RECEIVED` is
 * the Lab's own intake step, `LIMSService.receiveSpecimen`). A parallel
 * `SampleCollection` collection would just be `Specimen` under a different
 * name with nothing new to track — the same call Step 9 made not to build
 * a second OT schedule. `collectSpecimen` is this module's one real
 * mutation; queue/label reads live directly in the controller, mirroring
 * how `lims.controller.ts#listLabOrders` already queries `LabOrder`
 * directly rather than through a service passthrough.
 */
export class PhlebotomyService {
  /**
   * The literal ask: "the phlebotomist must scan/enter this barcode to
   * mark the sample as Collected". Transactional because every
   * `LabOrderTestLine` sharing this one physical draw (e.g. CBC + ESR
   * from the same EDTA tube) has to advance in the same atomic step as
   * the `Specimen` itself, and the owning `LabOrder`'s own status
   * advances too once every one of its lines has cleared collection.
   */
  async collectSpecimen(input: CollectSpecimenInput): Promise<CollectSpecimenResult> {
    if (!input.barcodeValue?.trim()) {
      throw new ValidationError("barcodeValue is required");
    }

    return withTransaction(async (session) => {
      const specimen = await Specimen.findOne({ barcodeValue: input.barcodeValue.trim() }).session(session);
      if (!specimen) {
        throw new NotFoundError(`No specimen found for barcode "${input.barcodeValue}" — check the label and try again`);
      }
      if (specimen.status !== SpecimenStatus.PENDING_COLLECTION) {
        throw new ConflictError(`Specimen ${specimen.barcodeValue} is already ${specimen.status} — it cannot be collected again`);
      }

      specimen.status = SpecimenStatus.COLLECTED;
      specimen.collectedAt = new Date();
      specimen.collectedByUserId = input.performedByUserId;
      await specimen.save({ session });

      const order = await LabOrder.findById(specimen.labOrderId).session(session);
      if (!order) {
        throw new NotFoundError(`Lab order ${specimen.labOrderId.toString()} not found for specimen ${specimen.barcodeValue}`);
      }

      const lines = order.tests as unknown as Array<LabOrderTestLine & { _id: Types.ObjectId }>;
      for (const line of lines) {
        if (line.specimenId?.toString() === specimen._id.toString() && line.status === LabOrderStatus.ORDERED) {
          line.status = LabOrderStatus.SAMPLE_COLLECTED;
        }
      }

      const collectedOrLater: LabOrderStatus[] = [
        LabOrderStatus.SAMPLE_COLLECTED,
        LabOrderStatus.IN_LAB,
        LabOrderStatus.RESULT_ENTERED,
        LabOrderStatus.VERIFIED,
        LabOrderStatus.REPORTED,
      ];
      const allLinesCollectedOrLater = order.tests.every((t) => collectedOrLater.includes(t.status));
      if (allLinesCollectedOrLater && order.status === LabOrderStatus.ORDERED) {
        order.status = LabOrderStatus.SAMPLE_COLLECTED;
      }
      await order.save({ session });

      return { specimen, order };
    });
  }
}

export const phlebotomyService = new PhlebotomyService();
