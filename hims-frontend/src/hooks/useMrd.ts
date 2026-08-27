import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type {
  EligibleAdmission,
  MedicalRecordArchive,
  CreateArchiveRecordPayload,
  FinalizeIcdCodingPayload,
  LogFileRequestPayload,
} from "@/types/mrd.types";

const ARCHIVES_KEY = ["mrd", "archives"] as const;
const ELIGIBLE_KEY = ["mrd", "eligibleAdmissions"] as const;
const PENDING_CODING_KEY = ["mrd", "pendingCoding"] as const;

export function useEligibleAdmissions() {
  return useQuery({
    queryKey: ELIGIBLE_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<EligibleAdmission[]>>("/mrd/eligible-admissions");
      return response.data.data;
    },
  });
}

export function useMrdArchives(filters: { patientId?: string; status?: string; icdCodingStatus?: string } = {}) {
  return useQuery({
    queryKey: [...ARCHIVES_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<MedicalRecordArchive[]>>("/mrd/archives", { params: filters });
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}

/** The ICD coding dashboard's data source — every archive still PENDING or QUERY_RAISED, oldest first. */
export function usePendingIcdCoding() {
  return useQuery({
    queryKey: PENDING_CODING_KEY,
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<MedicalRecordArchive[]>>("/mrd/archives/pending-coding");
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}

function invalidateArchives(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ARCHIVES_KEY });
  void queryClient.invalidateQueries({ queryKey: PENDING_CODING_KEY });
  void queryClient.invalidateQueries({ queryKey: ELIGIBLE_KEY });
}

export function useCreateArchiveRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateArchiveRecordPayload) => {
      const response = await api.post<ApiEnvelope<MedicalRecordArchive>>("/mrd/archives", payload);
      return response.data.data;
    },
    onSuccess: () => invalidateArchives(queryClient),
  });
}

export function useCheckOutFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { fileBarcodeId: string; reason: string }) => {
      const response = await api.post<ApiEnvelope<MedicalRecordArchive>>("/mrd/archives/checkout", payload);
      return response.data.data;
    },
    onSuccess: () => invalidateArchives(queryClient),
  });
}

export function useCheckInFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { fileBarcodeId: string }) => {
      const response = await api.post<ApiEnvelope<MedicalRecordArchive>>("/mrd/archives/checkin", payload);
      return response.data.data;
    },
    onSuccess: () => invalidateArchives(queryClient),
  });
}

export function useFinalizeIcdCoding(archiveId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: FinalizeIcdCodingPayload) => {
      const response = await api.post<ApiEnvelope<MedicalRecordArchive>>(`/mrd/archives/${archiveId}/icd-coding`, payload);
      return response.data.data;
    },
    onSuccess: () => invalidateArchives(queryClient),
  });
}

export function useFlagIcdQuery(archiveId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => {
      const response = await api.post<ApiEnvelope<MedicalRecordArchive>>(`/mrd/archives/${archiveId}/icd-query`, { note });
      return response.data.data;
    },
    onSuccess: () => invalidateArchives(queryClient),
  });
}

export function useLogFileRequest(archiveId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LogFileRequestPayload) => {
      const response = await api.post<ApiEnvelope<MedicalRecordArchive>>(`/mrd/archives/${archiveId}/requests`, payload);
      return response.data.data;
    },
    onSuccess: () => invalidateArchives(queryClient),
  });
}

export function useResolveFileRequest(archiveId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, ...payload }: { requestId: string; status: "FULFILLED" | "DENIED"; denialReason?: string }) => {
      const response = await api.post<ApiEnvelope<MedicalRecordArchive>>(
        `/mrd/archives/${archiveId}/requests/${requestId}/resolve`,
        payload,
      );
      return response.data.data;
    },
    onSuccess: () => invalidateArchives(queryClient),
  });
}
