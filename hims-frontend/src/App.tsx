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
import { PatientDirectory } from "@/pages/admin/PatientDirectory";
import { InfrastructureMaster } from "@/pages/admin/InfrastructureMaster";
import { AuditInspector } from "@/pages/admin/AuditInspector";
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>

      {/* Master Admin Control Center — deliberately outside DashboardLayout; AdminLayout renders its own full-screen shell. */}
      <Route element={<ProtectedRoute roles={ADMIN_ROLES} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/staff" replace />} />
          <Route path="staff" element={<StaffDirectory />} />
          <Route path="patients" element={<PatientDirectory />} />
          <Route path="wards" element={<InfrastructureMaster />} />
          <Route path="audit-logs" element={<AuditInspector />} />
          <Route path="*" element={<Navigate to="/admin/staff" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
