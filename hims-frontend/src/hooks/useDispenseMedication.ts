import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { DispenseMedicationPayload, DispenseMedicationResult } from "@/types/pharmacy.types";

/** Wraps POST /api/pharmacy/dispense (PharmacyService.dispenseMedication — FEFO stock deduction + invoice posting, one transaction). */
export function useDispenseMedication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DispenseMedicationPayload) => {
      const response = await api.post<ApiEnvelope<DispenseMedicationResult>>("/pharmacy/dispense", payload);
      return response.data.data;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["pendingPrescriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["activeInvoice", result.dispensation.patientId] });
    },
  });
}
