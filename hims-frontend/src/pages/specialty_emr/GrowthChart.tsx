import type { GrowthChartEntry } from "@/types/specialtyEmr.types";

const WIDTH = 300;
const HEIGHT = 120;
const PAD = 20;

function buildScales(points: { age: number; value: number }[]) {
  const maxAge = Math.max(1, ...points.map((p) => p.age));
  const maxValue = Math.max(1, ...points.map((p) => p.value)) * 1.1;
  const x = (age: number) => PAD + (age / maxAge) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - (value / maxValue) * (HEIGHT - PAD * 2);
  return { x, y };
}

function MetricSparkline({ label, unit, points, color }: { label: string; unit: string; points: { age: number; value: number }[]; color: string }) {
  if (points.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">No {label.toLowerCase()} data yet.</div>
    );
  }
  const { x, y } = buildScales(points);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.age)} ${y(p.value)}`).join(" ");
  const latest = points[points.length - 1]!;

  return (
    <div className="rounded-md border border-slate-200 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-500">
          {latest.value} {unit}
        </p>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={`${label} over age in months`}>
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="#e2e8f0" strokeWidth={1} />
        <path d={path} stroke={color} strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={x(p.age)} cy={y(p.value)} r={2.5} fill={color} />
        ))}
      </svg>
      <p className="text-center text-[10px] text-slate-400">age in months →</p>
    </div>
  );
}

/**
 * Tracks weight/height/head-circumference against age, the three metrics
 * WHO growth charts plot. Each is its own small trend line rather than one
 * shared axis — the metrics live on wildly different scales (kg vs. cm) —
 * and deliberately doesn't overlay WHO's own percentile bands, since that
 * requires embedding the full WHO LMS reference tables; it's the child's
 * own trend line only, the same "mimic the shape, not the full standard"
 * scoping already used for the DICOM Modality Worklist in Step 13.
 */
export function GrowthChart({ entries }: { entries: GrowthChartEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.ageInMonths - b.ageInMonths);
  const weight = sorted.map((e) => ({ age: e.ageInMonths, value: e.weightKg }));
  const height = sorted.map((e) => ({ age: e.ageInMonths, value: e.heightCm }));
  const head = sorted.filter((e) => e.headCircumferenceCm !== undefined).map((e) => ({ age: e.ageInMonths, value: e.headCircumferenceCm! }));

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <MetricSparkline label="Weight" unit="kg" points={weight} color="#2563eb" />
      <MetricSparkline label="Height" unit="cm" points={height} color="#059669" />
      <MetricSparkline label="Head Circumference" unit="cm" points={head} color="#d97706" />
    </div>
  );
}
