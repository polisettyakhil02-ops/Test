import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { ActiveInvoiceResponse, PayInvoicePayload, PayInvoiceResult } from "@/types/billing.types";

/**
 * Wraps POST /api/billing/:invoiceId/pay (BillingService.payInvoice —
 * atomic Payment + Invoice update). On success, writes the returned
 * invoice straight into the `activeInvoice` query cache for that
 * patient — the invoice flips to PAID/PARTIALLY_PAID in the UI
 * instantly, with no refetch and no page reload, per the spec.
 */
export function usePayInvoice(patientId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PayInvoicePayload) => {
      const response = await api.post<ApiEnvelope<PayInvoiceResult>>(`/billing/${payload.invoiceId}/pay`, {
        amount: payload.amount,
        mode: payload.mode,
        referenceNumber: payload.referenceNumber,
        notes: payload.notes,
      });
      return response.data.data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<ActiveInvoiceResponse | null>(["activeInvoice", patientId], (current) =>
        current ? { ...current, invoice: result.invoice } : current,
      );
    },
  });
}
