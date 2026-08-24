import type { PartographReading } from "@/types/specialtyEmr.types";

const WIDTH = 640;
const HEIGHT = 280;
const PAD_LEFT = 36;
const PAD_BOTTOM = 24;
const PAD_TOP = 12;
const PAD_RIGHT = 12;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const MAX_HOURS = 16;

function x(hours: number): number {
  return PAD_LEFT + (Math.min(hours, MAX_HOURS) / MAX_HOURS) * PLOT_W;
}
function y(dilationCm: number): number {
  return PAD_TOP + (1 - dilationCm / 10) * PLOT_H;
}

/**
 * The digital WHO-format partograph: cervical dilation plotted against
 * hours since labor onset, with the standard alert line (1cm/hr expected
 * progress from a 4cm baseline) and action line (the same slope, shifted
 * 4 hours right) a doctor uses to spot a labor that's falling behind.
 */
export function PartographChart({ readings, laborOnsetAt }: { readings: PartographReading[]; laborOnsetAt?: string }) {
  if (readings.length === 0) {
    return <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No partograph readings yet.</p>;
  }

  const onsetMs = laborOnsetAt ? new Date(laborOnsetAt).getTime() : new Date(readings[0]!.recordedAt).getTime();
  const points = readings
    .map((r) => ({ hours: (new Date(r.recordedAt).getTime() - onsetMs) / 3_600_000, dilation: r.cervicalDilationCm, reading: r }))
    .sort((a, b) => a.hours - b.hours);

  const dilationPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.hours)} ${y(p.dilation)}`).join(" ");
  const alertLine = `M ${x(0)} ${y(4)} L ${x(6)} ${y(10)}`;
  const actionLine = `M ${x(4)} ${y(4)} L ${x(10)} ${y(10)}`;

  return (
    <div className="rounded-md border border-slate-200 p-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Partograph: cervical dilation over time">
        {[0, 2, 4, 6, 8, 10].map((cm) => (
          <g key={cm}>
            <line x1={PAD_LEFT} y1={y(cm)} x2={WIDTH - PAD_RIGHT} y2={y(cm)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD_LEFT - 6} y={y(cm) + 3} textAnchor="end" fontSize={9} fill="#64748b">
              {cm}
            </text>
          </g>
        ))}
        {[0, 2, 4, 6, 8, 10, 12, 14, 16].map((h) => (
          <g key={h}>
            <line x1={x(h)} y1={PAD_TOP} x2={x(h)} y2={HEIGHT - PAD_BOTTOM} stroke="#f1f5f9" strokeWidth={1} />
            <text x={x(h)} y={HEIGHT - PAD_BOTTOM + 12} textAnchor="middle" fontSize={9} fill="#64748b">
              {h}h
            </text>
          </g>
        ))}

        <path d={alertLine} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
        <path d={actionLine} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
        <path d={dilationPath} stroke="#2563eb" strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.hours)} cy={y(p.dilation)} r={3.5} fill="#2563eb" />
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 px-2 pb-1 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-600" /> Cervical dilation
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-amber-500" /> Alert line
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-red-600" /> Action line
        </span>
      </div>
    </div>
  );
}
