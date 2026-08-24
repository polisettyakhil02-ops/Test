import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardHome } from "@/pages/DashboardHome";
import { BedManager } from "@/pages/ipd/BedManager";
import { DoctorDesk } from "@/pages/emr/DoctorDesk";
import { DispensationQueue } from "@/pages/pharmacy/DispensationQueue";
import { InvoiceView } from "@/pages/billing/InvoiceView";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { StaffDirectory } from "@/pages/admin/StaffDirectory";
import { RoleManagement } from "@/pages/admin/RoleManagement";
import { PatientDirectory } from "@/pages/admin/PatientDirectory";
import { InfrastructureMaster } from "@/pages/admin/InfrastructureMaster";
import { AuditInspector } from "@/pages/admin/AuditInspector";
import { ERTriageBoard } from "@/pages/emergency/ERTriageBoard";
import { BloodBankInventory } from "@/pages/bloodbank/BloodBankInventory";
import { DialysisScheduler } from "@/pages/dialysis/DialysisScheduler";
import { PhlebotomyCollectionStation } from "@/pages/phlebotomy/PhlebotomyCollectionStation";
import { PhlebotomyQueueBoard } from "@/pages/phlebotomy/PhlebotomyQueueBoard";
import { RadiologyWorklist } from "@/pages/radiology/RadiologyWorklist";
import { RadiologyReportEditor } from "@/pages/radiology/RadiologyReportEditor";
import { IvfEmrPanel } from "@/pages/specialty_emr/IvfEmrPanel";
import { ObstetricEmrPanel } from "@/pages/specialty_emr/ObstetricEmrPanel";
import { DmoHandoverBoard } from "@/pages/specialty_emr/DmoHandoverBoard";
import { MrdFileTracker } from "@/pages/mrd/MrdFileTracker";
import { IcdCodingQueue } from "@/pages/mrd/IcdCodingQueue";
import { ProcurementDashboard } from "@/pages/scm/ProcurementDashboard";
import { AccountsPayable } from "@/pages/finance/AccountsPayable";
import { ComplaintsBoard } from "@/pages/complaints/ComplaintsBoard";
import { SystemRole } from "@/types/common.types";

