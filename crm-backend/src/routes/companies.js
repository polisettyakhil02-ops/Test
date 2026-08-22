const express = require('express');
const Company = require('../models/Company');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// Companies are client/account data - not something a developer needs to
// browse. Every route here (reads included) is admin/sales; a developer
// still sees the client a task belongs to via the task itself (see
// routes/tasks.js populating dealId), just not the wider database.
router.use(requireAuth, requireRole('admin', 'sales'));

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.archived === 'true' ? { archived: true } : { archived: false };
    const companies = await Company.find(filter).sort({ name: 1 });
    res.json({ companies });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, industry, website, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const company = await Company.create({ name, industry, website, notes, createdBy: req.user.id });
    res.status(201).json({ company });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, industry, website, notes } = req.body || {};
    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { name, industry, website, notes },
      { new: true, runValidators: true }
    );
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/archive', async (req, res, next) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/restore', async (req, res, next) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, { archived: false }, { new: true });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
