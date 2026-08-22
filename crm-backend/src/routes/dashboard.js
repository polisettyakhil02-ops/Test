const express = require('express');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const { STAGES } = require('../models/Deal');
const { STATUSES } = require('../models/Task');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
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

    const tasksByStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const row of tasksByStatusAgg) {
      tasksByStatus[row._id] = row.count;
    }

    const tasksByAssignee = tasksByAssigneeAgg.map((row) => ({ assigneeId: row._id, count: row.count }));

    res.json({
      dealsByStage,
      winRate,
      tasksByStatus,
      tasksByAssignee,
      overdueTaskCount,
      recentActivities,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
