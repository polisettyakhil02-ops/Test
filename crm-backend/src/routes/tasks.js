const express = require('express');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { STATUSES } = require('../models/Task');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { canWrite } = require('../lib/permissions');

const router = express.Router();

// A developer can't read /api/companies or /api/deals directly (see
// routes/companies.js and routes/deals.js), so their task's linked deal
// and company are populated inline here - enough context to know which
// client a task is for, without exposing the wider pipeline.
const DEAL_CONTEXT_POPULATE = { path: 'dealId', select: 'title companyId', populate: { path: 'companyId', select: 'name' } };

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.assigneeId) filter.assigneeId = req.query.assigneeId;
    if (req.query.dealId) filter.dealId = req.query.dealId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.mine === 'true') filter.assigneeId = req.user.id;
    const tasks = await Task.find(filter).sort({ createdAt: -1 }).populate(DEAL_CONTEXT_POPULATE);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id).populate(DEAL_CONTEXT_POPULATE);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { title, description, priority, assigneeId, dealId, dueDate } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const task = await Task.create({
      title,
      description,
      priority,
      assigneeId: assigneeId || null,
      dealId: dealId || null,
      dueDate,
      createdBy: req.user.id,
    });

    if (task.assigneeId && String(task.assigneeId) !== String(req.user.id)) {
      await Notification.create({
        userId: task.assigneeId,
        type: 'task_assigned',
        message: `You were assigned "${task.title}"`,
        link: '/tasks',
      });
    }

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { title, description, priority, assigneeId, dealId, dueDate } = req.body || {};
    const previous = await Task.findById(req.params.id);
    if (!previous) return res.status(404).json({ error: 'Task not found' });

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, priority, assigneeId: assigneeId || null, dealId: dealId || null, dueDate },
      { new: true, runValidators: true }
    );

    const reassigned = task.assigneeId && String(task.assigneeId) !== String(previous.assigneeId || '');
    if (reassigned && String(task.assigneeId) !== String(req.user.id)) {
      await Notification.create({
        userId: task.assigneeId,
        type: 'task_assigned',
        message: `You were assigned "${task.title}"`,
        link: '/tasks',
      });
    }

    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const allowed =
      req.user.role === 'admin' ||
      req.user.role === 'sales' ||
      canWrite('developer', 'task', { assigneeId: task.assigneeId, userId: req.user.id });

    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    task.status = status;
    await task.save();
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
