import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRadiologyOrder, useRadiologyReport, useSaveReportDraft, useFinalizeReport } from "@/hooks/useRadiology";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { RadiologyReportStatus } from "@/types/common.types";
import type { RadiologyOrder } from "@/types/radiology.types";
import { PatientHistoryPanel } from "@/pages/emr/PatientHistoryPanel";

function patientId(order: RadiologyOrder): string {
  return typeof order.patientId === "string" ? order.patientId : order.patientId._id;
}
function patientName(order: RadiologyOrder): string {
  if (typeof order.patientId === "string") return order.patientId;
  return `${order.patientId.firstName} ${order.patientId.lastName}`;
}

/**
 * Radiology's split-screen: patient history on the left (reusing the
 * exact same `PatientHistoryPanel` the EMR Doctor Desk uses — a
 * radiologist's context needs are the same "what's this patient's
 * history" panel, not a bespoke one), the typed report on the right.
 */
export function RadiologyReportEditor() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const orderQuery = useRadiologyOrder(orderId);
  const reportQuery = useRadiologyReport(orderId);
  const saveMutation = useSaveReportDraft(orderId ?? "");
  const finalizeMutation = useFinalizeReport(reportQuery.data?._id);

  const [radiologistId, setRadiologistId] = useState("");
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [isCriticalFinding, setIsCriticalFinding] = useState(false);
  const [criticalFindingNotifiedTo, setCriticalFindingNotifiedTo] = useState("");

  useEffect(() => {
    if (reportQuery.data) {
      setRadiologistId(reportQuery.data.radiologistId);
      setFindings(reportQuery.data.findings);
      setImpression(reportQuery.data.impression);
      setIsCriticalFinding(reportQuery.data.isCriticalFinding);
      setCriticalFindingNotifiedTo(reportQuery.data.criticalFindingNotifiedTo ?? "");
    }
  }, [reportQuery.data]);

  if (!orderId) {
    return <ErrorState message="No order specified." />;
  }
  if (orderQuery.isLoading) {
    return <FullPageSpinner />;
  }
  if (orderQuery.isError || !orderQuery.data) {
    return <ErrorState message={orderQuery.error ? getApiErrorMessage(orderQuery.error) : "Order not found"} />;
  }

  const order = orderQuery.data;
  const isFinalized = reportQuery.data?.status === RadiologyReportStatus.FINALIZED;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {order.orderNumber} — {patientName(order)}
          </h1>
          <p className="text-sm text-slate-500">
            {order.modality.replace("_", " ")} · {order.bodyPart} · {order.clinicalIndication}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/radiology")}>
          ← Back to Worklist
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <PatientHistoryPanel patientId={patientId(order)} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Radiology Report</CardTitle>
              {reportQuery.data && <Badge tone={isFinalized ? "green" : "yellow"}>{reportQuery.data.status}</Badge>}
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                label="Radiologist ID"
                placeholder="Doctor ObjectId"
                value={radiologistId}
                onChange={(event) => setRadiologistId(event.target.value)}
                disabled={isFinalized}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Findings</label>
                <textarea
                  rows={8}
                  disabled={isFinalized}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                  value={findings}
                  onChange={(event) => setFindings(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Impression</label>
                <textarea
                  rows={3}
                  disabled={isFinalized}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                  value={impression}
                  onChange={(event) => setImpression(event.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={isCriticalFinding}
                  disabled={isFinalized}
                  onChange={(event) => setIsCriticalFinding(event.target.checked)}
                />
                Critical finding
              </label>
              {isCriticalFinding && (
                <Input
                  label="Notified To"
                  placeholder="Referring physician or ward"
                  value={criticalFindingNotifiedTo}
                  disabled={isFinalized}
                  onChange={(event) => setCriticalFindingNotifiedTo(event.target.value)}
                />
              )}

              {(saveMutation.isError || finalizeMutation.isError) && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {getApiErrorMessage(saveMutation.error ?? finalizeMutation.error)}
                </p>
              )}

              {!isFinalized && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!radiologistId.trim()}
                    isLoading={saveMutation.isPending}
                    onClick={() =>
                      saveMutation.mutate({ radiologistId, findings, impression, isCriticalFinding, criticalFindingNotifiedTo: criticalFindingNotifiedTo || undefined })
                    }
                  >
                    Save Draft
                  </Button>
                  <Button
                    type="button"
                    disabled={!reportQuery.data || !findings.trim() || !impression.trim()}
                    isLoading={finalizeMutation.isPending}
                    onClick={() => finalizeMutation.mutate()}
                  >
                    Finalize Report
                  </Button>
                </div>
              )}
              {isFinalized && (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  Report finalized {reportQuery.data?.finalizedAt ? new Date(reportQuery.data.finalizedAt).toLocaleString() : ""}.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
