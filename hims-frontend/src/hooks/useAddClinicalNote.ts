import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { AddClinicalNotePayload, ClinicalNote } from "@/types/emr.types";

/** Wraps POST /api/emr/:patientId/notes (EMRService.addClinicalNote — SOAP note + ICD-10 diagnoses committed together). */
export function useAddClinicalNote(patientId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddClinicalNotePayload) => {
      const response = await api.post<ApiEnvelope<ClinicalNote>>(`/emr/${patientId}/notes`, payload);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["patientTimeline", patientId] });
    },
  });
}
