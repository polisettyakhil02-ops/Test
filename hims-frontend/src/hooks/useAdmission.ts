import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { AdmissionDetail } from "@/types/ipd.types";

/** Powers the occupied-bed drawer's UHID/admission-date display in BedManager. */
export function useAdmission(admissionId: string | undefined) {
  return useQuery({
    queryKey: ["admission", admissionId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<AdmissionDetail>>(`/ipd/admissions/${admissionId}`);
      return response.data.data;
    },
    enabled: Boolean(admissionId),
  });
}
