const express = require('express');
const Activity = require('../models/Activity');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.dealId) filter.dealId = req.query.dealId;
    if (req.query.contactId) filter.contactId = req.query.contactId;
    if (!filter.dealId && !filter.contactId) {
      return res.status(400).json({ error: 'dealId or contactId query param is required' });
    }
    const activities = await Activity.find(filter).sort({ createdAt: -1 });
    res.json({ activities });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { type, body, dealId, contactId } = req.body || {};
    if (!body) return res.status(400).json({ error: 'body is required' });
    if (!dealId && !contactId) {
      return res.status(400).json({ error: 'dealId or contactId is required' });
    }
    const activity = await Activity.create({
      type: type || 'note',
      body,
      dealId: dealId || null,
      contactId: contactId || null,
      authorId: req.user.id,
    });
    res.status(201).json({ activity });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
