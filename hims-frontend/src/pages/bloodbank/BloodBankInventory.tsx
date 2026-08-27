import { useState } from "react";
import { useInventory, useDonors, useCrossMatchRequests } from "@/hooks/useBloodBank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/cn";
import { BloodGroup, CrossMatchStatus } from "@/types/common.types";
import type { CrossMatchRequest } from "@/types/bloodbank.types";
import { RegisterDonorModal } from "./RegisterDonorModal";
import { LogDonationModal } from "./LogDonationModal";
import { RaiseCrossMatchModal } from "./RaiseCrossMatchModal";
import { CrossMatchDetailModal } from "./CrossMatchDetailModal";
import type { BloodDonor } from "@/types/bloodbank.types";

type Tab = "inventory" | "donors" | "requests";

function patientLabel(request: CrossMatchRequest): string {
  if (typeof request.patientId === "string") return request.patientId;
  return `${request.patientId.firstName} ${request.patientId.lastName}`;
}

const REQUEST_STATUS_TONE: Record<CrossMatchStatus, BadgeTone> = {
  PENDING: "yellow",
  COMPATIBLE: "blue",
  INCOMPATIBLE: "red",
  FULFILLED: "green",
  CANCELLED: "gray",
};

function InventoryTab() {
  const inventoryQuery = useInventory();

  if (inventoryQuery.isLoading) return <FullPageSpinner />;
  if (inventoryQuery.isError) return <ErrorState message={getApiErrorMessage(inventoryQuery.error)} />;

  const rows = inventoryQuery.data ?? [];
  const summary = new Map<string, number>();
  for (const row of rows) {
    if (!row.isDispensable) continue;
    const key = `${row.bag.bloodGroup}__${row.bag.componentType}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {Object.values(BloodGroup)
          .filter((bg) => bg !== BloodGroup.UNKNOWN)
          .map((bg) => {
            const units = rows.filter((r) => r.bag.bloodGroup === bg && r.isDispensable).length;
            return (
              <Card key={bg}>
                <CardContent className="py-3 text-center">
                  <p className="text-lg font-bold text-slate-900">{bg}</p>
                  <p className="text-xs text-slate-500">{units} unit(s)</p>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Units</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No units in inventory" description="Log a donation to add stock." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Bag #</th>
                    <th className="px-3 py-2">Group</th>
                    <th className="px-3 py-2">Component</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ bag, isExpired, isDispensable }) => (
                    <tr key={bag._id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{bag.bagNumber}</td>
                      <td className="px-3 py-2 font-semibold">{bag.bloodGroup}</td>
                      <td className="px-3 py-2">{bag.componentType.replace("_", " ")}</td>
                      <td className={cn("px-3 py-2", isExpired && "text-red-600")}>
                        {new Date(bag.expiryDate).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={isDispensable ? "green" : isExpired ? "red" : "gray"}>
                          {isExpired && bag.status !== "EXPIRED" ? "EXPIRED" : bag.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DonorsTab({ onLogDonation }: { onLogDonation: (donor: BloodDonor) => void }) {
  const donorsQuery = useDonors();

  if (donorsQuery.isLoading) return <FullPageSpinner />;
  if (donorsQuery.isError) return <ErrorState message={getApiErrorMessage(donorsQuery.error)} />;

  return (
    <Card>
      <CardContent className="p-0">
        {donorsQuery.data && donorsQuery.data.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No donors registered" description="Register a donor to start a camp roster." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Donor</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Donations</th>
                  <th className="px-3 py-2">Last Donation</th>
                  <th className="px-3 py-2">Eligible</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {donorsQuery.data?.map((donor) => (
                  <tr key={donor._id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{donor.fullName}</p>
                      <p className="font-mono text-xs text-slate-500">{donor.donorCode}</p>
                    </td>
                    <td className="px-3 py-2 font-semibold">{donor.bloodGroup}</td>
                    <td className="px-3 py-2">{donor.totalDonations}</td>
                    <td className="px-3 py-2">
                      {donor.lastDonationDate ? new Date(donor.lastDonationDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={donor.isEligible ? "green" : "red"}>{donor.isEligible ? "Eligible" : "Ineligible"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => onLogDonation(donor)}>
                        Log Donation
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RequestsTab({ onSelect }: { onSelect: (request: CrossMatchRequest) => void }) {
  const requestsQuery = useCrossMatchRequests();

  if (requestsQuery.isLoading) return <FullPageSpinner />;
  if (requestsQuery.isError) return <ErrorState message={getApiErrorMessage(requestsQuery.error)} />;

  return (
    <Card>
      <CardContent className="p-0">
        {requestsQuery.data && requestsQuery.data.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No cross-match requests" description="Raise a request when a ward needs compatibility-tested blood." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requestsQuery.data?.map((request) => (
              <button
                key={request._id}
                type="button"
                onClick={() => onSelect(request)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {request.requestNumber} · {patientLabel(request)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {request.unitsRequired}× {request.componentType.replace("_", " ")} ({request.bloodGroupRequired})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {request.urgent && <Badge tone="red">Urgent</Badge>}
                  <Badge tone={REQUEST_STATUS_TONE[request.status]}>{request.status}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Blood Bank Inventory & Donor console: live stock by blood group, the donor camp roster, and ward cross-match/dispense requests. */
export function BloodBankInventory() {
  const [tab, setTab] = useState<Tab>("inventory");
  const [isRegisterDonorOpen, setIsRegisterDonorOpen] = useState(false);
  const [isRaiseRequestOpen, setIsRaiseRequestOpen] = useState(false);
  const [donationTarget, setDonationTarget] = useState<BloodDonor | null>(null);
  const [requestTarget, setRequestTarget] = useState<CrossMatchRequest | null>(null);

  const TABS: { key: Tab; label: string }[] = [
    { key: "inventory", label: "Inventory" },
    { key: "donors", label: "Donors" },
    { key: "requests", label: "Ward Requests" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Blood Bank</h1>
          <p className="text-sm text-slate-500">Inventory, donor camps, and ward cross-match requests.</p>
        </div>
        <div className="flex gap-2">
          {tab === "donors" && <Button onClick={() => setIsRegisterDonorOpen(true)}>+ Register Donor</Button>}
          {tab === "requests" && (
            <Button variant="danger" onClick={() => setIsRaiseRequestOpen(true)}>
              + Raise Request
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "inventory" && <InventoryTab />}
      {tab === "donors" && <DonorsTab onLogDonation={setDonationTarget} />}
      {tab === "requests" && <RequestsTab onSelect={setRequestTarget} />}

      {isRegisterDonorOpen && <RegisterDonorModal onClose={() => setIsRegisterDonorOpen(false)} />}
      {isRaiseRequestOpen && <RaiseCrossMatchModal onClose={() => setIsRaiseRequestOpen(false)} />}
      {donationTarget && <LogDonationModal donor={donationTarget} onClose={() => setDonationTarget(null)} />}
      {requestTarget && <CrossMatchDetailModal request={requestTarget} onClose={() => setRequestTarget(null)} />}
    </div>
  );
}
