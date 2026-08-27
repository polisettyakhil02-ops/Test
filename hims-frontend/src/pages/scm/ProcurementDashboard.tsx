import { useState } from "react";
import { cn } from "@/lib/cn";
import { IndentsPanel } from "./IndentsPanel";
import { LowStockPurchaseOrders } from "./LowStockPurchaseOrders";
import { GrnProcessingPanel } from "./GrnProcessingPanel";

const TABS = [
  { key: "indents", label: "Ward Indents" },
  { key: "purchasing", label: "Low Stock & Purchase Orders" },
  { key: "grn", label: "GRN Processing" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Procurement Dashboard: ward indents, low-stock-driven PO generation, and GRN receiving — the full demand-to-stock pipeline. */
export function ProcurementDashboard() {
  const [tab, setTab] = useState<TabKey>("indents");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Procurement Dashboard</h1>
        <p className="text-sm text-slate-500">From ward request to purchase order to posted stock.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "indents" && <IndentsPanel />}
      {tab === "purchasing" && <LowStockPurchaseOrders />}
      {tab === "grn" && <GrnProcessingPanel />}
    </div>
  );
}
