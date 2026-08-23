import { format } from "date-fns";
import { usePatientTimeline } from "@/hooks/usePatientTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { getApiErrorMessage } from "@/lib/axios";
import type { BadgeTone } from "@/components/ui/Badge";
import type { TimelineEntry, TimelineEntryType, VitalSigns } from "@/types/emr.types";

const TYPE_TONE: Record<TimelineEntryType, BadgeTone> = {
  OPD_VISIT: "blue",
  ADMISSION: "purple",
  CLINICAL_NOTE: "gray",
  DIAGNOSIS: "red",
  PRESCRIPTION: "green",
  LAB_ORDER: "yellow",
  DISCHARGE_SUMMARY: "purple",
};

function latestVitals(entries: TimelineEntry[]): VitalSigns | undefined {
  return entries.find((entry) => entry.type === "OPD_VISIT" && entry.data.vitals)?.data.vitals;
}

function VitalsStrip({ vitals }: { vitals: VitalSigns }) {
  const items: Array<[string, string | number | undefined]> = [
    ["Temp", vitals.temperatureCelsius && `${vitals.temperatureCelsius}°C`],
    ["Pulse", vitals.pulseRatePerMin && `${vitals.pulseRatePerMin}/min`],
    ["BP", vitals.systolicBP && vitals.diastolicBP && `${vitals.systolicBP}/${vitals.diastolicBP}`],
    ["SpO2", vitals.spo2Percent && `${vitals.spo2Percent}%`],
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md bg-slate-50 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-sm font-medium text-slate-800">{value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}

/** Left panel of DoctorDesk: recent vitals, active diagnoses, and the full chronological timeline — all from GET /api/emr/:patientId/timeline. */
export function PatientHistoryPanel({ patientId }: { patientId: string }) {
  const timelineQuery = usePatientTimeline(patientId);

  if (timelineQuery.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (timelineQuery.isError) {
    return <ErrorState message={getApiErrorMessage(timelineQuery.error)} />;
  }

  const entries = timelineQuery.data ?? [];
  const vitals = latestVitals(entries);
  const activeDiagnoses = entries.filter((entry) => entry.type === "DIAGNOSIS").slice(0, 6);

  return (
    <div className="space-y-4">
      {vitals && (
        <Card>
          <CardHeader>
            <CardTitle>Most Recent Vitals</CardTitle>
          </CardHeader>
          <CardContent>
            <VitalsStrip vitals={vitals} />
          </CardContent>
        </Card>
      )}

      {activeDiagnoses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Diagnoses</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {activeDiagnoses.map((entry) => (
              <Badge key={entry.refId} tone="red">
                {(entry.data.icd10Code as string) ?? "—"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Medical Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <EmptyState title="No history yet" description="This patient has no recorded visits, notes, or orders." />
          ) : (
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {entries.map((entry) => (
                <li key={`${entry.type}-${entry.refId}`} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500" />
                  <div className="flex items-center gap-2">
                    <Badge tone={TYPE_TONE[entry.type]}>{entry.type.replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-slate-400">{format(new Date(entry.date), "dd MMM yyyy, HH:mm")}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700">{entry.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
