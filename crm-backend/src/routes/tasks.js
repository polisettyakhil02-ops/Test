const express = require('express');
const Task = require('../models/Task');
const { STATUSES } = require('../models/Task');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { canWrite } = require('../lib/permissions');
const { logAudit } = require('../lib/audit');
const { emitEvent } = require('../lib/events');

const router = express.Router();

// A developer can't read /api/companies or /api/deals directly (see
// routes/companies.js and routes/deals.js), so their task's linked deal
// and company are populated inline here - enough context to know which
// client a task is for, without exposing the wider pipeline.
const DEAL_CONTEXT_POPULATE = { path: 'dealId', select: 'title companyId', populate: { path: 'companyId', select: 'name' } };
// Same reasoning for leads (routes/leads.js is admin/sales only too).
const LEAD_CONTEXT_POPULATE = { path: 'leadId', select: 'name companyName' };
// Projects are open to every role (see routes/projects.js), so this is just
// for convenience - a board card shouldn't need a second request to show
// which project a task belongs to.
const PROJECT_CONTEXT_POPULATE = { path: 'projectId', select: 'name kind' };

// Same rule as status updates: admin/sales always, or the assignee working
// their own task.
function canEditTaskWork(req, task) {
  return (
    req.user.role === 'admin' ||
    req.user.role === 'sales' ||
    canWrite('developer', 'task', { assigneeId: task.assigneeId, userId: req.user.id })
  );
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.assigneeId) filter.assigneeId = req.query.assigneeId;
    if (req.query.dealId) filter.dealId = req.query.dealId;
    if (req.query.leadId) filter.leadId = req.query.leadId;
    if (req.query.projectId) filter.projectId = req.query.projectId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.issueType) filter.issueType = req.query.issueType;
    if (req.query.unassigned === 'true') filter.assigneeId = null;
    if (req.query.mine === 'true') filter.assigneeId = req.user.id;
    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .populate(DEAL_CONTEXT_POPULATE)
      .populate(LEAD_CONTEXT_POPULATE)
      .populate(PROJECT_CONTEXT_POPULATE);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate(DEAL_CONTEXT_POPULATE)
      .populate(LEAD_CONTEXT_POPULATE)
      .populate(PROJECT_CONTEXT_POPULATE);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const {
      title,
      description,
      priority,
      assigneeId,
      dealId,
      leadId,
      projectId,
      dueDate,
      issueType,
      severity,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      environment,
      relatedTaskId,
    } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const task = await Task.create({
      title,
      description,
      priority,
      assigneeId: assigneeId || null,
      dealId: dealId || null,
      leadId: leadId || null,
      projectId: projectId || null,
      dueDate,
      issueType,
      severity,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      environment,
      relatedTaskId: relatedTaskId || null,
      createdBy: req.user.id,
    });

    await logAudit({ entityType: 'task', entityId: task._id, action: 'created', actorId: req.user.id });

    await emitEvent('task.created', task.toObject(), { actorId: req.user.id });
    if (task.assigneeId) {
      await emitEvent('task.assigned', task.toObject(), { actorId: req.user.id });
    }

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

// Fields that are ObjectId refs the caller may explicitly clear by sending
// an empty/falsy value (e.g. unassigning) - everything else is left alone
// unless present in the body. A key simply absent from the body (e.g. the
// board's reassign action only sends {assigneeId}) must never silently wipe
// an unrelated field like dealId/leadId to null.
const NULLABLE_REF_FIELDS = new Set(['assigneeId', 'dealId', 'leadId', 'projectId', 'relatedTaskId']);
const UPDATABLE_TASK_FIELDS = [
  'title',
  'description',
  'priority',
  'assigneeId',
  'dealId',
  'leadId',
  'projectId',
  'dueDate',
  'issueType',
  'severity',
  'stepsToReproduce',
  'expectedBehavior',
  'actualBehavior',
  'environment',
  'relatedTaskId',
];

