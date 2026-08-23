import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { Admission, DischargePatientPayload } from "@/types/ipd.types";

// BACKEND GAP: POST /api/ipd/:admissionId/discharge doesn't exist yet —
// see the note in src/types/ipd.types.ts. Written against the natural
// counterpart of ADTService.admitPatient: flip the bed back to VACANT,
// clear currentAdmissionId, set Admission.status = DISCHARGED, all in
// one withTransaction call.
export function useDischargePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ admissionId, ...body }: DischargePatientPayload) => {
      const response = await api.post<ApiEnvelope<{ admission: Admission }>>(
        `/ipd/${admissionId}/discharge`,
        body,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["wards"] });
      void queryClient.invalidateQueries({ queryKey: ["admission", variables.admissionId] });
    },
  });
}
