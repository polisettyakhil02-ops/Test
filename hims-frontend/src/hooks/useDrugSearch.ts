import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { DrugSearchResult } from "@/types/emr.types";

/** Powers the prescription builder's medication search/autocomplete. */
export function useDrugSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["drugSearch", trimmed],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<DrugSearchResult[]>>("/pharmacy/drugs", {
        params: { search: trimmed },
      });
      return response.data.data;
    },
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });
}
