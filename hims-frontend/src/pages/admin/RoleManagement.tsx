import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { useRoles, useUpdateRolePermissions } from "@/hooks/useAdmin";
import { PermissionAction, type SystemRole } from "@/types/common.types";
import type { PermissionGrant, RoleWithPermissions } from "@/types/admin.types";

/**
 * The four CRUD-shaped actions this grid edits. `PermissionAction` has a
 * few more values (APPROVE, DISPENSE, ADMINISTER, DISCHARGE, BILL,
 * EXPORT) reserved for workflow-specific grants — "may this role dispense
 * a prescription" isn't a generic resource checkbox — so this editor
 * doesn't touch them; `grantsFromMatrix` below preserves whatever a role
 * already has on save rather than silently dropping them.
 */
const EDITABLE_ACTIONS = [
  PermissionAction.CREATE,
  PermissionAction.READ,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
] as const;
type EditableAction = (typeof EDITABLE_ACTIONS)[number];

/**
 * Canonical resource identifiers already used as `resourceType` throughout
 * the backend's `auditLogger(bucket, resourceType)` calls (see e.g.
 * patient.routes.ts, billing.routes.ts) — kept in sync with those exact
 * strings so a grant made here means the same resource `authorizePermission`
 * would check against.
 */
const BASE_RESOURCES = [
  "Patient",
  "Admission",
  "Prescription",
  "LabOrder",
  "Invoice",
  "OTSchedule",
  "User",
  "Ward",
  "AuditLog",
];

type PermissionMatrix = Record<string, Partial<Record<EditableAction, boolean>>>;

function isEditableAction(action: PermissionAction): action is EditableAction {
  return (EDITABLE_ACTIONS as readonly PermissionAction[]).includes(action);
}

/** Seeds the editable grid's local state from a role's persisted grants. */
function matrixFromGrants(grants: PermissionGrant[]): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const grant of grants) {
    const row: Partial<Record<EditableAction, boolean>> = {};
    for (const action of grant.actions) {
      if (isEditableAction(action)) {
        row[action] = true;
      }
    }
    matrix[grant.resource] = row;
  }
  return matrix;
}

/**
 * Converts the edited grid back into `PermissionGrant[]` for the save
 * request. Any workflow-specific action (or a resource this grid never
 * rendered at all, e.g. a custom grant seeded outside this UI) is carried
 * over unchanged from `originalGrants` — Save must never silently erase a
 * grant it didn't show the admin in the first place.
 */
function grantsFromMatrix(matrix: PermissionMatrix, originalGrants: PermissionGrant[]): PermissionGrant[] {
  const preservedActionsByResource = new Map<string, PermissionAction[]>();
  for (const grant of originalGrants) {
    const preserved = grant.actions.filter((action) => !isEditableAction(action));
    if (preserved.length > 0) {
      preservedActionsByResource.set(grant.resource, preserved);
    }
  }

  const resources = new Set<string>([...Object.keys(matrix), ...preservedActionsByResource.keys()]);

  const grants: PermissionGrant[] = [];
  for (const resource of resources) {
    const editableActions = EDITABLE_ACTIONS.filter((action) => matrix[resource]?.[action]);
    const preservedActions = preservedActionsByResource.get(resource) ?? [];
    const actions = [...editableActions, ...preservedActions];
    if (actions.length > 0) {
      grants.push({ resource, actions });
    }
  }
  return grants;
}

/**
 * Admin Control Center page for editing the `Role.permissions` matrix
 * (see hims-backend/src/models/admin/Role.model.ts) — one role at a time,
 * grid of resource × {CREATE, READ, UPDATE, DELETE}. SUPER_ADMIN is
 * rendered read-only (`isEditable: false`) since its grants can't be
 * narrowed via this UI, matching the backend model's own design intent.
 */
export function RoleManagement() {
  const rolesQuery = useRoles();
  const updatePermissions = useUpdateRolePermissions();

  const [selectedRole, setSelectedRole] = useState<SystemRole | "">("");
  const [matrix, setMatrix] = useState<PermissionMatrix>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const roles = rolesQuery.data ?? [];
  const selected: RoleWithPermissions | undefined = roles.find((role) => role.systemRole === selectedRole);

  // Default to the first role once the list loads.
  useEffect(() => {
    if (selectedRole) {
      return;
    }
    const first = roles[0];
    if (first) {
      setSelectedRole(first.systemRole);
    }
  }, [roles, selectedRole]);

  // Re-seed the editable grid whenever the selected role changes, or its
  // server data refreshes after a save (useRoles/useUpdateRolePermissions
  // both key off ["adminRoles"], so a successful save produces a fresh
  // `selected.permissions` reference here).
  useEffect(() => {
    if (selected) {
      setMatrix(matrixFromGrants(selected.permissions));
      setSavedAt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const resources = useMemo(() => {
    const fromSelectedRole = selected?.permissions.map((grant) => grant.resource) ?? [];
    return Array.from(new Set([...BASE_RESOURCES, ...fromSelectedRole])).sort((a, b) => a.localeCompare(b));
  }, [selected]);

  function toggle(resource: string, action: EditableAction) {
    setMatrix((prev) => ({
      ...prev,
      [resource]: { ...prev[resource], [action]: !prev[resource]?.[action] },
    }));
  }

  function handleSave() {
    if (!selected) {
      return;
    }
    const permissions = grantsFromMatrix(matrix, selected.permissions);
    updatePermissions.mutate(
      { systemRole: selected.systemRole, permissions },
      { onSuccess: () => setSavedAt(Date.now()) },
    );
  }

  if (rolesQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (rolesQuery.isError) {
    return <ErrorState message={getApiErrorMessage(rolesQuery.error)} />;
  }

  if (roles.length === 0) {
    return <EmptyState title="No roles found" description="Seed the Role collection to manage permissions here." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Role &amp; Permission Management</h1>
        <p className="text-sm text-slate-500">
          Fine-tune what each role can do, resource by resource. SUPER_ADMIN always has full system access and can't
          be narrowed here.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 py-3">
          <Select
            label="Role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as SystemRole)}
            options={roles.map((role) => ({ value: role.systemRole, label: role.displayName }))}
            className="min-w-[260px]"
          />

          {selected && (
            <div className="flex items-center gap-3">
              {!selected.isEditable && <Badge tone="gray">Not editable</Badge>}
              {savedAt && !updatePermissions.isPending && (
                <span className="text-xs font-medium text-emerald-600">Saved</span>
              )}
              <Button onClick={handleSave} isLoading={updatePermissions.isPending} disabled={!selected.isEditable}>
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {updatePermissions.isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {getApiErrorMessage(updatePermissions.error)}
        </p>
      )}

      {selected && (
        <Card>
          <CardHeader className="flex-col items-start gap-0.5">
            <CardTitle>{selected.displayName}</CardTitle>
            {selected.description && <p className="text-xs text-slate-500">{selected.description}</p>}
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 text-left font-medium text-slate-600">Resource</th>
                  {EDITABLE_ACTIONS.map((action) => (
                    <th key={action} className="px-4 py-2 text-center font-medium text-slate-600">
                      {action}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resources.map((resource, index) => (
                  <tr
                    key={resource}
                    className={`border-b border-slate-100 last:border-0 ${index % 2 === 1 ? "bg-slate-50/60" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800">{resource}</td>
                    {EDITABLE_ACTIONS.map((action) => (
                      <td key={action} className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${action} on ${resource} for ${selected.displayName}`}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                          checked={Boolean(matrix[resource]?.[action])}
                          disabled={!selected.isEditable}
                          onChange={() => toggle(resource, action)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
