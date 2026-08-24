import { useState } from "react";
import { useMrdArchives, useCheckOutFile, useCheckInFile, useLogFileRequest, useResolveFileRequest } from "@/hooks/useMrd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { MrdArchiveStatus, MrdFileRequestType, MrdFileRequestStatus } from "@/types/common.types";
import type { MedicalRecordArchive } from "@/types/mrd.types";
import { CreateArchiveModal } from "./CreateArchiveModal";

function patientLabel(archive: MedicalRecordArchive): string {
  if (typeof archive.patientId === "string") return archive.patientId;
  return `${archive.patientId.firstName} ${archive.patientId.lastName} (${archive.patientId.uhid})`;
}

const STATUS_TONE: Record<MrdArchiveStatus, BadgeTone> = { ARCHIVED: "green", CHECKED_OUT: "yellow" };

/** MRD's physical-file custody desk: scan a barcode to check a file in or out, and drill into any file's movement history and legal/insurance requests. */
export function MrdFileTracker() {
  const archivesQuery = useMrdArchives();
  const checkOutMutation = useCheckOutFile();
  const checkInMutation = useCheckInFile();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<MedicalRecordArchive | null>(null);

  const [barcode, setBarcode] = useState("");
  const [reason, setReason] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  function handleScan(action: "checkout" | "checkin") {
    setScanError(null);
    setScanSuccess(null);
    if (!barcode.trim()) return;
    if (action === "checkout") {
      if (!reason.trim()) {
        setScanError("A reason is required to check a file out.");
        return;
      }
      checkOutMutation.mutate(
        { fileBarcodeId: barcode.trim(), reason: reason.trim() },
        {
          onSuccess: (archive) => {
            setBarcode("");
            setReason("");
            setScanSuccess(`${archive.fileBarcodeId} checked out.`);
          },
          onError: (err) => setScanError(getApiErrorMessage(err)),
        },
      );
    } else {
      checkInMutation.mutate(
        { fileBarcodeId: barcode.trim() },
        {
          onSuccess: (archive) => {
            setBarcode("");
            setScanSuccess(`${archive.fileBarcodeId} checked back in.`);
          },
          onError: (err) => setScanError(getApiErrorMessage(err)),
        },
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">MRD File Tracker</h1>
          <p className="text-sm text-slate-500">Scan a physical file's barcode to check it in or out of the archive room.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>+ Archive a File</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan Barcode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              autoFocus
              label="Barcode"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              placeholder="e.g. MRDFILE-000512"
              className="w-56 font-mono"
            />
            <Input label="Reason (for check-out)" value={reason} onChange={(event) => setReason(event.target.value)} className="flex-1" />
            <Button type="button" variant="outline" isLoading={checkOutMutation.isPending} onClick={() => handleScan("checkout")}>
              Check Out
            </Button>
            <Button type="button" isLoading={checkInMutation.isPending} onClick={() => handleScan("checkin")}>
              Check In
            </Button>
          </div>
          {scanError && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{scanError}</p>}
          {scanSuccess && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{scanSuccess}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Archived Files</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {archivesQuery.isLoading && (
            <div className="p-6">
              <FullPageSpinner />
            </div>
          )}
          {archivesQuery.isError && (
            <div className="p-4">
              <ErrorState message={getApiErrorMessage(archivesQuery.error)} />
            </div>
          )}
          {archivesQuery.data && archivesQuery.data.length === 0 && (
            <div className="p-4">
              <EmptyState title="No files archived yet" description="Archive a discharged patient's file to start tracking it." />
            </div>
          )}
          {archivesQuery.data && archivesQuery.data.length > 0 && (
            <div className="divide-y divide-slate-100">
              {archivesQuery.data.map((archive) => (
                <button
                  key={archive._id}
                  type="button"
                  onClick={() => setDetailTarget(archive)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {archive.archiveNumber} · {patientLabel(archive)}
                    </p>
                    <p className="font-mono text-xs text-slate-500">
                      {archive.fileBarcodeId} · {archive.physicalLocation}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {archive.fileRequests.some((r) => r.status === MrdFileRequestStatus.PENDING) && <Badge tone="purple">Request Pending</Badge>}
                    <Badge tone={STATUS_TONE[archive.status]}>{archive.status.replace("_", " ")}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isCreateOpen && <CreateArchiveModal onClose={() => setIsCreateOpen(false)} />}
      {detailTarget && <ArchiveDetailModal archive={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}

function ArchiveDetailModal({ archive, onClose }: { archive: MedicalRecordArchive; onClose: () => void }) {
  const logRequestMutation = useLogFileRequest(archive._id);
  const resolveRequestMutation = useResolveFileRequest(archive._id);
  const [requestType, setRequestType] = useState<MrdFileRequestType>(MrdFileRequestType.LEGAL);
  const [requestedByName, setRequestedByName] = useState("");
  const [purpose, setPurpose] = useState("");

  return (
    <Modal isOpen onClose={onClose} title={`${archive.archiveNumber} — ${archive.fileBarcodeId}`} widthClassName="max-w-2xl">
      <div className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{patientLabel(archive)}</p>
          <p className="text-slate-600">{archive.physicalLocation}</p>
          <div className="mt-2">
            <Badge tone={STATUS_TONE[archive.status]}>{archive.status.replace("_", " ")}</Badge>
          </div>
        </div>

        {archive.currentMovement && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-900">Currently checked out</p>
            <p className="text-xs text-amber-800">
              {archive.currentMovement.checkedOutReason} — since {new Date(archive.currentMovement.checkedOutAt).toLocaleString()}
            </p>
          </div>
        )}

        {archive.movementHistory.length > 0 && (
          <div className="rounded-md border border-slate-200 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Movement History</p>
            {archive.movementHistory.map((m, i) => (
              <p key={i} className="text-xs text-slate-600">
                {new Date(m.checkedOutAt).toLocaleDateString()} → {m.checkedInAt ? new Date(m.checkedInAt).toLocaleDateString() : "—"} ({m.checkedOutReason})
              </p>
            ))}
          </div>
        )}

        <div className="rounded-md border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">File Requests ({archive.fileRequests.length})</p>
          <div className="space-y-2">
            {archive.fileRequests.map((request) => (
              <div key={request._id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs">
                <div>
                  <p className="font-medium text-slate-800">
                    {request.requestType} — {request.requestedByName}
                  </p>
                  <p className="text-slate-500">{request.purpose}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={request.status === "PENDING" ? "yellow" : request.status === "FULFILLED" ? "green" : "red"}>{request.status}</Badge>
                  {request.status === MrdFileRequestStatus.PENDING && (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        isLoading={resolveRequestMutation.isPending}
                        onClick={() => resolveRequestMutation.mutate({ requestId: request._id, status: "FULFILLED" })}
                      >
                        Fulfill
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        isLoading={resolveRequestMutation.isPending}
                        onClick={() => resolveRequestMutation.mutate({ requestId: request._id, status: "DENIED", denialReason: "Denied by MRD" })}
                      >
                        Deny
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Select
              label="Request Type"
              options={Object.values(MrdFileRequestType).map((v) => ({ value: v, label: v.replace("_", " ") }))}
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as MrdFileRequestType)}
            />
            <Input label="Requested By" value={requestedByName} onChange={(e) => setRequestedByName(e.target.value)} placeholder="Law firm / TPA / patient" />
          </div>
          <Input label="Purpose" className="mt-2" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          {logRequestMutation.isError && <p className="mt-1 text-xs text-red-600">{getApiErrorMessage(logRequestMutation.error)}</p>}
          <Button
            type="button"
            size="sm"
            className="mt-2"
            disabled={!requestedByName.trim() || !purpose.trim()}
            isLoading={logRequestMutation.isPending}
            onClick={() =>
              logRequestMutation.mutate(
                { requestType, requestedByName: requestedByName.trim(), purpose: purpose.trim() },
                { onSuccess: () => { setRequestedByName(""); setPurpose(""); } },
              )
            }
          >
            Log Request
          </Button>
        </div>
      </div>
    </Modal>
  );
}
