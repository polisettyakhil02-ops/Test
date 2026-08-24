import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { Specimen, CollectSpecimenPayload, CollectSpecimenResult } from "@/types/phlebotomy.types";

const QUEUE_KEY = ["phlebotomy", "queue"] as const;

/** Powers both the TV queue board and the technician worklist — GET /api/phlebotomy/queue. Polls every 10s: this screen is meant to be glanced at from across a waiting room, not manually refreshed. */
export function usePhlebotomyQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<Specimen[]>>("/phlebotomy/queue");
      return response.data.data;
    },
    refetchInterval: 10_000,
  });
}

export function useSpecimenLabel(barcodeValue: string | undefined) {
  return useQuery({
    queryKey: ["phlebotomy", "specimen", barcodeValue],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<Specimen>>(`/phlebotomy/specimens/${encodeURIComponent(barcodeValue ?? "")}`);
      return response.data.data;
    },
    enabled: Boolean(barcodeValue),
    retry: false,
  });
}

/** Wraps the barcode scan/entry that marks a sample Collected — the gate `LIMSService.submitLabResult` now enforces before any result can be entered against it. */
export function useCollectSpecimen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CollectSpecimenPayload) => {
      const response = await api.post<ApiEnvelope<CollectSpecimenResult>>("/phlebotomy/specimens/collect", payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    },
  });
}
