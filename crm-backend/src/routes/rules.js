const express = require('express');
const Rule = require('../models/Rule');
const { EVENT_TYPES, ACTION_TYPES, CONDITION_OPS } = require('../models/Rule');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { logAudit } = require('../lib/audit');

const router = express.Router();

// Automation configuration is an admin concern, same tier as user management.
router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const rules = await Rule.find().sort({ createdAt: -1 });
    res.json({ rules, eventTypes: EVENT_TYPES, actionTypes: ACTION_TYPES, conditionOps: CONDITION_OPS });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, trigger, actions } = req.body || {};
    if (!name || !trigger || !trigger.event || !Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: 'name, trigger.event, and at least one action are required' });
    }

    const rule = await Rule.create({ name, trigger, actions, createdBy: req.user.id });
    await logAudit({ entityType: 'rule', entityId: rule._id, action: 'created', actorId: req.user.id });
    res.status(201).json({ rule });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { name, trigger, actions, enabled } = req.body || {};
    const update = {};
    if (name !== undefined) update.name = name;
    if (trigger !== undefined) update.trigger = trigger;
    if (actions !== undefined) update.actions = actions;
    if (enabled !== undefined) update.enabled = enabled;

    const rule = await Rule.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    await logAudit({
      entityType: 'rule',
      entityId: rule._id,
      action: enabled !== undefined && Object.keys(update).length === 1 ? (enabled ? 'enabled' : 'disabled') : 'updated',
      actorId: req.user.id,
    });
    res.json({ rule });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const rule = await Rule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    await logAudit({ entityType: 'rule', entityId: rule._id, action: 'deleted', actorId: req.user.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
