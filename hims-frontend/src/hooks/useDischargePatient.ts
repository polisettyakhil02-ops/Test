import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { Admission, DischargePatientPayload } from "@/types/ipd.types";

/** POST /api/ipd/admissions/:admissionId/discharge — the natural counterpart of admitPatient: ADTService.dischargePatient marks the Admission discharged and frees the bed (to CLEANING, not straight to VACANT) in one withTransaction call (see hims-backend/src/services/adt.service.ts). */
export function useDischargePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ admissionId, ...body }: DischargePatientPayload) => {
      // The backend also returns the freed `bed`, currently unused here — the
      // ward grid is refreshed via query invalidation below instead of read
      // directly off this response.
      const response = await api.post<ApiEnvelope<{ admission: Admission }>>(
        `/ipd/admissions/${admissionId}/discharge`,
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
