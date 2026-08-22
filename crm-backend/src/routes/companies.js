const express = require('express');
const Company = require('../models/Company');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const companies = await Company.find().sort({ name: 1 });
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

router.post('/', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const { name, industry, website, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const company = await Company.create({ name, industry, website, notes, createdBy: req.user.id });
    res.status(201).json({ company });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
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

router.delete('/:id', requireRole('admin', 'sales'), async (req, res, next) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
