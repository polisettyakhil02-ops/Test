import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { Ticket, CreateTicketPayload } from "@/types/complaints.types";

const TICKETS_KEY = ["complaints", "tickets"] as const;

/** The Kanban board's data source — polls every 20s so another manager's assignment shows up without a manual refresh. */
export function useTickets(filters: { status?: string; category?: string; assignedToUserId?: string } = {}) {
  return useQuery({
    queryKey: [...TICKETS_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<Ticket[]>>("/complaints/tickets", { params: filters });
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTicketPayload) => {
      const response = await api.post<ApiEnvelope<Ticket>>("/complaints/tickets", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TICKETS_KEY }),
  });
}

function useTicketAction<TPayload = void>(path: (ticketId: string) => string) {
  return (ticketId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (payload: TPayload) => {
        const response = await api.post<ApiEnvelope<Ticket>>(path(ticketId), payload ?? {});
        return response.data.data;
      },
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: TICKETS_KEY }),
    });
  };
}

export const useAssignTicket = useTicketAction<{ assignedToUserId: string }>((ticketId) => `/complaints/tickets/${ticketId}/assign`);
export const useStartTicketProgress = useTicketAction((ticketId) => `/complaints/tickets/${ticketId}/start`);
export const useResolveTicket = useTicketAction<{ resolutionNotes: string }>((ticketId) => `/complaints/tickets/${ticketId}/resolve`);
export const useCloseTicket = useTicketAction((ticketId) => `/complaints/tickets/${ticketId}/close`);
