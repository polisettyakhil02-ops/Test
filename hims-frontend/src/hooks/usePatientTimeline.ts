import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { TimelineEntry } from "@/types/emr.types";

/** Powers DoctorDesk's history panel — GET /api/emr/:patientId/timeline. */
export function usePatientTimeline(patientId: string | undefined) {
  return useQuery({
    queryKey: ["patientTimeline", patientId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<TimelineEntry[]>>(`/emr/${patientId}/timeline`);
      return response.data.data;
    },
    enabled: Boolean(patientId),
  });
}
