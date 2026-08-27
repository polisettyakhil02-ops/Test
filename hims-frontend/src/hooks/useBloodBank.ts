import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type {
  BloodDonor,
  RegisterDonorPayload,
  LogDonationPayload,
  LogDonationResult,
  InventoryRow,
  CrossMatchRequest,
  RaiseCrossMatchRequestPayload,
  PerformCrossMatchPayload,
  DispenseBloodBagPayload,
  DispenseBloodBagResult,
} from "@/types/bloodbank.types";

const DONORS_KEY = ["bloodbank", "donors"] as const;
const INVENTORY_KEY = ["bloodbank", "inventory"] as const;
const REQUESTS_KEY = ["bloodbank", "crossmatch-requests"] as const;

export function useDonors() {
  return useQuery({
    queryKey: DONORS_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<BloodDonor[]>>("/bloodbank/donors");
      return response.data.data;
    },
  });
}

export function useRegisterDonor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RegisterDonorPayload) => {
      const response = await api.post<ApiEnvelope<BloodDonor>>("/bloodbank/donors", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DONORS_KEY });
    },
  });
}

/** Logs a camp collection and mints the resulting blood bag — invalidates both the donor roster (totalDonations bumped) and the inventory grid. */
export function useLogDonation(donorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LogDonationPayload) => {
      const response = await api.post<ApiEnvelope<LogDonationResult>>(`/bloodbank/donors/${donorId}/donations`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DONORS_KEY });
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}

/** Powers the inventory grid — GET /api/bloodbank/inventory. Polls every 20s so a fridge full of units updates live as other staff dispense/collect. */
export function useInventory(filters: { bloodGroup?: string; componentType?: string } = {}) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<InventoryRow[]>>("/bloodbank/inventory", { params: filters });
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}

export function useCrossMatchRequests(status?: string) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, status],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<CrossMatchRequest[]>>("/bloodbank/crossmatch-requests", {
        params: status ? { status } : undefined,
      });
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}

export function useRaiseCrossMatchRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RaiseCrossMatchRequestPayload) => {
      const response = await api.post<ApiEnvelope<CrossMatchRequest>>("/bloodbank/crossmatch-requests", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
    },
  });
}

/** Records the compatibility result; a COMPATIBLE outcome reserves the actual units server-side, so the inventory grid needs invalidating too. */
export function usePerformCrossMatch(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PerformCrossMatchPayload) => {
      const response = await api.post<ApiEnvelope<CrossMatchRequest>>(`/bloodbank/crossmatch-requests/${requestId}/perform`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}

/** The dispensing guard's UI entry point — rejected server-side (never issued) if the cross-match isn't COMPATIBLE or the bag has expired since being reserved. */
export function useDispenseBloodBag(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DispenseBloodBagPayload) => {
      const response = await api.post<ApiEnvelope<DispenseBloodBagResult>>(
        `/bloodbank/crossmatch-requests/${requestId}/dispense`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    },
  });
}
