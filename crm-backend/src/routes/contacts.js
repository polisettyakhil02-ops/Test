const express = require('express');
const Contact = require('../models/Contact');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.companyId) filter.companyId = req.query.companyId;
    const contacts = await Contact.find(filter).sort({ name: 1 });
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { name, email, phone, companyId, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const contact = await Contact.create({ name, email, phone, companyId: companyId || null, notes, createdBy: req.user.id });
    res.status(201).json({ contact });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { name, email, phone, companyId, notes } = req.body || {};
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, companyId: companyId || null, notes },
      { new: true, runValidators: true }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
