import { format } from "date-fns";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/EmptyState";
import { useAdmission } from "@/hooks/useAdmission";
import { useDischargePatient } from "@/hooks/useDischargePatient";
import { getApiErrorMessage } from "@/lib/axios";
import type { WardBedSummary } from "@/types/ipd.types";

export function BedDetailDrawer({ bed, onClose }: { bed: WardBedSummary; onClose: () => void }) {
  const admissionQuery = useAdmission(bed.currentAdmissionId);
  const dischargeMutation = useDischargePatient();

  function handleDischarge() {
    if (!bed.currentAdmissionId) return;
    if (!window.confirm("Discharge this patient and free up the bed?")) return;
    dischargeMutation.mutate({ admissionId: bed.currentAdmissionId, dischargeType: "ROUTINE" }, { onSuccess: onClose });
  }

  return (
    <Drawer isOpen onClose={onClose} title={`Bed ${bed.bedNumber}`}>
      {admissionQuery.isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {admissionQuery.isError && <ErrorState message={getApiErrorMessage(admissionQuery.error)} />}

      {admissionQuery.data && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Patient</p>
            <p className="text-base font-semibold text-slate-900">
              {admissionQuery.data.patient.firstName} {admissionQuery.data.patient.lastName}
            </p>
            <p className="text-sm text-slate-500">UHID: {admissionQuery.data.patient.uhid}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Admission #</p>
              <p className="text-sm text-slate-800">{admissionQuery.data.admission.admissionNumber}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Admitted</p>
              <p className="text-sm text-slate-800">
                {format(new Date(admissionQuery.data.admission.admissionDate), "dd MMM yyyy, HH:mm")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
              <Badge tone="blue">{admissionQuery.data.admission.status}</Badge>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Type</p>
              <p className="text-sm text-slate-800">{admissionQuery.data.admission.admissionType}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Provisional Diagnosis</p>
            <p className="text-sm text-slate-800">{admissionQuery.data.admission.provisionalDiagnosis}</p>
          </div>

          {dischargeMutation.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {getApiErrorMessage(dischargeMutation.error)}
            </p>
          )}

          <div className="border-t border-slate-100 pt-4">
            <Button variant="danger" onClick={handleDischarge} isLoading={dischargeMutation.isPending} className="w-full">
              Initiate Discharge
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
