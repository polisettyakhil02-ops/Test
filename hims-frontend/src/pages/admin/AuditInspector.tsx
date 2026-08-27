import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { format } from "date-fns";
import { DataTable } from "@/components/admin/DataTable";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { getApiErrorMessage } from "@/lib/axios";
import { useAuditLogs, useStaffDirectory } from "@/hooks/useAdmin";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AuditAction } from "@/types/common.types";
import type { AuditLogEntry } from "@/types/admin.types";
import type { BadgeTone } from "@/components/ui/Badge";

const ACTION_TONE: Record<AuditAction, BadgeTone> = {
  CREATE: "green",
  READ: "blue",
  UPDATE: "yellow",
  DELETE: "red",
  LOGIN: "purple",
  LOGOUT: "gray",
  LOGIN_FAILED: "red",
  EXPORT: "blue",
  PRINT: "gray",
  PERMISSION_DENIED: "red",
};

const ALL_ACTIONS = Object.values(AuditAction);

function ActionTypeFilter({ selected, onChange }: { selected: AuditAction[]; onChange: (next: AuditAction[]) => void }) {
  function toggle(action: AuditAction) {
    onChange(selected.includes(action) ? selected.filter((a) => a !== action) : [...selected, action]);
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-700">Action Type</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_ACTIONS.map((action) => {
          const isSelected = selected.includes(action);
          return (
            <button
              key={action}
              type="button"
              onClick={() => toggle(action)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {action}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpandedLogDetail({ entry }: { entry: AuditLogEntry }) {
  return (
    <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
      <div>
        <p className="mb-1 font-semibold text-slate-500">Request</p>
        <dl className="space-y-1">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">Method / Path</dt>
            <dd className="font-mono text-slate-700">
              {entry.requestMethod} {entry.requestPath}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">Status Code</dt>
            <dd className="text-slate-700">{entry.statusCode ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">IP Address</dt>
            <dd className="font-mono text-slate-700">{entry.ipAddress}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-400">User Agent</dt>
            <dd className="max-w-xs truncate text-slate-700" title={entry.userAgent}>
              {entry.userAgent ?? "—"}
            </dd>
          </div>
          {entry.reasonDenied && (
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Reason Denied</dt>
              <dd className="text-red-700">{entry.reasonDenied}</dd>
            </div>
          )}
        </dl>
      </div>
      <div>
        <p className="mb-1 font-semibold text-slate-500">Payload</p>
        {entry.fieldChanges && entry.fieldChanges.length > 0 ? (
          <pre className="max-h-48 overflow-auto rounded-md bg-slate-900 p-2 text-[11px] leading-relaxed text-slate-100">
            {JSON.stringify(entry.fieldChanges, null, 2)}
          </pre>
        ) : (
          <p className="text-slate-400">No field-level changes recorded for this entry.</p>
        )}
      </div>
    </div>
  );
}

const columnHelper = createColumnHelper<AuditLogEntry>();

/** Investigative UI over the immutable AuditLog collection (see audit.interceptor.ts on the backend) — every filter here maps directly to a query param on GET /api/admin/audit-logs. */
export function AuditInspector() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionTypes, setActionTypes] = useState<AuditAction[]>([]);
  const [targetResourceInput, setTargetResourceInput] = useState("");
  const debouncedTargetResource = useDebouncedValue(targetResourceInput, 300);
  const [status, setStatus] = useState<"" | "SUCCESS" | "FAILED">("");
  const [userId, setUserId] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const staffDirectory = useStaffDirectory({ page: 1, limit: 100 });
  const userOptions = [
    { value: "", label: "Everyone" },
    ...(staffDirectory.data?.data ?? []).map((s) => ({
      value: s._id,
      label: (s.doctorProfile ?? s.staffProfile)?.fullName ?? s.username,
    })),
  ];

  const auditQuery = useAuditLogs({
    userId: userId || undefined,
    actionType: actionTypes.length > 0 ? actionTypes : undefined,
    targetResource: debouncedTargetResource || undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy: sorting[0]?.id,
    sortOrder: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setActionTypes([]);
    setTargetResourceInput("");
    setStatus("");
    setUserId("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor("occurredAt", {
        header: "Timestamp",
        cell: (info) => <span className="whitespace-nowrap">{format(new Date(info.getValue()), "dd MMM yyyy, HH:mm:ss")}</span>,
      }),
      columnHelper.accessor("action", {
        header: "Action",
        cell: (info) => <Badge tone={ACTION_TONE[info.getValue()]}>{info.getValue()}</Badge>,
      }),
      columnHelper.accessor("resourceType", { header: "Resource" }),
      columnHelper.display({
        id: "target",
        header: "Target ID",
        cell: (info) => <span className="font-mono text-xs text-slate-500">{info.row.original.resourceId ?? "—"}</span>,
      }),
      columnHelper.display({
        id: "performedBy",
        header: "Performed By",
        cell: (info) => (
          <div>
            <p className="text-slate-800">{info.row.original.performedByUsername ?? "system"}</p>
            <p className="text-xs text-slate-400">{info.row.original.ipAddress}</p>
          </div>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Result",
        cell: (info) => <Badge tone={info.getValue() === "SUCCESS" ? "green" : "red"}>{info.getValue()}</Badge>,
      }),
      columnHelper.display({
        id: "expand",
        header: "",
        cell: (info) => (
          <button
            type="button"
            className="text-xs font-medium text-brand-600 hover:underline"
            onClick={() => setExpandedRowId((current) => (current === info.row.original._id ? null : info.row.original._id))}
          >
            {expandedRowId === info.row.original._id ? "Hide" : "Details"}
          </button>
        ),
      }),
    ],
    [expandedRowId],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Security &amp; Audit Inspector</h1>
        <p className="text-sm text-slate-500">Immutable, system-wide activity trail — refreshes every 15 seconds.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Select
              label="Performed By"
              options={userOptions}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="min-w-[200px]"
            />
            <Input
              label="Target Resource"
              placeholder="e.g. Patient, Prescription"
              value={targetResourceInput}
              onChange={(e) => setTargetResourceInput(e.target.value)}
              className="min-w-[180px]"
            />
            <Select
              label="Result"
              options={[
                { value: "", label: "All" },
                { value: "SUCCESS", label: "Success" },
                { value: "FAILED", label: "Failed" },
              ]}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="min-w-[140px]"
            />
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>

          <ActionTypeFilter selected={actionTypes} onChange={setActionTypes} />
        </CardContent>
      </Card>

      {auditQuery.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{getApiErrorMessage(auditQuery.error)}</p>
      )}

      <DataTable
        columns={columns}
        data={auditQuery.data?.data ?? []}
        pageCount={auditQuery.data?.meta.pageCount ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={auditQuery.isLoading}
        isFetching={auditQuery.isFetching}
        getRowId={(row) => row._id}
        renderExpandedRow={(row) => <ExpandedLogDetail entry={row} />}
        expandedRowId={expandedRowId}
        emptyTitle="No matching audit entries"
        emptyDescription="Try widening the date range or clearing a filter."
      />
    </div>
  );
}
