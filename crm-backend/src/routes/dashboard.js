const express = require('express');
const mongoose = require('mongoose');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const AuditLog = require('../models/AuditLog');
const Company = require('../models/Company');
const User = require('../models/User');
const { STAGES } = require('../models/Deal');
const { STATUSES } = require('../models/Task');
const { requireAuth } = require('../middleware/auth');
const { weightedValueForStage, weightedPipelineValue } = require('../lib/forecast');
const {
  STALE_YELLOW_DAYS,
  buildActionItems,
  normalizeStageVelocity,
  buildFunnel,
} = require('../lib/dashboardInsights');

const router = express.Router();

router.use(requireAuth);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function emptyStatusCounts() {
  return Object.fromEntries(STATUSES.map((status) => [status, 0]));
}

// ---------- "Needs Attention" queries ----------
// Each of these returns raw, still-Mongo-shaped rows; interpreting them
// (red/yellow, message copy, sort order across sources) is pure-function
// work done in lib/dashboardInsights.js so it's unit-testable without a DB.

// Open-stage deals whose most recent Activity (or, if it has none at all,
// its own creation date) is older than the stale cutoff. The $lookup finds
// only the single newest activity per deal - there's no need to pull the
// whole history just to find one timestamp.
function getRottingDeals(now, staleCutoff) {
  return Deal.aggregate([
    { $match: { archived: { $ne: true }, stage: { $nin: ['won', 'lost'] } } },
    {
      $lookup: {
        from: Activity.collection.name,
        let: { dealId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$dealId', '$$dealId'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { _id: 0, createdAt: 1 } },
        ],
        as: 'lastActivity',
      },
    },
    {
      $addFields: {
        lastActivityAt: { $ifNull: [{ $arrayElemAt: ['$lastActivity.createdAt', 0] }, '$createdAt'] },
      },
    },
    { $match: { lastActivityAt: { $lt: staleCutoff } } },
    { $lookup: { from: Company.collection.name, localField: 'companyId', foreignField: '_id', as: 'company' } },
    { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        daysSinceActivity: { $divide: [{ $subtract: [now, '$lastActivityAt'] }, MS_PER_DAY] },
      },
    },
    { $sort: { daysSinceActivity: -1 } },
    { $limit: 25 },
    { $project: { title: 1, companyName: '$company.name', daysSinceActivity: 1 } },
  ]);
}

