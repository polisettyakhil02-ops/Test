const express = require('express');
const Activity = require('../models/Activity');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// dealId/contactId/leadId activities are client/pipeline data, same
// restriction as the records themselves (routes/deals.js, routes/contacts.js,
// routes/leads.js). taskId activities (a task's comment thread) stay open to
// any authenticated role, same as the task itself.
function canAccessClientActivity(req) {
  return req.user.role === 'admin' || req.user.role === 'sales';
}

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.dealId) filter.dealId = req.query.dealId;
    if (req.query.contactId) filter.contactId = req.query.contactId;
    if (req.query.leadId) filter.leadId = req.query.leadId;
    if (req.query.taskId) filter.taskId = req.query.taskId;

    if (!filter.dealId && !filter.contactId && !filter.leadId && !filter.taskId) {
      return res.status(400).json({ error: 'dealId, contactId, leadId, or taskId query param is required' });
    }
    if ((filter.dealId || filter.contactId || filter.leadId) && !canAccessClientActivity(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const activities = await Activity.find(filter).sort({ createdAt: -1 });
    res.json({ activities });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { type, body, dealId, contactId, leadId, taskId } = req.body || {};
    if (!body) return res.status(400).json({ error: 'body is required' });
    if (!dealId && !contactId && !leadId && !taskId) {
      return res.status(400).json({ error: 'dealId, contactId, leadId, or taskId is required' });
    }
    if ((dealId || contactId || leadId) && !canAccessClientActivity(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const activity = await Activity.create({
      type: type || (taskId ? 'comment' : 'note'),
      body,
      dealId: dealId || null,
      contactId: contactId || null,
      leadId: leadId || null,
      taskId: taskId || null,
      authorId: req.user.id,
    });
    res.status(201).json({ activity });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
