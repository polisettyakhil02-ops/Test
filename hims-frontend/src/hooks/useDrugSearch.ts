import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { DrugSearchResult } from "@/types/emr.types";

// BACKEND GAP: GET /api/pharmacy/drugs?search= doesn't exist yet — see
// the note in src/types/emr.types.ts. Powers the prescription builder's
// medication search/autocomplete.
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
