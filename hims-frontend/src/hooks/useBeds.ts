import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { WardMapEntry } from "@/types/ipd.types";

/** Powers BedManager's grid — GET /api/ipd/wards. Polls every 30s so the grid reflects admissions/discharges made by other users without a manual refresh. */
export function useWards() {
  return useQuery({
    queryKey: ["wards"],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<WardMapEntry[]>>("/ipd/wards");
      return response.data.data;
    },
    refetchInterval: 30_000,
  });
}
