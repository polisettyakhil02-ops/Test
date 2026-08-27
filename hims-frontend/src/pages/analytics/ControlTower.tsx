import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { useAuthContext } from "@/context/AuthContext";
import {
  useOpdWaitingTimeStats,
  useIcuBounceBackRate,
  useSurgicalSiteInfectionRate,
  useDepartmentProfitability,
  useTopRevenueDoctors,
  usePharmacyWastage,
} from "@/hooks/useAnalytics";
import { getApiErrorMessage } from "@/lib/axios";

const ACCENT = "#38bdf8"; // sky-400
const GOOD = "#34d399"; // emerald-400
const WARN = "#fbbf24"; // amber-400
const BAD = "#f87171"; // red-400
const GRID = "#1e293b"; // slate-800
const AXIS = "#64748b"; // slate-500

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "good" | "bad" }) {
  const valueColor = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-sky-300";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = { backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" };

/**
 * The Hospital Control Tower: NABH clinical-quality indicators and
 * "Make Money Save Money" financial analytics for hospital leadership.
 * Deliberately outside `DashboardLayout` with its own dark shell — the
 * same full-screen-outside-the-normal-sidebar pattern `AdminLayout` and
 * the Phlebotomy TV board already use for a distinct persona/purpose,
 * here because a CEO-facing analytics surface reads as a different app,
 * not another item in the operational sidebar.
 */
export function ControlTower() {
  const { user } = useAuthContext();
  const [days, setDays] = useState(30);
  const range = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }, [days]);

  const opdWait = useOpdWaitingTimeStats(range);
  const icuBounce = useIcuBounceBackRate(range);
  const ssi = useSurgicalSiteInfectionRate(range);
  const departmentProfit = useDepartmentProfitability(range);
  const topDoctors = useTopRevenueDoctors(range, 8);
  const wastage = usePharmacyWastage(range, 8);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-sky-400">Hospital Control Tower</p>
          <h1 className="text-lg font-semibold text-white">Welcome back{user?.fullName ? `, ${user.fullName}` : ""}</h1>
        </div>
        <div className="flex gap-1 rounded-full border border-slate-800 bg-slate-900 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                days === d ? "bg-sky-500 text-slate-950" : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      <main className="space-y-6 px-6 py-6">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">NABH Quality Indicators</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              label="Avg. OPD Waiting Time"
              value={opdWait.data ? `${opdWait.data.avgWaitMinutes} min` : "—"}
              sub={opdWait.data ? `n=${opdWait.data.sampleSize} consultations` : opdWait.isError ? getApiErrorMessage(opdWait.error) : undefined}
            />
            <StatTile
              label="ICU Bounce-Back Rate"
              value={icuBounce.data ? `${icuBounce.data.bounceBackRatePercent}%` : "—"}
              tone={icuBounce.data && icuBounce.data.bounceBackRatePercent > 5 ? "bad" : "good"}
              sub={icuBounce.data ? `${icuBounce.data.bounceBacks} of ${icuBounce.data.totalIcuAdmissions} ICU stays` : undefined}
            />
            <StatTile
              label="Surgical Site Infection Rate"
              value={ssi.data ? `${ssi.data.infectionRatePercent}%` : "—"}
              tone={ssi.data && ssi.data.infectionRatePercent > 2 ? "bad" : "good"}
              sub={ssi.data ? `${ssi.data.infectionCount} of ${ssi.data.totalCompletedSurgeries} surgeries` : undefined}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="OPD Waiting Time Trend" subtitle="Average minutes from check-in to consultation start, per day">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={opdWait.data?.dailyTrend ?? []}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" stroke={AXIS} tick={{ fontSize: 11 }} />
                    <YAxis stroke={AXIS} tick={{ fontSize: 11 }} width={32} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="avgWaitMinutes" name="Avg wait (min)" stroke={ACCENT} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>
            </div>
            <Panel title="SSI by Procedure" subtitle="Top procedures by infection count">
              <div className="max-h-[220px] space-y-2 overflow-y-auto">
                {(ssi.data?.byProcedure ?? []).map((row) => (
                  <div key={row.procedureName} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-300">{row.procedureName}</span>
                    <span className="tabular-nums text-slate-500">
                      {row.infectionCount}/{row.surgeryCount}
                    </span>
                  </div>
                ))}
                {ssi.data && ssi.data.byProcedure.length === 0 && <p className="text-xs text-slate-600">No completed surgeries in range.</p>}
              </div>
            </Panel>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Make Money, Save Money</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="Profitability by Department" subtitle="Revenue vs. expenses, this period">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={departmentProfit.data ?? []} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke={AXIS} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="departmentName" stroke={AXIS} tick={{ fontSize: 11 }} width={110} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Revenue" fill={ACCENT} radius={[0, 3, 3, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill={WARN} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Top Revenue-Generating Doctors" subtitle="Total billed amount, this period">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topDoctors.data ?? []} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke={AXIS} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="doctorName" stroke={AXIS} tick={{ fontSize: 11 }} width={110} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                  <Bar dataKey="revenue" name="Revenue" fill={GOOD} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div className="mt-3">
            <Panel title="High-Wastage Pharmacy Items" subtitle="Expiry/damage write-offs, valued at cost price">
              {wastage.data && wastage.data.length === 0 && (
                <p className="text-xs text-slate-600">No expiry or damage write-offs logged in this period.</p>
              )}
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={wastage.data ?? []}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="drugName" stroke={AXIS} tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke={AXIS} tick={{ fontSize: 11 }} width={40} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                  <Bar dataKey="wastageValue" name="Wastage value" radius={[3, 3, 0, 0]}>
                    {(wastage.data ?? []).map((_, i) => (
                      <Cell key={i} fill={i === 0 ? BAD : WARN} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </section>
      </main>
    </div>
  );
}
