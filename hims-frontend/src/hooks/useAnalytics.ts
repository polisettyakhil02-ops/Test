import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type {
  DateRangeParams,
  OpdWaitingTimeStats,
  IcuBounceBackStats,
  SurgicalSiteInfectionStats,
  DepartmentProfitability,
  TopRevenueDoctor,
  PharmacyWastageItem,
} from "@/types/analytics.types";

const ANALYTICS_KEY = ["analytics"] as const;
/** The Control Tower's own refresh cadence — a leadership dashboard, not an operational desk, so a slower poll than any clinical screen in this app. */
const REFETCH_INTERVAL_MS = 120_000;

export function useOpdWaitingTimeStats(range: DateRangeParams) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "opd-waiting-time", range],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<OpdWaitingTimeStats>>("/analytics/quality/opd-waiting-time", { params: range });
      return response.data.data;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useIcuBounceBackRate(range: DateRangeParams) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "icu-bounce-back", range],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<IcuBounceBackStats>>("/analytics/quality/icu-bounce-back-rate", { params: range });
      return response.data.data;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useSurgicalSiteInfectionRate(range: DateRangeParams) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "ssi-rate", range],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<SurgicalSiteInfectionStats>>("/analytics/quality/surgical-site-infection-rate", {
        params: range,
      });
      return response.data.data;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useDepartmentProfitability(range: DateRangeParams) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "department-profitability", range],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<DepartmentProfitability[]>>("/analytics/finance/department-profitability", {
        params: range,
      });
      return response.data.data;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function useTopRevenueDoctors(range: DateRangeParams, limit = 10) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "top-revenue-doctors", range, limit],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<TopRevenueDoctor[]>>("/analytics/finance/top-revenue-doctors", {
        params: { ...range, limit },
      });
      return response.data.data;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

export function usePharmacyWastage(range: DateRangeParams, limit = 10) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, "pharmacy-wastage", range, limit],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<PharmacyWastageItem[]>>("/analytics/finance/pharmacy-wastage", {
        params: { ...range, limit },
      });
      return response.data.data;
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