// Open-stage deals with no non-done Task pointing at them - i.e. nobody has
// defined what happens next. The $lookup sub-pipeline stops at the first
// match (there's nothing to gain from counting every open task), so
// `openTasks` is either `[]` or a single-element array.
function getDealsWithoutOpenTask() {
  return Deal.aggregate([
    { $match: { archived: { $ne: true }, stage: { $nin: ['won', 'lost'] } } },
    {
      $lookup: {
        from: Task.collection.name,
        let: { dealId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$dealId', '$$dealId'] }, { $ne: ['$status', 'done'] }] } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'openTasks',
      },
    },
    { $match: { openTasks: { $size: 0 } } },
    { $sort: { createdAt: 1 } }, // oldest untouched deals first
    { $limit: 25 },
    { $lookup: { from: Company.collection.name, localField: 'companyId', foreignField: '_id', as: 'company' } },
    { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
    { $project: { title: 1, companyName: '$company.name' } },
  ]);
}

// High/critical-severity bugs past their due date and not yet done.
function getOverdueHighSeverityBugs(now) {
  return Task.aggregate([
    { $match: { issueType: 'bug', severity: { $in: ['high', 'critical'] }, status: { $ne: 'done' }, dueDate: { $lt: now } } },
    { $lookup: { from: User.collection.name, localField: 'assigneeId', foreignField: '_id', as: 'assignee' } },
    { $unwind: { path: '$assignee', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        daysOverdue: { $divide: [{ $subtract: [now, '$dueDate'] }, MS_PER_DAY] },
        // Explicit rank rather than relying on 'critical' < 'high' sorting
        // alphabetically the way we want - correct today, but a landmine
        // for whoever adds a new severity value later.
        severityRank: { $cond: [{ $eq: ['$severity', 'critical'] }, 0, 1] },
      },
    },
    { $sort: { severityRank: 1, daysOverdue: -1 } },
    { $limit: 25 },
    { $project: { title: 1, severity: 1, daysOverdue: 1, assigneeName: '$assignee.name' } },
  ]);
}

// Average time a deal spends in a stage before moving to the next one,
// computed from AuditLog's stage_changed history rather than a naive
// updatedAt read (updatedAt only reflects the *most recent* change, so it
// can't tell you how long a deal sat in 'contacted' before that). For each
// stage_changed entry, $setWindowFields' $shift pulls the previous entry's
// timestamp *within the same deal* (partitioned by entityId, sorted by
// time); the very first transition for a deal has no previous entry, so it
// falls back to the deal's own createdAt - that's how long it sat in its
// starting stage before its first move.
// Requires MongoDB 5.0+ for $setWindowFields/$shift.
function getStageVelocityRaw() {
  return AuditLog.aggregate([
    { $match: { entityType: 'deal', action: 'stage_changed' } },
    { $sort: { entityId: 1, createdAt: 1 } },
    {
      $setWindowFields: {
        partitionBy: '$entityId',
        sortBy: { createdAt: 1 },
        output: { prevAt: { $shift: { output: '$createdAt', by: -1 } } },
      },
    },
    { $lookup: { from: Deal.collection.name, localField: 'entityId', foreignField: '_id', as: 'deal' } },
    { $unwind: '$deal' },
    {
      $addFields: {
        periodStart: { $ifNull: ['$prevAt', '$deal.createdAt'] },
        stage: '$changes.from',
      },
    },
    {
      $addFields: {
        durationDays: { $divide: [{ $subtract: ['$createdAt', '$periodStart'] }, MS_PER_DAY] },
      },
    },
    // Guards against a malformed audit row (no 'from' stage) or clock skew
    // producing a negative duration from polluting the average.
    { $match: { stage: { $ne: null }, durationDays: { $gte: 0 } } },
    { $group: { _id: '$stage', avgDays: { $avg: '$durationDays' }, sampleSize: { $sum: 1 } } },
  ]);
}

// Funnel inputs: which deals have ever transitioned INTO each stage
// (AuditLog), which are currently sitting in each stage (covers deals that
// have never moved, which never produced an audit row), the total
// non-archived deal count (every deal reaches 'new' by schema default, so
// that stage is reported directly rather than reconstructed), and how many
// deals are currently 'lost' (reported separately - see FUNNEL_STAGES in
// dashboardInsights.js for why 'lost' isn't a funnel stage).
function getFunnelRaw() {
  return Promise.all([
    AuditLog.aggregate([
      { $match: { entityType: 'deal', action: 'stage_changed' } },
      { $group: { _id: { entityId: '$entityId', stage: '$changes.to' } } },
      { $group: { _id: '$_id.stage', dealIds: { $addToSet: '$_id.entityId' } } },
    ]),
    Deal.aggregate([
      { $match: { archived: { $ne: true } } },
      { $group: { _id: '$stage', dealIds: { $addToSet: '$_id' } } },
    ]),
    Deal.countDocuments({ archived: { $ne: true } }),
    Deal.countDocuments({ archived: { $ne: true }, stage: 'lost' }),
  ]).then(([auditReached, currentByStage, totalDealCount, lostCount]) => ({
    auditReached,
    currentByStage,
    totalDealCount,
    lostCount,
  }));
}

// Developers get a task-focused view scoped to their own assignments - no
// pipeline value, win rate, or other developers' workload. Admin/sales get
// the full team view. This mirrors the write-permission split in
// src/lib/permissions.js, applied to what's *read* on the dashboard too.
// The "Smart Analysis" additions below (action items, funnel, stage
// velocity) are all pipeline/deal-derived, so - deliberately, not an
// oversight - they stay out of the developer scope entirely rather than
// leaking deal data developers can't otherwise see.
// Same populate shape as routes/tasks.js (not exported from there - this is
// the only other place a Task needs its project/deal/lead context inline).
const PROJECT_CONTEXT_POPULATE = { path: 'projectId', select: 'name kind' };
const DEAL_CONTEXT_POPULATE = { path: 'dealId', select: 'title companyId', populate: { path: 'companyId', select: 'name' } };
const LEAD_CONTEXT_POPULATE = { path: 'leadId', select: 'name companyName' };

async function developerDashboard(userId) {
  const [tasksByStatusAgg, overdueTaskCount, tasks, activeTask] = await Promise.all([
    Task.aggregate([
      { $match: { assigneeId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({ assigneeId: userId, dueDate: { $lt: new Date() }, status: { $ne: 'done' } }),
    Task.find({ assigneeId: userId }).sort({ dueDate: 1, createdAt: -1 }).limit(20),
    // The Developer Workstation's "Active Focus" hero card: whichever
    // in_progress task this developer touched most recently. There's no
    // concept of "the one true active task" in the schema (a developer can
    // have several in_progress at once) - most-recently-updated is the
    // closest proxy for "what am I actually working on right now."
    Task.findOne({ assigneeId: userId, status: 'in_progress' })
      .sort({ updatedAt: -1 })
      .populate(PROJECT_CONTEXT_POPULATE)
      .populate(DEAL_CONTEXT_POPULATE)
      .populate(LEAD_CONTEXT_POPULATE),
  ]);

  const tasksByStatus = emptyStatusCounts();
  for (const row of tasksByStatusAgg) {
    tasksByStatus[row._id] = row.count;
  }
  const openTaskCount = tasksByStatus.todo + tasksByStatus.in_progress + tasksByStatus.in_review;

  return { scope: 'developer', tasksByStatus, openTaskCount, overdueTaskCount, tasks, activeTask };
}

async function teamDashboard() {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_YELLOW_DAYS * MS_PER_DAY);

  const [
    dealsByStageAgg,
    tasksByStatusAgg,
    tasksByAssigneeAgg,
    overdueTaskCount,
    recentActivities,
    rottingDealsRaw,
    dealsWithoutTasksRaw,
    overdueBugsRaw,
    stageVelocityRaw,
    funnelRaw,
  ] = await Promise.all([
    Deal.aggregate([
      { $match: { archived: { $ne: true } } },
      { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$value' } } },
    ]),
    Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Task.aggregate([
      { $match: { assigneeId: { $ne: null } } },
      { $group: { _id: '$assigneeId', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({ dueDate: { $lt: now }, status: { $ne: 'done' } }),
    Activity.find().sort({ createdAt: -1 }).limit(20),
    getRottingDeals(now, staleCutoff),
    getDealsWithoutOpenTask(),
    getOverdueHighSeverityBugs(now),
    getStageVelocityRaw(),
    getFunnelRaw(),
  ]);

  const dealsByStage = Object.fromEntries(STAGES.map((stage) => [stage, { count: 0, totalValue: 0 }]));
  for (const row of dealsByStageAgg) {
    dealsByStage[row._id] = { count: row.count, totalValue: row.totalValue };
  }
  for (const stage of STAGES) {
    dealsByStage[stage].weightedValue = weightedValueForStage(dealsByStage[stage].totalValue, stage);
  }
  const weightedForecast = weightedPipelineValue(dealsByStage);

  const won = dealsByStage.won.count;
  const lost = dealsByStage.lost.count;
  const winRate = won + lost > 0 ? won / (won + lost) : null;

  const tasksByStatus = emptyStatusCounts();
  for (const row of tasksByStatusAgg) {
    tasksByStatus[row._id] = row.count;
  }

  const tasksByAssignee = tasksByAssigneeAgg.map((row) => ({ assigneeId: row._id, count: row.count }));

  const actionItems = buildActionItems({
    rottingDeals: rottingDealsRaw,
    dealsWithoutTasks: dealsWithoutTasksRaw,
    overdueBugs: overdueBugsRaw,
  });
  const stageVelocity = normalizeStageVelocity(stageVelocityRaw);
  const funnel = buildFunnel(funnelRaw);

  return {
    scope: 'team',
    dealsByStage,
    winRate,
    weightedForecast,
    tasksByStatus,
    tasksByAssignee,
    overdueTaskCount,
    recentActivities,
    actionItems,
    stageVelocity,
    funnel,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const payload = req.user.role === 'developer' ? await developerDashboard(req.user.id) : await teamDashboard();
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
