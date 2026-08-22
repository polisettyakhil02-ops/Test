// Pure, DB-free logic for the "Smart Analysis" admin dashboard. The route
// (routes/dashboard.js) does the Mongo aggregation and hands the raw rows
// here; everything about *interpreting* that data - severity thresholds,
// how the action feed is shaped and sorted, how funnel counts are merged -
// lives in this file so it's unit-testable without a database, same
// pattern as lib/forecast.js and lib/ruleEngine.js.

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
// 'lost' is excluded from the funnel visualization on purpose: a deal can be
// lost *from* any open stage, so treating it as "the stage after proposal"
// would imply an ordering that doesn't exist. It's reported separately as a
// terminal exit rate instead - see buildFunnel().
const FUNNEL_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won'];

// A deal with no logged activity in this many days is worth a nudge; past
// the red threshold it's actively rotting. Both are deliberately generous
// for a small B2B sales cycle - tune per team.
const STALE_YELLOW_DAYS = 7;
const STALE_RED_DAYS = 14;

function classifyStaleDeal(daysSinceActivity) {
  if (daysSinceActivity >= STALE_RED_DAYS) return 'red';
  if (daysSinceActivity >= STALE_YELLOW_DAYS) return 'yellow';
  return null;
}

// Any overdue high/high+ severity bug belongs on the dashboard; critical
// severity is what escalates it from a yellow nudge to a red alert - being
// a day late is expected to happen, a critical bug sitting untouched isn't.
function classifyOverdueBug(severity) {
  return severity === 'critical' ? 'red' : 'yellow';
}

function dealLabel(deal) {
  return deal.companyName ? `${deal.companyName} — ${deal.title}` : deal.title;
}

// Merges the three independent queries (rotting deals, deals with no open
// task, overdue high-severity bugs) into one normalized, pre-sorted feed the
// frontend can map over without knowing anything about where each item came
// from. Red items always sort before yellow; ties keep each source's own
// ordering (most-stale-first / most-overdue-first), which the route already
// establishes via its own $sort stages.
function buildActionItems({ rottingDeals = [], dealsWithoutTasks = [], overdueBugs = [] } = {}) {
  const items = [];

  for (const deal of rottingDeals) {
    const severity = classifyStaleDeal(deal.daysSinceActivity);
    if (!severity) continue; // defensive - the route's own $match should already guarantee this
    const days = Math.floor(deal.daysSinceActivity);
    items.push({
      id: `rotting_deal:${deal._id}`,
      category: 'rotting_deal',
      severity,
      title: dealLabel(deal),
      detail: `No activity logged in ${days} day${days === 1 ? '' : 's'}`,
      link: `/deals/${deal._id}`,
    });
  }

  for (const deal of dealsWithoutTasks) {
    items.push({
      id: `deal_no_task:${deal._id}`,
      category: 'deal_no_task',
      severity: 'yellow',
      title: dealLabel(deal),
      detail: 'No open task defines the next step',
      link: `/deals/${deal._id}`,
    });
  }

  for (const task of overdueBugs) {
    const days = Math.floor(task.daysOverdue);
    items.push({
      id: `overdue_bug:${task._id}`,
      category: 'overdue_bug',
      severity: classifyOverdueBug(task.severity),
      title: task.title,
      detail: `${task.severity} severity · ${days} day${days === 1 ? '' : 's'} overdue · ${task.assigneeName ? `assigned to ${task.assigneeName}` : 'unassigned'}`,
      link: `/tasks/${task._id}`,
    });
  }

  const weight = { red: 0, yellow: 1 };
  return items
    .map((item, index) => ({ item, index })) // stable sort: Array#sort isn't guaranteed stable pre-ES2019 engines
    .sort((a, b) => weight[a.item.severity] - weight[b.item.severity] || a.index - b.index)
    .map(({ item }) => item);
}

// Raw rows are [{ _id: stage, avgDays, sampleSize }] from the AuditLog
// $setWindowFields pipeline. 'won'/'lost' never appear (deals don't leave a
// terminal stage) and a brand-new pipeline with no completed transitions
// yet won't have rows for anything - both resolve to avgDays: null, which
// is a real, different answer from "0 days" and the frontend should render
// as "not enough data" rather than a bar of height zero.
function normalizeStageVelocity(rawRows = []) {
  const byStage = Object.fromEntries(rawRows.map((r) => [r._id, r]));
  return Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      byStage[stage]
        ? { avgDays: Math.round(byStage[stage].avgDays * 10) / 10, sampleSize: byStage[stage].sampleSize }
        : { avgDays: null, sampleSize: 0 },
    ])
  );
}

// auditReached / currentByStage are both [{ _id: stage, dealIds: [ObjectId] }].
// A deal "reached" a stage if it has an AuditLog entry transitioning INTO it
// (auditReached) or is currently sitting there (currentByStage) - the union
// matters because a deal that reached 'qualified' and then moved on to
// 'proposal' still counts toward 'qualified' having been reached, and a deal
// that has never moved at all has no AuditLog entries whatsoever.
// 'new' is special-cased to the total deal count: every deal starts there by
// schema default, which never produces a stage_changed audit entry (there's
// no "from" stage), so audit-log-only counting would silently under-count it.
function buildFunnel({ auditReached = [], currentByStage = [], totalDealCount = 0, lostCount = 0 } = {}) {
  const sets = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, new Set()]));
  for (const row of auditReached) {
    if (sets[row._id]) row.dealIds.forEach((id) => sets[row._id].add(String(id)));
  }
  for (const row of currentByStage) {
    if (sets[row._id]) row.dealIds.forEach((id) => sets[row._id].add(String(id)));
  }

  const counts = FUNNEL_STAGES.map((stage) => (stage === 'new' ? totalDealCount : sets[stage].size));

  const stages = FUNNEL_STAGES.map((stage, i) => ({
    stage,
    count: counts[i],
    dropOffFromPrev: i === 0 || counts[i - 1] === 0 ? 0 : Math.round((1 - counts[i] / counts[i - 1]) * 1000) / 10,
  }));

  return { stages, lostCount, lostRate: totalDealCount > 0 ? Math.round((lostCount / totalDealCount) * 1000) / 10 : 0 };
}

module.exports = {
  STAGES,
  FUNNEL_STAGES,
  STALE_YELLOW_DAYS,
  STALE_RED_DAYS,
  classifyStaleDeal,
  classifyOverdueBug,
  buildActionItems,
  normalizeStageVelocity,
  buildFunnel,
};
