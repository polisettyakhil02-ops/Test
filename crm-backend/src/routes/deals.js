const express = require('express');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const { STAGES } = require('../models/Deal');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.ownerId) filter.ownerId = req.query.ownerId;
    if (req.query.companyId) filter.companyId = req.query.companyId;
    const deals = await Deal.find(filter).sort({ createdAt: -1 });
    res.json({ deals });
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

router.post('/', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { title, companyId, contactId, value, source, expectedCloseDate, ownerId } = req.body || {};
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
    res.status(201).json({ deal });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { title, companyId, contactId, value, source, expectedCloseDate, ownerId } = req.body || {};
    const deal = await Deal.findByIdAndUpdate(
      req.params.id,
      { title, companyId: companyId || null, contactId: contactId || null, value, source, expectedCloseDate, ownerId },
      { new: true, runValidators: true }
    );
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    res.json({ deal });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/stage', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { stage } = req.body || {};
    if (!STAGES.includes(stage)) {
      return res.status(400).json({ error: `stage must be one of: ${STAGES.join(', ')}` });
    }
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const previousStage = deal.stage;
    deal.stage = stage;
    await deal.save();

    await Activity.create({
      type: 'stage_change',
      body: `Stage changed from "${previousStage}" to "${stage}"`,
      dealId: deal._id,
      authorId: req.user.id,
    });

    res.json({ deal });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
