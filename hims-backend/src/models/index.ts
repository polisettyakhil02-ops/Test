/** Central barrel export so services/controllers can `import { Patient, Bed, Invoice } from "@models/index.js"`. */

export * from "./mpi/Patient.model.js";

export * from "./opd/Doctor.model.js";
export * from "./opd/DoctorSchedule.model.js";
export * from "./opd/OPDQueue.model.js";
export * from "./opd/OPDVisit.model.js";

export * from "./ipd/Ward.model.js";
export * from "./ipd/Bed.model.js";
export * from "./ipd/Admission.model.js";
export * from "./ipd/DischargeSummary.model.js";

export * from "./emr/ClinicalNote.model.js";
export * from "./emr/Diagnosis.model.js";
export * from "./emr/DrugAllergy.model.js";
export * from "./emr/Prescription.model.js";

export * from "./nursing/VitalsLog.model.js";
export * from "./nursing/MedicationAdministration.model.js";
export * from "./nursing/ShiftHandover.model.js";

export * from "./pharmacy/Drug.model.js";
export * from "./pharmacy/DrugBatch.model.js";
export * from "./pharmacy/Supplier.model.js";
export * from "./pharmacy/PurchaseOrder.model.js";
export * from "./pharmacy/StockTransaction.model.js";
export * from "./pharmacy/Dispensation.model.js";

export * from "./lims/LabTest.model.js";
export * from "./lims/LabOrder.model.js";
export * from "./lims/Specimen.model.js";
export * from "./lims/LabResult.model.js";

export * from "./ot/OTSchedule.model.js";
export * from "./ot/SterilizationLog.model.js";

export * from "./billing/TariffMaster.model.js";
export * from "./billing/Invoice.model.js";
export * from "./billing/Payment.model.js";
export * from "./billing/InsurancePolicy.model.js";
export * from "./billing/PreAuthorization.model.js";

export * from "./assets/Asset.model.js";
export * from "./assets/MaintenanceTicket.model.js";

export * from "./payroll/RevenueShareRule.model.js";
export * from "./payroll/PayoutStatement.model.js";

export * from "./admin/Department.model.js";
export * from "./admin/Role.model.js";
export * from "./admin/User.model.js";
export * from "./admin/StaffProfile.model.js";

export * from "./audit/AuditLog.model.js";
export * from "./audit/RefreshToken.model.js";
