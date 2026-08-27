import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePatientByUhid } from "@/hooks/usePatient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import { EncounterType } from "@/types/common.types";
import { PatientHistoryPanel } from "./PatientHistoryPanel";
import { ClinicalNoteForm } from "./ClinicalNoteForm";
import { PrescriptionBuilder } from "./PrescriptionBuilder";

function PatientLookupForm() {
  const [uhidInput, setUhidInput] = useState("");
  const navigate = useNavigate();

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Open Patient Chart</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (uhidInput.trim()) navigate(`/emr/${uhidInput.trim()}`);
          }}
        >
          <Input
            placeholder="Enter patient UHID"
            value={uhidInput}
            onChange={(event) => setUhidInput(event.target.value)}
            className="flex-1"
          />
          <Button type="submit">Open</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Split-screen clinical workspace: history/timeline on the left,
 * SOAP note + prescription builder for the active encounter on the
 * right. The active encounter's OPD visit / admission id is entered
 * manually below (no "today's queue" picker exists yet) — a small,
 * deliberate scope simplification, not a placeholder: everything past
 * that point is a real, working form wired to the Step 3 API.
 */
export function DoctorDesk() {
  const { uhid } = useParams<{ uhid: string }>();
  const patientQuery = usePatientByUhid(uhid);

  const [encounterType, setEncounterType] = useState<EncounterType>(EncounterType.OPD);
  const [encounterRefId, setEncounterRefId] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  if (!uhid) {
    return <PatientLookupForm />;
  }

  if (patientQuery.isLoading) {
    return <FullPageSpinner />;
  }

  if (patientQuery.isError || !patientQuery.data) {
    return <ErrorState message={patientQuery.error ? getApiErrorMessage(patientQuery.error) : "Patient not found"} />;
  }

  const patient = patientQuery.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-slate-500">
              UHID {patient.uhid} · {patient.gender} · DOB {new Date(patient.dateOfBirth).toLocaleDateString()}
            </p>
          </div>
          {patient.knownAllergySummary && <Badge tone="red">Allergies: {patient.knownAllergySummary}</Badge>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <PatientHistoryPanel patientId={patient._id} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Encounter</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  checked={encounterType === EncounterType.OPD}
                  onChange={() => {
                    setEncounterType(EncounterType.OPD);
                    setEncounterRefId("");
                  }}
                />
                OPD
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  checked={encounterType === EncounterType.IPD}
                  onChange={() => {
                    setEncounterType(EncounterType.IPD);
                    setEncounterRefId("");
                  }}
                />
                IPD
              </label>
              <Input
                label={encounterType === EncounterType.OPD ? "OPD Visit ID" : "Admission ID"}
                value={encounterRefId}
                onChange={(event) => setEncounterRefId(event.target.value)}
                className="min-w-[240px] flex-1"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SOAP Note</CardTitle>
            </CardHeader>
            <CardContent>
              <ClinicalNoteForm
                patientId={patient._id}
                encounterType={encounterType}
                opdVisitId={encounterType === EncounterType.OPD ? encounterRefId || undefined : undefined}
                admissionId={encounterType === EncounterType.IPD ? encounterRefId || undefined : undefined}
                onSaved={setActiveNoteId}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prescription Builder</CardTitle>
            </CardHeader>
            <CardContent>
              <PrescriptionBuilder
                patientId={patient._id}
                clinicalNoteId={activeNoteId}
                encounterType={encounterType === EncounterType.IPD ? "IPD" : "OPD"}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
