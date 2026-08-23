import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/DataTable";
import { StaffEditDrawer } from "./StaffEditDrawer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent } from "@/components/ui/Card";
import { getApiErrorMessage } from "@/lib/axios";
import { useStaffDirectory, useDepartments, useToggleUserStatus, useResetPassword } from "@/hooks/useAdmin";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SystemRole } from "@/types/common.types";
import type { StaffDirectoryRow } from "@/types/admin.types";
import type { BadgeTone } from "@/components/ui/Badge";

const ROLE_FILTER_OPTIONS = [{ value: "", label: "All roles" }, ...Object.values(SystemRole).map((v) => ({ value: v, label: v.replace(/_/g, " ") }))];

function ResetPasswordButton({ userId }: { userId: string }) {
  const resetPassword = useResetPassword();
  const [revealed, setRevealed] = useState<string | null>(null);

  if (revealed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
        <code className="font-mono">{revealed}</code>
        <button type="button" className="underline" onClick={() => setRevealed(null)}>
          dismiss
        </button>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      isLoading={resetPassword.isPending}
      onClick={() => {
        if (!window.confirm("Generate a new temporary password for this account?")) return;
        resetPassword.mutate(userId, { onSuccess: (result) => setRevealed(result.temporaryPassword) });
      }}
    >
      Reset password
    </Button>
  );
}

const columnHelper = createColumnHelper<StaffDirectoryRow>();

export function StaffDirectory() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingStaff, setEditingStaff] = useState<StaffDirectoryRow | null | undefined>(undefined);

  const departmentsQuery = useDepartments();
  const departmentNameById = useMemo(
    () => new Map((departmentsQuery.data ?? []).map((d) => [d._id, d.name])),
    [departmentsQuery.data],
  );

  const staffQuery = useStaffDirectory({
    search: debouncedSearch || undefined,
    role: (roleFilter as SystemRole) || undefined,
    departmentId: departmentFilter || undefined,
    sortBy: sorting[0]?.id,
    sortOrder: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const toggleStatus = useToggleUserStatus();

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.doctorProfile?.fullName ?? row.staffProfile?.fullName ?? row.username, {
        id: "fullName",
        header: "Name",
        cell: (info) => {
          const row = info.row.original;
          const profile = row.doctorProfile ?? row.staffProfile;
          return (
            <div>
              <p className="font-medium text-slate-900">{profile?.fullName ?? "—"}</p>
              <p className="text-xs text-slate-400">{profile?.employeeCode}</p>
            </div>
          );
        },
      }),
      columnHelper.accessor("email", {
        id: "email",
        header: "Contact",
        cell: (info) => (
          <div>
            <p className="text-slate-700">{info.getValue()}</p>
            <p className="text-xs text-slate-400">{info.row.original.username}</p>
          </div>
        ),
      }),
      columnHelper.display({
        id: "role",
        header: "Role",
        cell: (info) => (
          <div className="flex flex-wrap gap-1">
            {info.row.original.roles.map((role) => (
              <Badge key={role} tone="blue">
                {role.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        ),
      }),
      columnHelper.display({
        id: "department",
        header: "Department",
        cell: (info) => {
          const profile = info.row.original.doctorProfile ?? info.row.original.staffProfile;
          return <span className="text-slate-600">{profile ? departmentNameById.get(profile.departmentId) ?? "—" : "—"}</span>;
        },
      }),
      columnHelper.accessor("isActive", {
        id: "isActive",
        header: "Status",
        cell: (info) => {
          const row = info.row.original;
          const tone: BadgeTone = row.isActive ? "green" : "gray";
          return (
            <div className="flex items-center gap-1.5">
              <Badge tone={tone}>{row.isActive ? "Active" : "Inactive"}</Badge>
              {row.isLocked && <Badge tone="red">Locked</Badge>}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingStaff(row)}>
                Edit
              </Button>
              <Button
                variant={row.isActive ? "danger" : "secondary"}
                size="sm"
                isLoading={toggleStatus.isPending && toggleStatus.variables?.userId === row._id}
                onClick={() =>
                  toggleStatus.mutate({ userId: row._id, isActive: !row.isActive })
                }
              >
                {row.isActive ? "Deactivate" : "Activate"}
              </Button>
              <ResetPasswordButton userId={row._id} />
            </div>
          );
        },
      }),
    ],
    [departmentNameById, toggleStatus],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Staff Directory</h1>
          <p className="text-sm text-slate-500">Every login account in the system — doctors, nurses, and support staff.</p>
        </div>
        <Button onClick={() => setEditingStaff(null)}>+ Add Staff Member</Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <Input
            label="Search"
            placeholder="Username, email, or phone"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="min-w-[220px]"
          />
          <Select
            label="Role"
            options={ROLE_FILTER_OPTIONS}
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="min-w-[180px]"
          />
          <Select
            label="Department"
            options={[{ value: "", label: "All departments" }, ...(departmentsQuery.data ?? []).map((d) => ({ value: d._id, label: d.name }))]}
            value={departmentFilter}
            onChange={(event) => {
              setDepartmentFilter(event.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="min-w-[180px]"
          />
        </CardContent>
      </Card>

      {staffQuery.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{getApiErrorMessage(staffQuery.error)}</p>
      )}

      <DataTable
        columns={columns}
        data={staffQuery.data?.data ?? []}
        pageCount={staffQuery.data?.meta.pageCount ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={staffQuery.isLoading}
        isFetching={staffQuery.isFetching}
        getRowId={(row) => row._id}
        emptyTitle="No staff found"
        emptyDescription="Try a different search term or filter."
      />

      {editingStaff !== undefined && <StaffEditDrawer staff={editingStaff} onClose={() => setEditingStaff(undefined)} />}
    </div>
  );
}
