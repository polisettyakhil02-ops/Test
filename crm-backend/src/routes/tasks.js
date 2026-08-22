const express = require('express');
const Task = require('../models/Task');
const { STATUSES } = require('../models/Task');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { canWrite } = require('../lib/permissions');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.assigneeId) filter.assigneeId = req.query.assigneeId;
    if (req.query.dealId) filter.dealId = req.query.dealId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.mine === 'true') filter.assigneeId = req.user.id;
    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
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
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { title, description, priority, assigneeId, dealId, dueDate } = req.body || {};
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, priority, assigneeId: assigneeId || null, dealId: dealId || null, dueDate },
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
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
