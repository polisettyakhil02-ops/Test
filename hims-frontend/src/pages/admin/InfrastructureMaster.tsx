import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { useAdminWards } from "@/hooks/useAdmin";
import { WardEditModal } from "./WardEditModal";
import type { WardWithTariff } from "@/types/admin.types";
import type { BadgeTone } from "@/components/ui/Badge";

const STATUS_TONE: Record<string, BadgeTone> = {
  VACANT: "green",
  OCCUPIED: "blue",
  RESERVED: "purple",
  CLEANING: "yellow",
  MAINTENANCE: "gray",
  BLOCKED: "red",
};

function currency(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function WardCard({ entry, onManage }: { entry: WardWithTariff; onManage: () => void }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div>
          <CardTitle>{entry.ward.name}</CardTitle>
          <p className="text-xs text-slate-500">
            {entry.ward.category.replace(/_/g, " ")} · Floor {entry.ward.floor}
          </p>
        </div>
        {!entry.ward.isActive && <Badge tone="gray">Inactive</Badge>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-500">Base Rent</span>
          <span className="text-lg font-semibold text-slate-900">{currency(entry.baseRent)}/day</span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-500">Beds</span>
          <span className="text-sm text-slate-700">
            {entry.beds.length} / {entry.ward.totalBedCapacity} configured
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(entry.occupancySummary).map(([status, count]) => (
            <Badge key={status} tone={STATUS_TONE[status] ?? "gray"}>
              {status}: {count}
            </Badge>
          ))}
        </div>

        <div className="mt-auto pt-2">
          <Button variant="outline" size="sm" className="w-full" onClick={onManage}>
            Manage Ward
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Combined Ward/Infrastructure + Tariff/Billing master — see AdminLayout.tsx's nav comment for why both nav entries land here. */
export function InfrastructureMaster() {
  const wardsQuery = useAdminWards();
  const [editingWard, setEditingWard] = useState<WardWithTariff | null | undefined>(undefined);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Ward &amp; Bed Tariff Master</h1>
          <p className="text-sm text-slate-500">Infrastructure and per-category bed rent, in one place.</p>
        </div>
        <Button onClick={() => setEditingWard(null)}>+ Add Ward</Button>
      </div>

      {wardsQuery.isLoading && <FullPageSpinner />}
      {wardsQuery.isError && <ErrorState message={getApiErrorMessage(wardsQuery.error)} />}
      {wardsQuery.data && wardsQuery.data.length === 0 && (
        <EmptyState title="No wards configured" description="Add your first ward to get started." />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wardsQuery.data?.map((entry) => (
          <WardCard key={entry.ward._id} entry={entry} onManage={() => setEditingWard(entry)} />
        ))}
      </div>

      {editingWard !== undefined && <WardEditModal wardEntry={editingWard} onClose={() => setEditingWard(undefined)} />}
    </div>
  );
}
