import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type {
  DialysisMachine,
  DialysisSession,
  ScheduleDialysisSessionPayload,
  CompleteDialysisSessionPayload,
} from "@/types/dialysis.types";

const SESSIONS_KEY = ["dialysis", "sessions"] as const;
const MACHINES_KEY = ["dialysis", "machines"] as const;

export function useDialysisMachines() {
  return useQuery({
    queryKey: MACHINES_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<DialysisMachine[]>>("/dialysis/machines");
      return response.data.data;
    },
  });
}

/** Powers the scheduler grid — GET /api/dialysis/sessions. Polls every 30s so another technician's booking shows up without a manual refresh. */
export function useDialysisSessions(filters: { machineAssetId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...SESSIONS_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<DialysisSession[]>>("/dialysis/sessions", { params: filters });
      return response.data.data;
    },
    refetchInterval: 30_000,
  });
}

/** Wraps POST /api/dialysis/sessions (machine double-booking guard). */
export function useScheduleDialysisSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ScheduleDialysisSessionPayload) => {
      const response = await api.post<ApiEnvelope<DialysisSession>>("/dialysis/sessions", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

export function useStartDialysisSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await api.post<ApiEnvelope<DialysisSession>>(`/dialysis/sessions/${sessionId}/start`);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

/** The Nephrology EMR's save action — records the post-dialysis chart and closes the session out. */
export function useCompleteDialysisSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CompleteDialysisSessionPayload) => {
      const response = await api.post<ApiEnvelope<DialysisSession>>(`/dialysis/sessions/${sessionId}/complete`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

export function useCancelDialysisSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const response = await api.post<ApiEnvelope<DialysisSession>>(`/dialysis/sessions/${sessionId}/cancel`, { reason });
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}
