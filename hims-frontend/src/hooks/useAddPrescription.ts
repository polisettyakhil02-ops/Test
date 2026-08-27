import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { AddPrescriptionPayload, Prescription } from "@/types/emr.types";

/** Wraps POST /api/emr/:patientId/prescriptions (EMRService.addPrescription — server-side dosage-calculator quantity). */
export function useAddPrescription(patientId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddPrescriptionPayload) => {
      const response = await api.post<ApiEnvelope<Prescription>>(`/emr/${patientId}/prescriptions`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["patientTimeline", patientId] });
      void queryClient.invalidateQueries({ queryKey: ["pendingPrescriptions"] });
    },
  });
}
