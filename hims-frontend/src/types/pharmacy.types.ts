export interface DispenseMedicationPayload {
  prescriptionId: string;
  patientId: string;
  itemId: string;
  quantity: number;
  invoiceId?: string;
}

export interface DispensedLine {
  drugId: string;
  batchId: string;
  quantityDispensed: number;
  unitPriceCharged: number;
}

export interface Dispensation {
  _id: string;
  dispensationNumber: string;
  prescriptionId: string;
  patientId: string;
  lines: DispensedLine[];
  totalAmount: number;
  invoiceId: string;
  dispensedAt: string;
}

export interface DispenseMedicationResult {
  dispensation: Dispensation;
  invoice: { _id: string; invoiceNumber: string; grandTotal: number; amountDue: number };
  prescription: { _id: string; status: string };
}
