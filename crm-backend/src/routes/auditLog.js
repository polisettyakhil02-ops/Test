const express = require('express');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.entityId) filter.entityId = req.query.entityId;

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const entries = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