router.put('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const previous = await Task.findById(req.params.id);
    if (!previous) return res.status(404).json({ error: 'Task not found' });

    const update = {};
    for (const field of UPDATABLE_TASK_FIELDS) {
      if (body[field] === undefined) continue;
      update[field] = NULLABLE_REF_FIELDS.has(field) ? body[field] || null : body[field];
    }

    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });

    const reassigned = task.assigneeId && String(task.assigneeId) !== String(previous.assigneeId || '');

    await logAudit({
      entityType: 'task',
      entityId: task._id,
      action: reassigned ? 'reassigned' : 'updated',
      actorId: req.user.id,
      changes: reassigned ? { from: previous.assigneeId, to: task.assigneeId } : undefined,
    });

    if (reassigned) {
      await emitEvent('task.assigned', task.toObject(), { actorId: req.user.id });
    }

    res.json({ task });
  } catch (err) {
    next(err);
  }
});

// Lets any authenticated user - critically, a developer, who otherwise can't
// reassign tasks (PUT /:id is admin/sales only) - pick up an unclaimed item
// from the Backlog view. Deliberately narrow: it only ever sets assigneeId
// to the caller themselves, and only while the task is still unassigned, so
// it can't be used to reassign someone else's work.
router.patch('/:id/claim', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.assigneeId) return res.status(409).json({ error: 'Task is already assigned' });

    task.assigneeId = req.user.id;
    await task.save();
    await logAudit({
      entityType: 'task',
      entityId: task._id,
      action: 'reassigned',
      actorId: req.user.id,
      changes: { from: null, to: task.assigneeId },
    });
    await emitEvent('task.assigned', task.toObject(), { actorId: req.user.id });

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
    if (!canEditTaskWork(req, task)) return res.status(403).json({ error: 'Forbidden' });

    const previousStatus = task.status;
    task.status = status;
    await task.save();
    await logAudit({
      entityType: 'task',
      entityId: task._id,
      action: 'status_changed',
      actorId: req.user.id,
      changes: { from: previousStatus, to: status },
    });

    // previousStatus isn't a real field on Task - it only exists here so a
    // rule's message/condition can reference {{previousStatus}}.
    await emitEvent('task.status_changed', { ...task.toObject(), previousStatus }, { actorId: req.user.id });

    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/subtasks', async (req, res, next) => {
  try {
    const { title } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canEditTaskWork(req, task)) return res.status(403).json({ error: 'Forbidden' });

    task.subtasks.push({ title: title.trim(), done: false });
    await task.save();
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/subtasks/:subtaskId', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canEditTaskWork(req, task)) return res.status(403).json({ error: 'Forbidden' });

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ error: 'Subtask not found' });

    const { done, title } = req.body || {};
    if (done !== undefined) subtask.done = done;
    if (title !== undefined && title.trim()) subtask.title = title.trim();

    await task.save();
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/subtasks/:subtaskId', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canEditTaskWork(req, task)) return res.status(403).json({ error: 'Forbidden' });

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ error: 'Subtask not found' });

    task.subtasks.pull({ _id: req.params.subtaskId });
    await task.save();
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/snippets', async (req, res, next) => {
  try {
    const { label, language, code } = req.body || {};
    if (!code || !code.trim()) return res.status(400).json({ error: 'code is required' });

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canEditTaskWork(req, task)) return res.status(403).json({ error: 'Forbidden' });

    task.codeSnippets.push({ label, language: language || 'text', code, addedBy: req.user.id });
    await task.save();
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/snippets/:snippetId', async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!canEditTaskWork(req, task)) return res.status(403).json({ error: 'Forbidden' });

    const snippet = task.codeSnippets.id(req.params.snippetId);
    if (!snippet) return res.status(404).json({ error: 'Snippet not found' });

    task.codeSnippets.pull({ _id: req.params.snippetId });
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
    await logAudit({ entityType: 'task', entityId: task._id, action: 'deleted', actorId: req.user.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
