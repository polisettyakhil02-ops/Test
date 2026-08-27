import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { getApiErrorMessage } from "@/lib/axios";
import { usePatientDirectory, useMergePatients } from "@/hooks/useAdmin";
import type { AdminPatientRow, MergePatientsResult } from "@/types/admin.types";

function PatientLookup({
  label,
  onResolved,
}: {
  label: string;
  onResolved: (patient: AdminPatientRow | null) => void;
}) {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState<string | undefined>(undefined);
  const lookup = usePatientDirectory({ search: term, page: 1, limit: 5 });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          label={label}
          placeholder="Search by UHID, name, or phone"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="flex-1"
        />
        <Button type="button" variant="outline" className="mt-5" onClick={() => setTerm(input.trim() || undefined)}>
          Search
        </Button>
      </div>

      {lookup.isFetching && <p className="text-xs text-slate-400">Searching…</p>}

      {term && !lookup.isFetching && (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-1">
          {(lookup.data?.data ?? []).length === 0 && <p className="px-2 py-1 text-xs text-slate-400">No matches</p>}
          {(lookup.data?.data ?? []).map((patient) => (
            <button
              key={patient._id}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              onClick={() => onResolved(patient)}
            >
              <span className="font-medium text-slate-800">
                {patient.firstName} {patient.lastName}
              </span>{" "}
              <span className="text-slate-400">· {patient.uhid}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResolvedPatientCard({ patient, onClear }: { patient: AdminPatientRow; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm">
      <span>
        <span className="font-medium text-emerald-900">
          {patient.firstName} {patient.lastName}
        </span>{" "}
        <span className="text-emerald-700">· {patient.uhid}</span>
      </span>
      <button type="button" className="text-xs text-emerald-700 underline" onClick={onClear}>
        change
      </button>
    </div>
  );
}

/**
 * Merges a duplicate UHID into a primary record via
 * POST /api/admin/patients/merge (MergePatientsResult from
 * mergePatients() in admin.service.ts — one transaction repointing
 * every clinical/financial reference across 19 collections). Looks up
 * both sides through the admin patient-search endpoint rather than the
 * clinical GET /api/patients/:uhid route, since HOSPITAL_ADMIN doesn't
 * necessarily have that route's role grant.
 */
export function MergePatientsModal({ onClose }: { onClose: () => void }) {
  const [primary, setPrimary] = useState<AdminPatientRow | null>(null);
  const [duplicate, setDuplicate] = useState<AdminPatientRow | null>(null);
  const [result, setResult] = useState<MergePatientsResult | null>(null);
  const mergePatients = useMergePatients();

  const canMerge = primary && duplicate && primary._id !== duplicate._id;

  function handleMerge() {
    if (!primary || !duplicate) return;
    if (!window.confirm(`Merge ${duplicate.uhid} into ${primary.uhid}? This cannot be undone.`)) return;
    mergePatients.mutate(
      { primaryPatientId: primary._id, duplicatePatientId: duplicate._id },
      { onSuccess: setResult },
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Merge Duplicate Patient Records" widthClassName="max-w-xl">
      {result ? (
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Merged successfully. {result.primaryPatient.uhid} is now the surviving record.
          </p>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Records reassigned</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(result.recordsReassigned)
                .filter(([, count]) => count > 0)
                .map(([model, count]) => (
                  <Badge key={model} tone="blue">
                    {model}: {count}
                  </Badge>
                ))}
              {Object.values(result.recordsReassigned).every((c) => c === 0) && (
                <span className="text-xs text-slate-400">No linked records existed for the duplicate.</span>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            The <strong>primary</strong> record survives; the <strong>duplicate</strong> is deactivated and every note,
            prescription, invoice, and visit tied to it is repointed at the primary.
          </p>

          {primary ? (
            <ResolvedPatientCard patient={primary} onClear={() => setPrimary(null)} />
          ) : (
            <PatientLookup label="Primary (kept) patient" onResolved={setPrimary} />
          )}

          {duplicate ? (
            <ResolvedPatientCard patient={duplicate} onClear={() => setDuplicate(null)} />
          ) : (
            <PatientLookup label="Duplicate (merged away) patient" onResolved={setDuplicate} />
          )}

          {primary && duplicate && primary._id === duplicate._id && (
            <p className="text-xs text-red-600">Primary and duplicate must be different patients.</p>
          )}

          {mergePatients.isError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{getApiErrorMessage(mergePatients.error)}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="danger" disabled={!canMerge} isLoading={mergePatients.isPending} onClick={handleMerge}>
              Merge Records
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