const IPD_ROLES = [
  SystemRole.SUPER_ADMIN,
  SystemRole.HOSPITAL_ADMIN,
  SystemRole.RECEPTIONIST,
  SystemRole.DOCTOR,
  SystemRole.HEAD_NURSE,
  SystemRole.STAFF_NURSE,
];
const EMR_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.DOCTOR];
const PHARMACY_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.PHARMACIST];
const BILLING_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.BILLING_EXECUTIVE];
const ADMIN_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN];
const EMERGENCY_ROLES = [
  SystemRole.SUPER_ADMIN,
  SystemRole.HOSPITAL_ADMIN,
  SystemRole.ER_NURSE,
  SystemRole.DOCTOR,
  SystemRole.HEAD_NURSE,
  SystemRole.RECEPTIONIST,
];
const BLOODBANK_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.BLOOD_BANK_TECHNICIAN, SystemRole.DOCTOR];
const DIALYSIS_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.DIALYSIS_TECHNICIAN, SystemRole.DOCTOR];
const PHLEBOTOMY_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.PHLEBOTOMIST, SystemRole.LAB_TECHNICIAN];
const RADIOLOGY_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.RADIOLOGY_TECHNICIAN, SystemRole.DOCTOR];
const SPECIALTY_EMR_ROLES = [
  SystemRole.SUPER_ADMIN,
  SystemRole.HOSPITAL_ADMIN,
  SystemRole.DOCTOR,
  SystemRole.HEAD_NURSE,
  SystemRole.STAFF_NURSE,
];
const MRD_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.MRD_EXECUTIVE];
const SCM_ROLES = [
  SystemRole.SUPER_ADMIN,
  SystemRole.HOSPITAL_ADMIN,
  SystemRole.PROCUREMENT_OFFICER,
  SystemRole.HEAD_NURSE,
  SystemRole.STAFF_NURSE,
  SystemRole.PHARMACIST,
];
const FINANCE_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.ACCOUNTS_EXECUTIVE];
const COMPLAINTS_ROLES = [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.FACILITY_MANAGER, SystemRole.MAINTENANCE_STAFF];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />

          <Route element={<ProtectedRoute roles={IPD_ROLES} />}>
            <Route path="ipd/beds" element={<BedManager />} />
          </Route>

          <Route element={<ProtectedRoute roles={EMR_ROLES} />}>
            <Route path="emr" element={<DoctorDesk />} />
            <Route path="emr/:uhid" element={<DoctorDesk />} />
          </Route>

          <Route element={<ProtectedRoute roles={PHARMACY_ROLES} />}>
            <Route path="pharmacy/queue" element={<DispensationQueue />} />
          </Route>

          <Route element={<ProtectedRoute roles={BILLING_ROLES} />}>
            <Route path="billing" element={<InvoiceView />} />
            <Route path="billing/:uhid" element={<InvoiceView />} />
          </Route>

          <Route element={<ProtectedRoute roles={EMERGENCY_ROLES} />}>
            <Route path="emergency" element={<ERTriageBoard />} />
          </Route>

          <Route element={<ProtectedRoute roles={BLOODBANK_ROLES} />}>
            <Route path="bloodbank" element={<BloodBankInventory />} />
          </Route>

          <Route element={<ProtectedRoute roles={DIALYSIS_ROLES} />}>
            <Route path="dialysis" element={<DialysisScheduler />} />
          </Route>

          <Route element={<ProtectedRoute roles={PHLEBOTOMY_ROLES} />}>
            <Route path="phlebotomy" element={<PhlebotomyCollectionStation />} />
          </Route>

          <Route element={<ProtectedRoute roles={RADIOLOGY_ROLES} />}>
            <Route path="radiology" element={<RadiologyWorklist />} />
            <Route path="radiology/report/:orderId" element={<RadiologyReportEditor />} />
          </Route>

          <Route element={<ProtectedRoute roles={SPECIALTY_EMR_ROLES} />}>
            <Route path="specialty-emr/ivf" element={<IvfEmrPanel />} />
            <Route path="specialty-emr/obstetric" element={<ObstetricEmrPanel />} />
            <Route path="specialty-emr/dmo" element={<DmoHandoverBoard />} />
          </Route>

          <Route element={<ProtectedRoute roles={MRD_ROLES} />}>
            <Route path="mrd" element={<MrdFileTracker />} />
            <Route path="mrd/coding" element={<IcdCodingQueue />} />
          </Route>

          <Route element={<ProtectedRoute roles={SCM_ROLES} />}>
            <Route path="scm" element={<ProcurementDashboard />} />
          </Route>

          <Route element={<ProtectedRoute roles={FINANCE_ROLES} />}>
            <Route path="finance" element={<AccountsPayable />} />
          </Route>

          <Route element={<ProtectedRoute roles={COMPLAINTS_ROLES} />}>
            <Route path="complaints" element={<ComplaintsBoard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>

      {/* Master Admin Control Center — deliberately outside DashboardLayout; AdminLayout renders its own full-screen shell. */}
      <Route element={<ProtectedRoute roles={ADMIN_ROLES} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/staff" replace />} />
          <Route path="staff" element={<StaffDirectory />} />
          <Route path="roles" element={<RoleManagement />} />
          <Route path="patients" element={<PatientDirectory />} />
          <Route path="wards" element={<InfrastructureMaster />} />
          <Route path="audit-logs" element={<AuditInspector />} />
          <Route path="*" element={<Navigate to="/admin/staff" replace />} />
        </Route>
      </Route>

      {/* TV-style waiting-room board — deliberately outside DashboardLayout, same reasoning as AdminLayout: it renders its own full-screen shell with no sidebar chrome, since it's meant for an unattended kiosk display. */}
      <Route element={<ProtectedRoute roles={PHLEBOTOMY_ROLES} />}>
        <Route path="/phlebotomy/board" element={<PhlebotomyQueueBoard />} />
      </Route>
    </Routes>
  );
}
