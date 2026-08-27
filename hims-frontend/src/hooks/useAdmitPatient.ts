import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { AdmitPatientPayload, AdmitPatientResult } from "@/types/ipd.types";

/** Wraps POST /api/ipd/admit (ADTService.admitPatient — atomic bed claim + Admission creation). Invalidates the wards grid on success so the just-claimed bed flips to OCCUPIED immediately. */
export function useAdmitPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AdmitPatientPayload) => {
      const response = await api.post<ApiEnvelope<AdmitPatientResult>>("/ipd/admit", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wards"] });
    },
  });
}
