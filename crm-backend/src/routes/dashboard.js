const express = require('express');
const mongoose = require('mongoose');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const { STAGES } = require('../models/Deal');
const { STATUSES } = require('../models/Task');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function emptyStatusCounts() {
  return Object.fromEntries(STATUSES.map((status) => [status, 0]));
}

// Developers get a task-focused view scoped to their own assignments - no
// pipeline value, win rate, or other developers' workload. Admin/sales get
// the full team view. This mirrors the write-permission split in
// src/lib/permissions.js, applied to what's *read* on the dashboard too.
async function developerDashboard(userId) {
  const [tasksByStatusAgg, overdueTaskCount, tasks] = await Promise.all([
    Task.aggregate([
      { $match: { assigneeId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({ assigneeId: userId, dueDate: { $lt: new Date() }, status: { $ne: 'done' } }),
    Task.find({ assigneeId: userId }).sort({ dueDate: 1, createdAt: -1 }).limit(20),
  ]);

  const tasksByStatus = emptyStatusCounts();
  for (const row of tasksByStatusAgg) {
    tasksByStatus[row._id] = row.count;
  }
  const openTaskCount = tasksByStatus.todo + tasksByStatus.in_progress + tasksByStatus.in_review;

  return { scope: 'developer', tasksByStatus, openTaskCount, overdueTaskCount, tasks };
}

async function teamDashboard() {
  const [dealsByStageAgg, tasksByStatusAgg, tasksByAssigneeAgg, overdueTaskCount, recentActivities] =
    await Promise.all([
      Deal.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$value' } } }]),
      Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Task.aggregate([
        { $match: { assigneeId: { $ne: null } } },
        { $group: { _id: '$assigneeId', count: { $sum: 1 } } },
      ]),
      Task.countDocuments({ dueDate: { $lt: new Date() }, status: { $ne: 'done' } }),
      Activity.find().sort({ createdAt: -1 }).limit(20),
    ]);

  const dealsByStage = Object.fromEntries(STAGES.map((stage) => [stage, { count: 0, totalValue: 0 }]));
  for (const row of dealsByStageAgg) {
    dealsByStage[row._id] = { count: row.count, totalValue: row.totalValue };
  }

  const won = dealsByStage.won.count;
  const lost = dealsByStage.lost.count;
  const winRate = won + lost > 0 ? won / (won + lost) : null;

  const tasksByStatus = emptyStatusCounts();
  for (const row of tasksByStatusAgg) {
    tasksByStatus[row._id] = row.count;
  }

  const tasksByAssignee = tasksByAssigneeAgg.map((row) => ({ assigneeId: row._id, count: row.count }));

  return { scope: 'team', dealsByStage, winRate, tasksByStatus, tasksByAssignee, overdueTaskCount, recentActivities };
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
