import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { format } from "date-fns";
import { DataTable } from "@/components/admin/DataTable";
import { PatientEditDrawer } from "./PatientEditDrawer";
import { MergePatientsModal } from "./MergePatientsModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { getApiErrorMessage } from "@/lib/axios";
import { usePatientDirectory, useDeactivatePatientAdmin } from "@/hooks/useAdmin";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { AdminPatientRow } from "@/types/admin.types";

const columnHelper = createColumnHelper<AdminPatientRow>();

export function PatientDirectory() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingPatient, setEditingPatient] = useState<AdminPatientRow | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const patientsQuery = usePatientDirectory({
    search: debouncedSearch || undefined,
    sortBy: sorting[0]?.id,
    sortOrder: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const deactivatePatient = useDeactivatePatientAdmin();

  const columns = useMemo(
    () => [
      columnHelper.accessor("uhid", { header: "UHID", cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span> }),
      columnHelper.display({
        id: "name",
        header: "Name",
        cell: (info) => (
          <span className="font-medium text-slate-900">
            {info.row.original.firstName} {info.row.original.lastName}
          </span>
        ),
      }),
      columnHelper.accessor("dateOfBirth", {
        header: "DOB",
        cell: (info) => format(new Date(info.getValue()), "dd MMM yyyy"),
      }),
      columnHelper.accessor("gender", { header: "Gender" }),
      columnHelper.accessor("phone", { header: "Phone" }),
      columnHelper.accessor("isActive", {
        header: "Status",
        cell: (info) => <Badge tone={info.getValue() ? "green" : "gray"}>{info.getValue() ? "Active" : "Inactive"}</Badge>,
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingPatient(row)}>
                Edit
              </Button>
              {row.isActive && (
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={deactivatePatient.isPending && deactivatePatient.variables === row._id}
                  onClick={() => {
                    if (window.confirm(`Deactivate ${row.uhid}? This is reversible only by an admin edit.`)) {
                      deactivatePatient.mutate(row._id);
                    }
                  }}
                >
                  Deactivate
                </Button>
              )}
            </div>
          );
        },
      }),
    ],
    [deactivatePatient],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Patient Directory</h1>
          <p className="text-sm text-slate-500">Global patient search — every UHID in the system.</p>
        </div>
        <Button variant="outline" onClick={() => setMergeModalOpen(true)}>
          Merge Duplicates
        </Button>
      </div>

      <Card>
        <CardContent className="py-3">
          <Input
            label="Search"
            placeholder="UHID, name, or phone"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="max-w-sm"
          />
        </CardContent>
      </Card>

      {patientsQuery.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{getApiErrorMessage(patientsQuery.error)}</p>
      )}

      <DataTable
        columns={columns}
        data={patientsQuery.data?.data ?? []}
        pageCount={patientsQuery.data?.meta.pageCount ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={patientsQuery.isLoading}
        isFetching={patientsQuery.isFetching}
        getRowId={(row) => row._id}
        emptyTitle="No patients found"
        emptyDescription="Try a different search term."
      />

      {editingPatient && <PatientEditDrawer patient={editingPatient} onClose={() => setEditingPatient(null)} />}
      {mergeModalOpen && <MergePatientsModal onClose={() => setMergeModalOpen(false)} />}
    </div>
  );
}
