const express = require('express');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const { STAGES } = require('../models/Deal');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { logAudit } = require('../lib/audit');
const { emitEvent } = require('../lib/events');

const router = express.Router();

// Same reasoning as routes/companies.js - the pipeline (deal values, stages,
// which accounts are active) is admin/sales only. A developer sees the deal
// their own task is linked to via the task itself (routes/tasks.js), not by
// browsing this endpoint.
router.use(requireAuth, requireRole('admin', 'sales'));

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.archived === 'true' ? { archived: true } : { archived: false };
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.ownerId) filter.ownerId = req.query.ownerId;
    if (req.query.companyId) filter.companyId = req.query.companyId;
    const deals = await Deal.find(filter).sort({ createdAt: -1 });
    res.json({ deals });
  } catch (err) {
    next(err);
  }
});

// Deal registration conflict check: is there already open activity on this
// company? Registered before /:id so "conflicts" isn't swallowed as an id.
router.get('/conflicts', async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const openDeals = await Deal.find({ companyId, archived: false, stage: { $nin: ['won', 'lost'] } })
      .sort({ updatedAt: -1 })
      .populate('ownerId', 'name email');

    const withActivity = await Promise.all(
      openDeals.map(async (deal) => {
        const lastActivity = await Activity.findOne({ dealId: deal._id }).sort({ createdAt: -1 });
        return {
          _id: deal._id,
          title: deal.title,
          stage: deal.stage,
          value: deal.value,
          owner: deal.ownerId,
          updatedAt: deal.updatedAt,
          lastActivity: lastActivity
            ? { type: lastActivity.type, body: lastActivity.body, createdAt: lastActivity.createdAt }
            : null,
        };
      })
    );

    res.json({ hasConflict: withActivity.length > 0, openDeals: withActivity });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    res.json({ deal });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, companyId, contactId, value, source, expectedCloseDate, ownerId, registeredDespiteConflict } =
      req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });

    const deal = await Deal.create({
      title,
      companyId: companyId || null,
      contactId: contactId || null,
      value,
      source,
      expectedCloseDate,
      ownerId: ownerId || req.user.id,
      createdBy: req.user.id,
    });

    if (registeredDespiteConflict) {
      await Activity.create({
        type: 'note',
        body: 'Deal registered despite existing open activity on this company.',
        dealId: deal._id,
        authorId: req.user.id,
      });
    }

    await logAudit({
      entityType: 'deal',
      entityId: deal._id,
      action: 'created',
      actorId: req.user.id,
      changes: registeredDespiteConflict ? { registeredDespiteConflict: true } : undefined,
    });

    await emitEvent('deal.created', deal.toObject(), { actorId: req.user.id });

    res.status(201).json({ deal });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, companyId, contactId, value, source, expectedCloseDate, ownerId } = req.body || {};
    const deal = await Deal.findByIdAndUpdate(
      req.params.id,
      { title, companyId: companyId || null, contactId: contactId || null, value, source, expectedCloseDate, ownerId },
      { new: true, runValidators: true }
    );
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    await logAudit({ entityType: 'deal', entityId: deal._id, action: 'updated', actorId: req.user.id });
    res.json({ deal });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/stage', async (req, res, next) => {
  try {
    const { stage, reason } = req.body || {};
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ error: `stage must be one of: ${STAGES.join(', ')}` });
    }
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const previousStage = deal.stage;
    deal.stage = stage;
    await deal.save();

    let body = `Stage changed from "${previousStage}" to "${stage}"`;
    if (stage === 'lost' && reason) body += ` — reason: ${reason}`;
    await Activity.create({ type: 'stage_change', body, dealId: deal._id, authorId: req.user.id });

    await logAudit({
      entityType: 'deal',
      entityId: deal._id,
      action: 'stage_changed',
      actorId: req.user.id,
      changes: { from: previousStage, to: stage, reason: reason || undefined },
    });

    // previousStage isn't a real field on Deal - it only exists here so a
    // rule's message/condition can reference {{previousStage}}.
    await emitEvent('deal.stage_changed', { ...deal.toObject(), previousStage }, { actorId: req.user.id });

    res.json({ deal });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/archive', async (req, res, next) => {
  try {
    const deal = await Deal.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    await logAudit({ entityType: 'deal', entityId: deal._id, action: 'archived', actorId: req.user.id });
    res.json({ deal });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/restore', async (req, res, next) => {
  try {
    const deal = await Deal.findByIdAndUpdate(req.params.id, { archived: false }, { new: true });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    await logAudit({ entityType: 'deal', entityId: deal._id, action: 'restored', actorId: req.user.id });
    res.json({ deal });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    await logAudit({ entityType: 'deal', entityId: deal._id, action: 'deleted', actorId: req.user.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
