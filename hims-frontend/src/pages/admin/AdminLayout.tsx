import { NavLink, Outlet, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SystemRole } from "@/types/common.types";
import { cn } from "@/lib/cn";

interface AdminNavItem {
  label: string;
  path: string;
  description: string;
}

/**
 * Ward/Infrastructure and Tariff/Billing both point at the same page
 * (InfrastructureMaster) — the backend's "Ward & Bed Tariff Master"
 * (admin.controller.ts) deliberately combines the two concerns (bed
 * rent pricing is a property you set *on* a ward, via TariffMaster's
 * per-category price list, not a separate master). Two nav entries into
 * one page beats a second page with no distinct backend behind it.
 */
const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Staff Directory", path: "/admin/staff", description: "Doctors, nurses, and all other staff accounts" },
  { label: "Roles & Permissions", path: "/admin/roles", description: "Edit each role's resource-level permission matrix" },
  { label: "Patient Directory", path: "/admin/patients", description: "Global patient search, edits, and duplicate merges" },
  { label: "Ward / Infrastructure Master", path: "/admin/wards", description: "Wards, bed counts, maintenance status" },
  { label: "Tariff / Billing Master", path: "/admin/wards", description: "Bed rent pricing by ward category" },
  { label: "Security & Audit Logs", path: "/admin/audit-logs", description: "Immutable system-wide activity trail" },
];

/**
 * Distinct shell for the Master Admin Control Center — deliberately
 * styled apart from the clinical DashboardLayout (dark sidebar vs. the
 * app's white one) so SUPER_ADMIN/HOSPITAL_ADMIN users always have a
 * clear visual signal they're in "God mode", operating on raw system
 * records rather than a single clinical workflow.
 */
export function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900 text-slate-200">
        <div className="flex h-14 items-center border-b border-slate-800 px-4">
          <span className="text-sm font-bold tracking-wide text-white">HIMS ADMIN CONSOLE</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ADMIN_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2.5 text-sm transition-colors",
                  isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                )
              }
            >
              <span className="block font-medium">{item.label}</span>
              <span className="block text-xs text-slate-400">{item.description}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <Link
            to="/"
            className="block rounded-md px-3 py-2 text-center text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            ← Exit to main dashboard
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <span className="text-sm font-semibold text-slate-900">Master Admin Control Center</span>
          <span className="text-xs text-slate-500">
            {user?.fullName ?? user?.username} ·{" "}
            {user?.roles.includes(SystemRole.SUPER_ADMIN) ? "Super Admin" : "Hospital Admin"}
          </span>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
