import { withTransaction } from "../config/database.js";
import { Prescription, type PrescriptionDocument } from "../models/emr/Prescription.model.js";
import { Drug } from "../models/pharmacy/Drug.model.js";
import { DrugBatch } from "../models/pharmacy/DrugBatch.model.js";
import { StockTransaction } from "../models/pharmacy/StockTransaction.model.js";
import { Dispensation, type DispensedLine, type DispensationDocument } from "../models/pharmacy/Dispensation.model.js";
import { Invoice, type InvoiceDocument, type InvoiceLineItem } from "../models/billing/Invoice.model.js";
import { TariffMaster } from "../models/billing/TariffMaster.model.js";
import { PrescriptionStatus, StockTransactionType, InvoiceStatus } from "../types/common.types.js";
import { generateInvoiceNumber, generateDispensationNumber } from "../utils/sequenceGenerator.js";
import { toObjectId } from "../utils/objectId.js";
import { round2 } from "../utils/money.js";
import { firstOrThrow } from "../utils/assert.js";
import { ValidationError, NotFoundError, ConflictError, InsufficientStockError } from "../utils/errors.js";

export interface DispenseMedicationInput {
  prescriptionId: string;
  prescriptionItemId: string;
  quantityToDispense: number;
  dispensedByUserId: string;
  /** Target a specific DRAFT invoice; omit to auto-attach to the patient's current DRAFT invoice (creating one if none exists). */
  invoiceId?: string;
}

export interface DispenseMedicationResult {
  dispensation: DispensationDocument;
  invoice: InvoiceDocument;
  prescription: PrescriptionDocument;
}

/**
 * Pharmacy Stock Dispensation Engine. `dispenseMedication` is the single
 * entry point for turning a prescribed line item into: decremented batch
 * stock, an immutable stock-ledger row, a billed invoice line, an updated
 * prescription/item status, and a dispensation receipt — all four
 * outcomes committed atomically. A failure at any step (insufficient
 * stock, a non-DRAFT target invoice, a concurrently-modified batch, a
 * missing tariff) aborts the whole operation: nothing is decremented,
 * nothing is billed, and the prescription is left exactly as it was.
 */
