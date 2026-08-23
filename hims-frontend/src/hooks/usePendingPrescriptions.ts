import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { PendingPrescription } from "@/types/emr.types";

/** Powers DispensationQueue — GET /api/pharmacy/prescriptions/pending. Polls every 20s so newly-written prescriptions show up without a manual refresh. */
export function usePendingPrescriptions() {
  return useQuery({
    queryKey: ["pendingPrescriptions"],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<PendingPrescription[]>>("/pharmacy/prescriptions/pending");
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}
