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
