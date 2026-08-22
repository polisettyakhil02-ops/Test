const express = require('express');
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// Everything this searches (companies/contacts/deals) is admin/sales-only
// data - see routes/companies.js, routes/contacts.js, routes/deals.js.
router.use(requireAuth, requireRole('admin', 'sales'));

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ companies: [], contacts: [], deals: [] });

    const pattern = new RegExp(escapeRegex(q), 'i');
    const LIMIT = 6;

    const [companies, contacts, deals] = await Promise.all([
      Company.find({ name: pattern, archived: false }).limit(LIMIT),
      Contact.find({ $or: [{ name: pattern }, { email: pattern }], archived: false }).limit(LIMIT),
      Deal.find({ title: pattern, archived: false }).limit(LIMIT),
    ]);

    res.json({ companies, contacts, deals });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
