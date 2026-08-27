import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type {
  DepartmentIndent,
  RaiseIndentPayload,
  ReviewIndentPayload,
  LowStockDrug,
  PurchaseOrder,
  CreatePurchaseOrderPayload,
  GoodsReceiptNote,
  CreateGrnPayload,
  ScmSupplierSummary,
  ScmWardSummary,
} from "@/types/scm.types";

const INDENTS_KEY = ["scm", "indents"] as const;
const LOW_STOCK_KEY = ["scm", "lowStock"] as const;
const POS_KEY = ["scm", "purchaseOrders"] as const;
const GRNS_KEY = ["scm", "grns"] as const;

export function useScmSuppliers() {
  return useQuery({
    queryKey: ["scm", "suppliers"],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ScmSupplierSummary[]>>("/scm/suppliers");
      return response.data.data;
    },
  });
}

export function useScmWards() {
  return useQuery({
    queryKey: ["scm", "wards"],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ScmWardSummary[]>>("/scm/wards");
      return response.data.data;
    },
  });
}

/* Indents */

export function useIndents(filters: { wardId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...INDENTS_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<DepartmentIndent[]>>("/scm/indents", { params: filters });
      return response.data.data;
    },
    refetchInterval: 30_000,
  });
}

export function useRaiseIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RaiseIndentPayload) => {
      const response = await api.post<ApiEnvelope<DepartmentIndent>>("/scm/indents", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: INDENTS_KEY }),
  });
}

export function useReviewIndent(indentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReviewIndentPayload) => {
      const response = await api.post<ApiEnvelope<DepartmentIndent>>(`/scm/indents/${indentId}/review`, payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: INDENTS_KEY }),
  });
}

/* Low stock */

export function useLowStockDrugs() {
  return useQuery({
    queryKey: LOW_STOCK_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<LowStockDrug[]>>("/scm/low-stock");
      return response.data.data;
    },
    refetchInterval: 60_000,
  });
}

/* Purchase Orders */

export function usePurchaseOrders(filters: { status?: string; supplierId?: string } = {}) {
  return useQuery({
    queryKey: [...POS_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<PurchaseOrder[]>>("/scm/purchase-orders", { params: filters });
      return response.data.data;
    },
    refetchInterval: 30_000,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePurchaseOrderPayload) => {
      const response = await api.post<ApiEnvelope<PurchaseOrder>>("/scm/purchase-orders", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: POS_KEY });
      void queryClient.invalidateQueries({ queryKey: INDENTS_KEY });
    },
  });
}

function usePurchaseOrderAction(path: (poId: string) => string) {
  return (poId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (payload?: { reason: string }) => {
        const response = await api.post<ApiEnvelope<PurchaseOrder>>(path(poId), payload ?? {});
        return response.data.data;
      },
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: POS_KEY }),
    });
  };
}

export const useSubmitPurchaseOrder = usePurchaseOrderAction((poId) => `/scm/purchase-orders/${poId}/submit`);
export const useApprovePurchaseOrder = usePurchaseOrderAction((poId) => `/scm/purchase-orders/${poId}/approve`);
export const useCancelPurchaseOrder = usePurchaseOrderAction((poId) => `/scm/purchase-orders/${poId}/cancel`);

/* GRNs */

export function useGrns(filters: { purchaseOrderId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...GRNS_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<GoodsReceiptNote[]>>("/scm/grns", { params: filters });
      return response.data.data;
    },
    refetchInterval: 30_000,
  });
}

export function useCreateGrn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateGrnPayload) => {
      const response = await api.post<ApiEnvelope<GoodsReceiptNote>>("/scm/grns", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: GRNS_KEY }),
  });
}

function useGrnAction(path: (grnId: string) => string) {
  return (grnId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async () => {
        const response = await api.post<ApiEnvelope<GoodsReceiptNote>>(path(grnId));
        return response.data.data;
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: GRNS_KEY });
        void queryClient.invalidateQueries({ queryKey: POS_KEY });
        void queryClient.invalidateQueries({ queryKey: LOW_STOCK_KEY });
      },
    });
  };
}

export const useVerifyGrn = useGrnAction((grnId) => `/scm/grns/${grnId}/verify`);
export const usePostGrnToStock = useGrnAction((grnId) => `/scm/grns/${grnId}/post`);
