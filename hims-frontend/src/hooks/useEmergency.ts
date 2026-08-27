import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type {
  ERVisit,
  ERBay,
  RegisterErVisitPayload,
  AssignBayPayload,
  AssignBayResult,
  RecordPrimaryAssessmentPayload,
  EmergencyEMREntry,
  ConvertToIpdAdmissionPayload,
  ConvertToIpdAdmissionResult,
  DischargeErVisitPayload,
} from "@/types/emergency.types";

const ER_VISITS_KEY = ["emergency", "visits"] as const;
const ER_BAYS_KEY = ["emergency", "bays"] as const;

/** Powers the Triage Board — GET /api/emergency/visits. Polls every 15s so a new arrival or a colleague's disposition shows up without a manual refresh. */
export function useErVisits(activeOnly = true) {
  return useQuery({
    queryKey: [...ER_VISITS_KEY, activeOnly],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ERVisit[]>>("/emergency/visits", { params: { activeOnly } });
      return response.data.data;
    },
    refetchInterval: 15_000,
  });
}

export function useErBays() {
  return useQuery({
    queryKey: ER_BAYS_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ERBay[]>>("/emergency/bays");
      return response.data.data;
    },
    refetchInterval: 15_000,
  });
}

export function useRegisterErVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RegisterErVisitPayload) => {
      const response = await api.post<ApiEnvelope<ERVisit>>("/emergency/visits", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ER_VISITS_KEY });
    },
  });
}

export function useAssignBay(erVisitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AssignBayPayload) => {
      const response = await api.post<ApiEnvelope<AssignBayResult>>(`/emergency/visits/${erVisitId}/assign-bay`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ER_VISITS_KEY });
      void queryClient.invalidateQueries({ queryKey: ER_BAYS_KEY });
    },
  });
}

export function useEmergencyEmrHistory(erVisitId: string | undefined) {
  return useQuery({
    queryKey: ["emergency", "primary-assessment", erVisitId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<EmergencyEMREntry[]>>(`/emergency/visits/${erVisitId}/primary-assessment`);
      return response.data.data;
    },
    enabled: Boolean(erVisitId),
  });
}

export function useRecordPrimaryAssessment(erVisitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RecordPrimaryAssessmentPayload) => {
      const response = await api.post<ApiEnvelope<EmergencyEMREntry>>(
        `/emergency/visits/${erVisitId}/primary-assessment`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["emergency", "primary-assessment", erVisitId] });
    },
  });
}

/** Wraps the Triage Board's one-click "Admit to IPD" action. Invalidates the bed grid too, so BedManager reflects the just-claimed bed immediately if a user has it open. */
export function useConvertToIpdAdmission(erVisitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ConvertToIpdAdmissionPayload) => {
      const response = await api.post<ApiEnvelope<ConvertToIpdAdmissionResult>>(
        `/emergency/visits/${erVisitId}/convert-to-admission`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ER_VISITS_KEY });
      void queryClient.invalidateQueries({ queryKey: ER_BAYS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["wards"] });
    },
  });
}

export function useDischargeErVisit(erVisitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DischargeErVisitPayload) => {
      const response = await api.post<ApiEnvelope<ERVisit>>(`/emergency/visits/${erVisitId}/discharge`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ER_VISITS_KEY });
      void queryClient.invalidateQueries({ queryKey: ER_BAYS_KEY });
    },
  });
}
