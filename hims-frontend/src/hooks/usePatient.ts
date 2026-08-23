import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { ApiEnvelope } from "@/types/common.types";
import type { Patient, BookAppointmentResult } from "@/types/patient.types";

export function usePatientByUhid(uhid: string | undefined) {
  return useQuery({
    queryKey: ["patient", "byUhid", uhid],
    queryFn: async () => {
      const response = await api.get<ApiEnvelope<Patient>>(`/patients/${uhid}`);
      return response.data.data;
    },
    enabled: Boolean(uhid),
  });
}

export interface RegisterPatientInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup?: string;
  phone: string;
  email?: string;
  address: { line1: string; city: string; state: string; country: string; postalCode: string };
  emergencyContacts: Array<{ name: string; relationship: string; phone: string }>;
}

export function useRegisterPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterPatientInput) => {
      const response = await api.post<ApiEnvelope<Patient>>("/patients", input);
      return response.data.data;
    },
    onSuccess: (patient) => {
      queryClient.setQueryData(["patient", "byUhid", patient.uhid], patient);
    },
  });
}

export interface BookAppointmentInput {
  patientId: string;
  doctorId: string;
  visitDate?: string;
  isFollowUp?: boolean;
  chiefComplaint: string;
  priority?: "NORMAL" | "SENIOR_CITIZEN" | "EMERGENCY" | "VIP";
}

export function useBookAppointment() {
  return useMutation({
    mutationFn: async (input: BookAppointmentInput) => {
      const response = await api.post<ApiEnvelope<BookAppointmentResult>>("/appointments", input);
      return response.data.data;
    },
  });
}
