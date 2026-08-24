import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type {
  RadiologyMachine,
  RadiologyOrder,
  CreateRadiologyOrderPayload,
  ScheduleRadiologyOrderPayload,
  ModalityWorklistEntry,
  RadiologyReport,
  SaveReportDraftPayload,
  FinalizeReportResult,
} from "@/types/radiology.types";

const ORDERS_KEY = ["radiology", "orders"] as const;
const MACHINES_KEY = ["radiology", "machines"] as const;

export function useRadiologyMachines() {
  return useQuery({
    queryKey: MACHINES_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<RadiologyMachine[]>>("/radiology/machines");
      return response.data.data;
    },
  });
}

/** Powers the technician worklist — GET /api/radiology/orders. Polls every 20s. */
export function useRadiologyWorklist(filters: { status?: string; modality?: string } = {}) {
  return useQuery({
    queryKey: [...ORDERS_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<RadiologyOrder[]>>("/radiology/orders", { params: filters });
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}

export function useCreateRadiologyOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateRadiologyOrderPayload) => {
      const response = await api.post<ApiEnvelope<RadiologyOrder>>("/radiology/orders", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

export function useScheduleRadiologyOrder(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ScheduleRadiologyOrderPayload) => {
      const response = await api.post<ApiEnvelope<RadiologyOrder>>(`/radiology/orders/${orderId}/schedule`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

export function useStartRadiologyExam(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiEnvelope<RadiologyOrder>>(`/radiology/orders/${orderId}/start`);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/** The technician's "mark scan Completed" action. */
export function useMarkRadiologyCompleted(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiEnvelope<RadiologyOrder>>(`/radiology/orders/${orderId}/complete`);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    },
  });
}

/** Mimics the JSON a physical scanner's console would auto-populate from — see radiology.service.ts#getModalityWorklist. */
export function useModalityWorklist(machineAssetId: string | undefined, date?: string) {
  return useQuery({
    queryKey: ["radiology", "modality-worklist", machineAssetId, date],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ModalityWorklistEntry[]>>("/radiology/modality-worklist", {
        params: { machineAssetId, date },
      });
      return response.data.data;
    },
    enabled: Boolean(machineAssetId),
  });
}

/** Single-order lookup, so the split-screen report editor can load correctly on a direct link or a page refresh, not just from the worklist's own cache. */
export function useRadiologyOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ["radiology", "order", orderId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<RadiologyOrder>>(`/radiology/orders/${orderId}`);
      return response.data.data;
    },
    enabled: Boolean(orderId),
  });
}

export function useRadiologyReport(orderId: string | undefined) {
  return useQuery({
    queryKey: ["radiology", "report", orderId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<RadiologyReport | null>>(`/radiology/orders/${orderId}/report`);
      return response.data.data;
    },
    enabled: Boolean(orderId),
  });
}

/** The split-screen editor's autosave — PUT /api/radiology/orders/:orderId/report. */
export function useSaveReportDraft(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveReportDraftPayload) => {
      const response = await api.put<ApiEnvelope<RadiologyReport>>(`/radiology/orders/${orderId}/report`, payload);
      return response.data.data;
    },
    onSuccess: (report) => {
      queryClient.setQueryData(["radiology", "report", orderId], report);
    },
  });
}

/** Locks the report and advances its order to REPORTED, atomically. */
export function useFinalizeReport(reportId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiEnvelope<FinalizeReportResult>>(`/radiology/reports/${reportId}/finalize`);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["radiology", "report"] });
    },
  });
}
