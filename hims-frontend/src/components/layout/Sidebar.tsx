import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { NAV_ITEMS } from "./nav.config";
import { cn } from "@/lib/cn";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { hasRole } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => hasRole(...item.roles));

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-slate-200 bg-white transition-[width] duration-150",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-100 px-3">
        {!collapsed && <span className="truncate text-sm font-bold text-brand-700">HIMS</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <span className="w-5 shrink-0 text-center text-sm" aria-hidden="true">
              {item.icon}
            </span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
