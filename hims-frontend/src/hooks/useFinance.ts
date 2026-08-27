import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { Expense, LogExpensePayload, MarkExpensePaidPayload } from "@/types/finance.types";

const EXPENSES_KEY = ["finance", "expenses"] as const;

export function useExpenses(filters: { category?: string; paymentStatus?: string } = {}) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<Expense[]>>("/finance/expenses", { params: filters });
      return response.data.data;
    },
  });
}

export function useLogExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LogExpensePayload) => {
      const response = await api.post<ApiEnvelope<Expense>>("/finance/expenses", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: EXPENSES_KEY }),
  });
}

export function useMarkExpensePaid(expenseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MarkExpensePaidPayload) => {
      const response = await api.post<ApiEnvelope<Expense>>(`/finance/expenses/${expenseId}/pay`, payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: EXPENSES_KEY }),
  });
}
