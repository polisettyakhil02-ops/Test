import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useStartDialysisSession, useCompleteDialysisSession, useCancelDialysisSession } from "@/hooks/useDialysis";
import { getApiErrorMessage } from "@/lib/axios";
import { DialysisSessionStatus } from "@/types/common.types";
import type { DialysisSession } from "@/types/dialysis.types";

function patientLabel(session: DialysisSession): string {
  if (typeof session.patientId === "string") return session.patientId;
  return `${session.patientId.firstName} ${session.patientId.lastName} (${session.patientId.uhid})`;
}
function machineLabel(session: DialysisSession): string {
  if (typeof session.machineAssetId === "string") return session.machineAssetId;
  return `${session.machineAssetId.name} · ${session.machineAssetId.location}`;
}

const completeSchema = z.object({
  postDialysisWeightKg: z.coerce.number().positive("Required"),
  actualUltrafiltrationVolumeMl: z.coerce.number().min(0),
  postDialysisSystolicBP: z.coerce.number().optional(),
  postDialysisDiastolicBP: z.coerce.number().optional(),
  complications: z.string().optional(),
  notes: z.string().optional(),
});
type CompleteValues = z.infer<typeof completeSchema>;

/**
 * The Nephrology EMR: the dialysis chart for one session. SCHEDULED
 * sessions get a "Start" action; IN_PROGRESS sessions show the
 * post-dialysis chart form (weight, actual UF, post BP, complications) —
 * exactly the parameters the DialysisSession schema tracks — which saves
 * by completing the session.
 */
export function NephrologyEmrModal({ session, onClose }: { session: DialysisSession; onClose: () => void }) {
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const startMutation = useStartDialysisSession();
  const completeMutation = useCompleteDialysisSession(session._id);
  const cancelMutation = useCancelDialysisSession(session._id);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompleteValues>({ resolver: zodResolver(completeSchema) });

  const onSubmit = handleSubmit((values) => {
    completeMutation.mutate(values, { onSuccess: onClose });
  });

  return (
    <Modal isOpen onClose={onClose} title={`Nephrology EMR — ${session.sessionNumber}`} widthClassName="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{patientLabel(session)}</p>
          <p className="text-slate-600">
            {machineLabel(session)} · {session.shift} shift
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="blue">{session.status.replace("_", " ")}</Badge>
            <Badge tone="gray">{session.vascularAccessType.replace(/_/g, " ")}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-md border border-slate-200 p-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Pre-Weight</p>
            <p className="font-semibold">{session.preDialysisWeightKg} kg</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Heparin</p>
            <p className="font-semibold">{session.heparinDoseUnits} u</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Target UF</p>
            <p className="font-semibold">{session.targetUltrafiltrationVolumeMl} ml</p>
          </div>
        </div>

        {session.status === DialysisSessionStatus.SCHEDULED && (
          <div className="space-y-2">
            {startMutation.isError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(startMutation.error)}</p>
            )}
            <Button type="button" isLoading={startMutation.isPending} onClick={() => startMutation.mutate(session._id)}>
              Start Session
            </Button>
          </div>
        )}

        {session.status === DialysisSessionStatus.IN_PROGRESS && (
          <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Post-Dialysis Chart</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Post-Weight (kg)"
                type="number"
                step="0.1"
                error={errors.postDialysisWeightKg?.message}
                {...register("postDialysisWeightKg")}
              />
              <Input label="Actual UF (ml)" type="number" {...register("actualUltrafiltrationVolumeMl")} />
              <Input label="Post Systolic BP" type="number" {...register("postDialysisSystolicBP")} />
              <Input label="Post Diastolic BP" type="number" {...register("postDialysisDiastolicBP")} />
            </div>
            <Input label="Complications" {...register("complications")} />
            <Input label="Notes" {...register("notes")} />
            {completeMutation.isError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(completeMutation.error)}</p>
            )}
            <Button type="submit" isLoading={completeMutation.isPending}>
              Complete Session
            </Button>
          </form>
        )}

        {(session.status === DialysisSessionStatus.SCHEDULED || session.status === DialysisSessionStatus.IN_PROGRESS) && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            {!showCancel ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCancel(true)}>
                Cancel / Abort Session
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Reason"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={!cancelReason.trim()}
                  isLoading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(cancelReason, { onSuccess: onClose })}
                >
                  Confirm
                </Button>
              </div>
            )}
            {cancelMutation.isError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(cancelMutation.error)}</p>
            )}
          </div>
        )}

        {session.status === DialysisSessionStatus.COMPLETED && (
          <div className="grid grid-cols-3 gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Post-Weight</p>
              <p className="font-semibold">{session.postDialysisWeightKg} kg</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Actual UF</p>
              <p className="font-semibold">{session.actualUltrafiltrationVolumeMl} ml</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Complications</p>
              <p className="font-semibold">{session.complications || "None"}</p>
            </div>
          </div>
        )}

        {(session.status === DialysisSessionStatus.CANCELLED || session.status === DialysisSessionStatus.ABORTED) && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {session.status}: {session.cancellationReason}
          </p>
        )}
      </div>
    </Modal>
  );
}