export class PharmacyService {
  async dispenseMedication(input: DispenseMedicationInput): Promise<DispenseMedicationResult> {
    if (!Number.isFinite(input.quantityToDispense) || input.quantityToDispense <= 0) {
      throw new ValidationError("quantityToDispense must be a positive number");
    }

    const prescriptionId = toObjectId(input.prescriptionId, "prescriptionId");
    const targetInvoiceId = input.invoiceId ? toObjectId(input.invoiceId, "invoiceId") : undefined;

    return withTransaction(async (session) => {
      // 1. Load & validate the prescription + line item ----------------------
      const prescription = await Prescription.findById(prescriptionId).session(session);
      if (!prescription) {
        throw new NotFoundError(`Prescription ${input.prescriptionId} not found`);
      }

      const item = prescription.items.find((candidate) => candidate._id.equals(input.prescriptionItemId));
      if (!item) {
        throw new NotFoundError(
          `Prescription item ${input.prescriptionItemId} not found on prescription ${input.prescriptionId}`,
        );
      }
      if (item.itemStatus === PrescriptionStatus.CANCELLED) {
        throw new ConflictError("Cannot dispense a cancelled prescription item");
      }

      const remainingQuantity = item.computedTotalQuantity - item.quantityDispensed;
      if (input.quantityToDispense > remainingQuantity) {
        throw new ConflictError(
          `Requested quantity (${input.quantityToDispense}) exceeds remaining prescribed quantity (${remainingQuantity})`,
        );
      }

      // 2. Resolve the drug and its active billing tariff ---------------------
      const drug = await Drug.findById(item.drugId).session(session);
      if (!drug || !drug.isActive) {
        throw new NotFoundError(`Drug ${item.drugId.toString()} not found or inactive`);
      }

      const tariff = await TariffMaster.findOne({
        serviceCode: drug.drugCode,
        serviceCategory: "PHARMACY",
        isActive: true,
      }).session(session);
      if (!tariff) {
        throw new ConflictError(`No active PHARMACY tariff configured for drug ${drug.drugCode}; cannot bill dispensation`);
      }

      // 3. FEFO-allocate the requested quantity across eligible batches -------
      const eligibleBatches = await DrugBatch.find({
        drugId: item.drugId,
        isQuarantined: false,
        expiryDate: { $gt: new Date() },
        quantityOnHand: { $gt: 0 },
      })
        .sort({ expiryDate: 1 })
        .session(session);

      const totalAvailable = eligibleBatches.reduce((sum, batch) => sum + batch.quantityOnHand, 0);
      if (totalAvailable < input.quantityToDispense) {
        throw new InsufficientStockError(
          `Insufficient stock for ${drug.genericName}: requested ${input.quantityToDispense}, available ${totalAvailable}`,
        );
      }

      const dispensedLines: DispensedLine[] = [];
      let remainingToAllocate = input.quantityToDispense;

      for (const batch of eligibleBatches) {
        if (remainingToAllocate <= 0) break;

        const takeQuantity = Math.min(batch.quantityOnHand, remainingToAllocate);

        // Conditional decrement (defense in depth alongside the transaction's
        // own snapshot isolation): fails loudly instead of silently
        // overselling if the batch's stock moved out from under us.
        const updatedBatch = await DrugBatch.findOneAndUpdate(
          { _id: batch._id, quantityOnHand: { $gte: takeQuantity } },
          { $inc: { quantityOnHand: -takeQuantity } },
          { new: true, session },
        );
        if (!updatedBatch) {
          throw new ConflictError(`Batch ${batch.batchNumber} stock changed concurrently; retry the dispensation`);
        }

        const stockTransaction = firstOrThrow(
          await StockTransaction.create(
            [
              {
                drugId: item.drugId,
                batchId: batch._id,
                type: StockTransactionType.DISPENSATION,
                quantityDelta: -takeQuantity,
                quantityOnHandAfter: updatedBatch.quantityOnHand,
                referenceType: "PRESCRIPTION",
                referenceId: prescription._id,
                performedByUserId: input.dispensedByUserId,
                performedAt: new Date(),
              },
            ],
            { session },
          ),
          "StockTransaction.create returned no document",
        );

        dispensedLines.push({
          prescriptionItemId: item._id,
          drugId: item.drugId,
          batchId: batch._id,
          quantityDispensed: takeQuantity,
          unitPriceCharged: tariff.basePrice,
          stockTransactionId: stockTransaction._id,
        });

        remainingToAllocate -= takeQuantity;
      }

      if (remainingToAllocate > 0) {
        // Unreachable given the totalAvailable pre-check above; guards
        // against a future refactor silently breaking that invariant.
        throw new InsufficientStockError(`Unable to fully allocate stock for ${drug.genericName}`);
      }

      // 4. Update the prescription item + overall prescription status ---------
      item.quantityDispensed += input.quantityToDispense;
      item.itemStatus =
        item.quantityDispensed >= item.computedTotalQuantity
          ? PrescriptionStatus.DISPENSED
          : PrescriptionStatus.PARTIALLY_DISPENSED;

      const allItemsResolved = prescription.items.every(
        (i) => i.itemStatus === PrescriptionStatus.DISPENSED || i.itemStatus === PrescriptionStatus.CANCELLED,
      );
      const anyItemTouched = prescription.items.some(
        (i) => i.itemStatus === PrescriptionStatus.DISPENSED || i.itemStatus === PrescriptionStatus.PARTIALLY_DISPENSED,
      );
      prescription.status = allItemsResolved
        ? PrescriptionStatus.DISPENSED
        : anyItemTouched
          ? PrescriptionStatus.PARTIALLY_DISPENSED
          : prescription.status;

      await prescription.save({ session });

      // 5. Post the charge to the patient's active invoice ---------------------
      const chargeAmount = round2(input.quantityToDispense * tariff.basePrice);
      const taxAmount = tariff.isTaxInclusive ? 0 : round2((chargeAmount * tariff.taxRatePercent) / 100);
      const lineTotal = round2(chargeAmount + taxAmount);

      const invoiceLineItem: InvoiceLineItem = {
        tariffServiceId: tariff._id,
        serviceCode: tariff.serviceCode,
        description: `${drug.genericName}${drug.brandName ? ` (${drug.brandName})` : ""} x ${input.quantityToDispense}`,
        serviceCategory: "PHARMACY",
        quantity: input.quantityToDispense,
        unitPrice: tariff.basePrice,
        discountPercent: 0,
        discountAmount: 0,
        taxRatePercent: tariff.taxRatePercent,
        taxAmount,
        lineTotal,
        sourceType: "PHARMACY",
        sourceId: prescription._id,
        postedAt: new Date(),
        postedByUserId: input.dispensedByUserId,
      };

      let invoice: InvoiceDocument | null;
      if (targetInvoiceId) {
        invoice = await Invoice.findById(targetInvoiceId).session(session);
        if (!invoice) {
          throw new NotFoundError(`Invoice ${input.invoiceId} not found`);
        }
        if (invoice.status !== InvoiceStatus.DRAFT) {
          throw new ConflictError(`Invoice ${invoice.invoiceNumber} is not in DRAFT state and cannot accept new charges`);
        }
      } else {
        invoice = await Invoice.findOne({ patientId: prescription.patientId, status: InvoiceStatus.DRAFT })
          .sort({ createdAt: -1 })
          .session(session);
      }

      if (invoice) {
        invoice.lineItems.push(invoiceLineItem);
        invoice.subTotal = round2(invoice.subTotal + chargeAmount);
        invoice.totalTax = round2(invoice.totalTax + taxAmount);
        invoice.grandTotal = round2(invoice.grandTotal + lineTotal);
        invoice.amountDue = round2(invoice.amountDue + lineTotal);
        await invoice.save({ session });
      } else {
        // generateInvoiceNumber/generateDispensationNumber draw from a Redis
        // counter outside Mongo's transaction: if session.withTransaction
        // retries this callback after a transient error, an already-drawn
        // number is discarded rather than reused, leaving a harmless gap
        // rather than a collision.
        const invoiceNumber = await generateInvoiceNumber();
        invoice = firstOrThrow(
          await Invoice.create(
            [
              {
                invoiceNumber,
                patientId: prescription.patientId,
                lineItems: [invoiceLineItem],
                subTotal: chargeAmount,
                totalDiscount: 0,
                totalTax: taxAmount,
                grandTotal: lineTotal,
                amountPaid: 0,
                amountDue: lineTotal,
                status: InvoiceStatus.DRAFT,
                createdBy: input.dispensedByUserId,
              },
            ],
            { session },
          ),
          "Invoice.create returned no document",
        );
      }

      // 6. Record the dispensation receipt itself ------------------------------
      const dispensationNumber = await generateDispensationNumber();
      const dispensation = firstOrThrow(
        await Dispensation.create(
          [
            {
              dispensationNumber,
              prescriptionId: prescription._id,
              patientId: prescription.patientId,
              lines: dispensedLines,
              totalAmount: lineTotal,
              invoiceId: invoice._id,
              dispensedByUserId: input.dispensedByUserId,
              dispensedAt: new Date(),
            },
          ],
          { session },
        ),
        "Dispensation.create returned no document",
      );

      return { dispensation, invoice, prescription };
    });
  }
}

export const pharmacyService = new PharmacyService();
