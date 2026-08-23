import { SystemRole } from "@/types/common.types";

export interface NavItem {
  label: string;
  path: string;
  /** Single-glyph icon so the sidebar doesn't need an icon-library dependency. */
  icon: string;
  roles: SystemRole[];
}

/**
 * Every authenticated role sees "Dashboard"; everything else is gated by
 * role so, e.g., only Pharmacists see the Dispensation Queue and only
 * Doctors see the EMR Desk, per the spec. `Sidebar.tsx` filters this list
 * against `useAuth().hasRole(...)` at render time.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    path: "/",
    icon: "⌂",
    roles: Object.values(SystemRole),
  },
  {
    label: "Bed Manager",
    path: "/ipd/beds",
    icon: "▦",
    roles: [
      SystemRole.SUPER_ADMIN,
      SystemRole.HOSPITAL_ADMIN,
      SystemRole.RECEPTIONIST,
      SystemRole.DOCTOR,
      SystemRole.HEAD_NURSE,
      SystemRole.STAFF_NURSE,
    ],
  },
  {
    label: "EMR Desk",
    path: "/emr",
    icon: "⚕",
    roles: [SystemRole.SUPER_ADMIN, SystemRole.DOCTOR],
  },
  {
    label: "Dispensation Queue",
    path: "/pharmacy/queue",
    icon: "Rx",
    roles: [SystemRole.SUPER_ADMIN, SystemRole.PHARMACIST],
  },
  {
    label: "Billing",
    path: "/billing",
    icon: "₹",
    roles: [SystemRole.SUPER_ADMIN, SystemRole.HOSPITAL_ADMIN, SystemRole.BILLING_EXECUTIVE],
  },
];
