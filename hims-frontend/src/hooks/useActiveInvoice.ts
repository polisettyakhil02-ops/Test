import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { ActiveInvoiceResponse } from "@/types/billing.types";

/** Powers InvoiceView — GET /api/billing/:patientId/active-invoice. The backend returns `data: null` (not a 404) when there's no DRAFT invoice, so callers should render an empty state rather than an error for that case. */
export function useActiveInvoice(patientId: string | undefined) {
  return useQuery({
    queryKey: ["activeInvoice", patientId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ActiveInvoiceResponse | null>>(
        `/billing/${patientId}/active-invoice`,
      );
      return response.data.data;
    },
    enabled: Boolean(patientId),
  });
}
