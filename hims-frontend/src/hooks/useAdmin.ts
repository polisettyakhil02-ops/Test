import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope, PaginatedEnvelope } from "@/types/common.types";
import type {
  StaffDirectoryRow,
  StaffDirectoryQuery,
  CreateStaffPayload,
  UpdateStaffPayload,
  Department,
  AdminPatientRow,
  PatientDirectoryQuery,
  UpdatePatientAdminPayload,
  MergePatientsPayload,
  MergePatientsResult,
  WardWithTariff,
  CreateWardPayload,
  UpdateWardPayload,
  SetBedStatusPayload,
  AuditLogEntry,
  AuditLogQuery,
  RoleWithPermissions,
  UpdateRolePermissionsPayload,
} from "@/types/admin.types";

/** Strips undefined/empty-string values so they don't get serialized as literal "undefined" query-string params. */
function cleanParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
}

/* ============================================================================
 * Staff Directory Master
 * ==========================================================================*/

export function useStaffDirectory(query: StaffDirectoryQuery) {
  return useQuery({
    queryKey: ["adminStaff", query],
    queryFn: async () => {
      const response = await api.get<PaginatedEnvelope<StaffDirectoryRow>>("/admin/users", {
        params: cleanParams({ ...query }),
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["adminDepartments"],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<Department[]>>("/admin/departments");
      return response.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateStaffPayload) => {
      const response = await api.post<ApiEnvelope<{ user: StaffDirectoryRow }>>("/admin/users", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminStaff"] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, payload }: { userId: string; payload: UpdateStaffPayload }) => {
      const response = await api.put<ApiEnvelope<{ user: StaffDirectoryRow }>>(`/admin/users/${userId}`, payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminStaff"] }),
  });
}

export function useToggleUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const response = await api.patch<ApiEnvelope<StaffDirectoryRow>>(`/admin/users/${userId}/status`, { isActive });
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminStaff"] }),
  });
}

/** DELETE /api/admin/users/:id — a deactivation, not a hard delete (see admin.controller.ts on the backend for why). */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.delete<ApiEnvelope<StaffDirectoryRow>>(`/admin/users/${userId}`);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminStaff"] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post<ApiEnvelope<{ temporaryPassword: string }>>(`/admin/users/${userId}/reset-password`);
      return response.data.data;
    },
  });
}

/* ============================================================================
 * Patient Directory Master
 * ==========================================================================*/

export function usePatientDirectory(query: PatientDirectoryQuery) {
  return useQuery({
    queryKey: ["adminPatients", query],
    queryFn: async () => {
      const response = await api.get<PaginatedEnvelope<AdminPatientRow>>("/admin/patients", {
        params: cleanParams({ ...query }),
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useUpdatePatientAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ patientId, payload }: { patientId: string; payload: UpdatePatientAdminPayload }) => {
      const response = await api.put<ApiEnvelope<AdminPatientRow>>(`/admin/patients/${patientId}`, payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminPatients"] }),
  });
}

export function useDeactivatePatientAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patientId: string) => {
      const response = await api.delete<ApiEnvelope<AdminPatientRow>>(`/admin/patients/${patientId}`);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminPatients"] }),
  });
}

export function useMergePatients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MergePatientsPayload) => {
      const response = await api.post<ApiEnvelope<MergePatientsResult>>("/admin/patients/merge", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminPatients"] }),
  });
}

/* ============================================================================
 * Ward & Bed Tariff Master
 * ==========================================================================*/

export function useAdminWards() {
  return useQuery({
    queryKey: ["adminWards"],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<WardWithTariff[]>>("/admin/wards");
      return response.data.data;
    },
  });
}

export function useCreateWard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateWardPayload) => {
      const response = await api.post<ApiEnvelope<WardWithTariff["ward"]>>("/admin/wards", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminWards"] }),
  });
}

export function useUpdateWard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ wardId, payload }: { wardId: string; payload: UpdateWardPayload }) => {
      const response = await api.put<ApiEnvelope<WardWithTariff["ward"]>>(`/admin/wards/${wardId}`, payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminWards"] }),
  });
}

export function useUpdateBedStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bedId, status, reason }: SetBedStatusPayload) => {
      const response = await api.patch<ApiEnvelope<WardWithTariff["beds"][number]>>(`/admin/beds/${bedId}/status`, {
        status,
        reason,
      });
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminWards"] }),
  });
}

/* ============================================================================
 * Global Audit Inspector
 * ==========================================================================*/

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({
    queryKey: ["adminAuditLogs", query],
    queryFn: async () => {
      const response = await api.get<PaginatedEnvelope<AuditLogEntry>>("/admin/audit-logs", {
        // actionType travels as a single comma-separated string, not a
        // repeated-key array param — matching what admin.controller.ts
        // parses on the backend.
        params: cleanParams({ ...query, actionType: query.actionType?.join(",") || undefined }),
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
    // Compliance officers want this feed close to real-time; the spec
    // explicitly calls it out as one, so poll rather than requiring a
    // manual refresh.
    refetchInterval: 15_000,
  });
}

/* ============================================================================
 * Role & Permission Matrix
 * ==========================================================================*/

// BACKEND GAP: GET /api/admin/roles and PUT /api/admin/roles/:systemRole/permissions
// don't exist in hims-backend yet. The Role model and its editable
// `permissions` matrix were built in Step 1 for exactly this UI, but
// admin.controller.ts (Step 6) never exposed a route for it — see
// ARCHITECTURE.md's Step 10 notes. Written against the natural REST shape
// every other admin master here already follows (a GET list + a scoped
// PUT update), so this starts working the moment those two routes land.
export function useRoles() {
  return useQuery({
    queryKey: ["adminRoles"],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<RoleWithPermissions[]>>("/admin/roles");
      return response.data.data;
    },
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ systemRole, permissions }: UpdateRolePermissionsPayload) => {
      const response = await api.put<ApiEnvelope<RoleWithPermissions>>(`/admin/roles/${systemRole}/permissions`, {
        permissions,
      });
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["adminRoles"] }),
  });
}
