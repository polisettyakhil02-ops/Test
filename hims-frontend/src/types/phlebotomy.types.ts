import type { SpecimenStatus, LabOrderPriority } from "./common.types";

export interface QueuePatientSummary {
  _id: string;
  uhid: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
}

export interface QueueLabOrderSummary {
  _id: string;
  orderNumber: string;
  priority: LabOrderPriority;
  orderingDoctorId?: { fullName: string } | string;
}

/** Mirrors Specimen.model.ts as returned by GET /api/phlebotomy/queue and GET /api/phlebotomy/specimens/:barcodeValue — patientId/labOrderId arrive populated on both. */
export interface Specimen {
  _id: string;
  barcodeValue: string;
  labOrderId: QueueLabOrderSummary | string;
  patientId: QueuePatientSummary | string;
  specimenType: string;
  containerType: string;
  status: SpecimenStatus;
  collectedAt?: string;
  collectedByUserId?: string;
  receivedAt?: string;
  receivedByUserId?: string;
  /** Present on the wire (Specimen.model.ts uses `{ timestamps: true }`) even though the backend's own lean-query type doesn't declare it — see phlebotomy.controller.ts's sort comment. Used here purely to show wait time. */
  createdAt: string;
}

export interface CollectSpecimenPayload {
  barcodeValue: string;
}

export interface CollectSpecimenResult {
  specimen: Specimen;
  order: { _id: string; orderNumber: string; status: string };
}
