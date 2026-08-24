import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope, FertilizationMethod } from "@/types/common.types";
import type {
  IvfCycle,
  CreateIvfCyclePayload,
  StimulationMonitoringVisit,
  EmbryoTransferRecord,
  ObstetricRecord,
  CreateObstetricRecordPayload,
  AncVisit,
  PartographReading,
  DeliveryDetails,
  DmoHandoverNote,
  CreateDmoHandoverNotePayload,
} from "@/types/specialtyEmr.types";

/* ============================================================================
 * IVF EMR
 * ==========================================================================*/

const IVF_KEY = ["specialtyEmr", "ivf"] as const;

export function useIvfCycles(filters: { patientId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...IVF_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<IvfCycle[]>>("/specialty-emr/ivf/cycles", { params: filters });
      return response.data.data;
    },
  });
}

export function useIvfCycle(cycleId: string | undefined) {
  return useQuery({
    queryKey: [...IVF_KEY, "detail", cycleId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<IvfCycle>>(`/specialty-emr/ivf/cycles/${cycleId}`);
      return response.data.data;
    },
    enabled: Boolean(cycleId),
  });
}

export function useCreateIvfCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateIvfCyclePayload) => {
      const response = await api.post<ApiEnvelope<IvfCycle>>("/specialty-emr/ivf/cycles", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: IVF_KEY }),
  });
}

/** Factory for a per-cycle mutation hook. Only the returned closure calls React hooks — `useIvfCycleAction(...)` itself is invoked at module scope below, so it must stay hook-free. */
function useIvfCycleAction<TPayload>(path: (cycleId: string) => string) {
  return (cycleId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (payload: TPayload) => {
        const response = await api.post<ApiEnvelope<IvfCycle>>(path(cycleId), payload);
        return response.data.data;
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: IVF_KEY });
      },
    });
  };
}

export const useAddIvfMonitoringVisit = useIvfCycleAction<Omit<StimulationMonitoringVisit, "recordedByUserId">>(
  (cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/monitoring-visits`,
);
export const useRecordIvfTrigger = useIvfCycleAction<{ triggerShotDate: string; triggerDrugName: string }>(
  (cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/trigger`,
);
export const useRecordEggRetrieval = useIvfCycleAction<{
  eggRetrievalDate: string;
  oocytesRetrievedCount: number;
  matureOocytesCount: number;
  fertilizationMethod: FertilizationMethod;
}>((cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/egg-retrieval`);
export const useRecordFertilizationOutcome = useIvfCycleAction<{ embryosFormedCount: number; embryosFrozenCount: number }>(
  (cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/fertilization-outcome`,
);
export const useAddEmbryoTransfer = useIvfCycleAction<EmbryoTransferRecord>(
  (cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/embryo-transfers`,
);
export const useRecordLutealSupport = useIvfCycleAction<{ lutealSupportNotes: string }>(
  (cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/luteal-support`,
);
export const useRecordBetaHcgResult = useIvfCycleAction<{ betaHcgTestDate: string; betaHcgResultMIUmL: number; isPregnant: boolean }>(
  (cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/beta-hcg`,
);
export const useCancelIvfCycle = useIvfCycleAction<{ reason: string }>((cycleId) => `/specialty-emr/ivf/cycles/${cycleId}/cancel`);

/* ============================================================================
 * Obstetric EMR
 * ==========================================================================*/

const OBSTETRIC_KEY = ["specialtyEmr", "obstetric"] as const;

export function useObstetricRecords(filters: { patientId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...OBSTETRIC_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ObstetricRecord[]>>("/specialty-emr/obstetric/records", { params: filters });
      return response.data.data;
    },
  });
}

export function useObstetricRecord(recordId: string | undefined) {
  return useQuery({
    queryKey: [...OBSTETRIC_KEY, "detail", recordId],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<ObstetricRecord>>(`/specialty-emr/obstetric/records/${recordId}`);
      return response.data.data;
    },
    enabled: Boolean(recordId),
  });
}

export function useCreateObstetricRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateObstetricRecordPayload) => {
      const response = await api.post<ApiEnvelope<ObstetricRecord>>("/specialty-emr/obstetric/records", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: OBSTETRIC_KEY }),
  });
}

/** Same hook-free-factory reasoning as `useIvfCycleAction` above. */
function useObstetricRecordAction<TPayload>(path: (recordId: string) => string) {
  return (recordId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (payload: TPayload) => {
        const response = await api.post<ApiEnvelope<ObstetricRecord>>(path(recordId), payload);
        return response.data.data;
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: OBSTETRIC_KEY });
      },
    });
  };
}

export const useAddAncVisit = useObstetricRecordAction<Omit<AncVisit, "recordedByUserId">>(
  (recordId) => `/specialty-emr/obstetric/records/${recordId}/anc-visits`,
);
export const useAddPartographReading = useObstetricRecordAction<Omit<PartographReading, "recordedByUserId">>(
  (recordId) => `/specialty-emr/obstetric/records/${recordId}/partograph`,
);
export const useRecordDelivery = useObstetricRecordAction<DeliveryDetails>(
  (recordId) => `/specialty-emr/obstetric/records/${recordId}/delivery`,
);

export function useDischargePostnatal(recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<ApiEnvelope<ObstetricRecord>>(`/specialty-emr/obstetric/records/${recordId}/discharge`);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: OBSTETRIC_KEY }),
  });
}

/* ============================================================================
 * DMO Handover
 * ==========================================================================*/

const DMO_KEY = ["specialtyEmr", "dmo"] as const;

/** The morning board's data source — polls every 20s so a new overnight flag shows up without a manual refresh. */
export function useDmoHandoverNotes(filters: { patientId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: [...DMO_KEY, filters],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<DmoHandoverNote[]>>("/specialty-emr/dmo/notes", { params: filters });
      return response.data.data;
    },
    refetchInterval: 20_000,
  });
}

export function useCreateDmoHandoverNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateDmoHandoverNotePayload) => {
      const response = await api.post<ApiEnvelope<DmoHandoverNote>>("/specialty-emr/dmo/notes", payload);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DMO_KEY }),
  });
}

export function useAcknowledgeDmoHandoverNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const response = await api.post<ApiEnvelope<DmoHandoverNote>>(`/specialty-emr/dmo/notes/${noteId}/acknowledge`);
      return response.data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DMO_KEY }),
  });
}
