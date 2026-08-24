import { useState } from "react";
import { Link } from "react-router-dom";
import { useRadiologyWorklist, useMarkRadiologyCompleted, useStartRadiologyExam } from "@/hooks/useRadiology";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { LabOrderPriority, RadiologyOrderStatus } from "@/types/common.types";
import type { RadiologyOrder } from "@/types/radiology.types";
import { CreateRadiologyOrderModal } from "./CreateRadiologyOrderModal";
import { ScheduleRadiologyOrderModal } from "./ScheduleRadiologyOrderModal";

function patientName(order: RadiologyOrder): string {
  if (typeof order.patientId === "string") return order.patientId;
  return `${order.patientId.firstName} ${order.patientId.lastName}`;
}
function machineLabel(order: RadiologyOrder): string | null {
  if (!order.machineAssetId || typeof order.machineAssetId === "string") return null;
  return order.machineAssetId.name;
}

const STATUS_TONE: Record<RadiologyOrderStatus, BadgeTone> = {
  ORDERED: "gray",
  SCHEDULED: "blue",
  IN_PROGRESS: "yellow",
  COMPLETED: "green",
  REPORTED: "purple",
  CANCELLED: "red",
};
const PRIORITY_TONE: Record<LabOrderPriority, BadgeTone> = {
  STAT: "red",
  URGENT: "yellow",
  ROUTINE: "gray",
};

function OrderRow({ order }: { order: RadiologyOrder }) {
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const startMutation = useStartRadiologyExam(order._id);
  const completeMutation = useMarkRadiologyCompleted(order._id);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {order.orderNumber} · {patientName(order)}
        </p>
        <p className="text-xs text-slate-500">
          {order.modality.replace("_", " ")} — {order.bodyPart}
          {machineLabel(order) ? ` · ${machineLabel(order)}` : ""}
          {order.scheduledAt ? ` · ${new Date(order.scheduledAt).toLocaleString()}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={PRIORITY_TONE[order.priority]}>{order.priority}</Badge>
        <Badge tone={STATUS_TONE[order.status]}>{order.status.replace("_", " ")}</Badge>

        {order.status === RadiologyOrderStatus.ORDERED && (
          <Button size="sm" variant="outline" onClick={() => setIsScheduleOpen(true)}>
            Schedule
          </Button>
        )}
        {order.status === RadiologyOrderStatus.SCHEDULED && (
          <>
            <Button size="sm" variant="outline" isLoading={startMutation.isPending} onClick={() => startMutation.mutate()}>
              Start
            </Button>
            <Button size="sm" isLoading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
              Mark Completed
            </Button>
          </>
        )}
        {order.status === RadiologyOrderStatus.IN_PROGRESS && (
          <Button size="sm" isLoading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            Mark Completed
          </Button>
        )}
        {(order.status === RadiologyOrderStatus.COMPLETED || order.status === RadiologyOrderStatus.REPORTED) && (
          <Link to={`/radiology/report/${order._id}`}>
            <Button size="sm" variant={order.status === RadiologyOrderStatus.REPORTED ? "outline" : "primary"}>
              {order.status === RadiologyOrderStatus.REPORTED ? "View Report" : "Write Report"}
            </Button>
          </Link>
        )}
      </div>

      {isScheduleOpen && <ScheduleRadiologyOrderModal order={order} onClose={() => setIsScheduleOpen(false)} />}
    </div>
  );
}

/** Radiology Worklist: technicians schedule and complete scans here; completed studies hand off to the split-screen report editor. */
export function RadiologyWorklist() {
  const worklistQuery = useRadiologyWorklist();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Radiology Worklist</h1>
          <p className="text-sm text-slate-500">Pending, scheduled, and completed imaging studies.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>+ New Order</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {worklistQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {worklistQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(worklistQuery.error)} />
            </div>
          )}
          {worklistQuery.data && worklistQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="Worklist is clear" description="Every ordered study has been reported." />
            </div>
          )}
          {worklistQuery.data?.map((order) => (
            <OrderRow key={order._id} order={order} />
          ))}
        </CardContent>
      </Card>

      {isCreateOpen && <CreateRadiologyOrderModal onClose={() => setIsCreateOpen(false)} />}
    </div>
  );
}
