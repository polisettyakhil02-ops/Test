import { redis } from "../config/redis.js";

/**
 * Shared human-readable document-number generator, e.g. "INV-2026-000042".
 * Backed by a Redis `INCR` per (counterName, year) so concurrent requests
 * across multiple API instances never collide, without a round trip to
 * Mongo or a dedicated counter collection. Mirrors the pattern already
 * used by `generateUHID()` in models/mpi/Patient.model.ts.
 */
export async function generateSequenceNumber(
  prefix: string,
  counterName: string,
  padLength = 6,
): Promise<string> {
  const year = new Date().getFullYear();
  const key = `seq:${counterName}:${year}`;
  const sequence = await redis.incr(key);
  return `${prefix}-${year}-${sequence.toString().padStart(padLength, "0")}`;
}

export const generateInvoiceNumber = (): Promise<string> => generateSequenceNumber("INV", "invoice");
export const generateDispensationNumber = (): Promise<string> => generateSequenceNumber("DISP", "dispensation");
export const generateAdmissionNumber = (): Promise<string> => generateSequenceNumber("IPD", "admission");
export const generateVisitNumber = (): Promise<string> => generateSequenceNumber("OPD", "opdVisit");
export const generatePrescriptionNumber = (): Promise<string> => generateSequenceNumber("RX", "prescription");
export const generateReceiptNumber = (): Promise<string> => generateSequenceNumber("RCPT", "payment");
export const generateEmployeeCode = (): Promise<string> => generateSequenceNumber("EMP", "staff", 5);
export const generateLabOrderNumber = (): Promise<string> => generateSequenceNumber("LAB", "labOrder");
export const generateSpecimenBarcode = (): Promise<string> => generateSequenceNumber("SPEC", "specimen");
export const generateSurgeryNumber = (): Promise<string> => generateSequenceNumber("OT", "surgery");
export const generateSterilizationCycleNumber = (): Promise<string> => generateSequenceNumber("STZ", "sterilization");
export const generateAssetCode = (): Promise<string> => generateSequenceNumber("BME", "asset", 5);
export const generateMaintenanceTicketNumber = (): Promise<string> => generateSequenceNumber("MT", "maintenanceTicket");
export const generatePayoutStatementNumber = (): Promise<string> => generateSequenceNumber("PAY", "payoutStatement");
export const generatePreAuthNumber = (): Promise<string> => generateSequenceNumber("PA", "preAuth");
