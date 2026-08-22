const express = require('express');
const Project = require('../models/Project');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

const router = express.Router();

// Unlike companies/contacts/deals, projects aren't client data - they're the
// shared internal workspace for developer work and creative/campaign
// planning (e.g. an internal build, or a brand campaign like Finale). Any
// authenticated role can read and write them, same as tasks and activities.
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.archived === 'true' ? { archived: true } : { archived: false };
    const projects = await Project.find(filter).sort({ name: 1 });
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description, kind } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const project = await Project.create({ name, description, kind, createdBy: req.user.id });
    await logAudit({ entityType: 'project', entityId: project._id, action: 'created', actorId: req.user.id });
    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, description, kind } = req.body || {};
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { name, description, kind },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await logAudit({ entityType: 'project', entityId: project._id, action: 'updated', actorId: req.user.id });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

// Separate from the general update above so a developer jotting notes
// doesn't need write access to name/description/kind - just the scratchpad.
router.patch('/:id/scratchpad', async (req, res, next) => {
  try {
    const { scratchpad } = req.body || {};
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { scratchpad: scratchpad || '' },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/archive', async (req, res, next) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await logAudit({ entityType: 'project', entityId: project._id, action: 'archived', actorId: req.user.id });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/restore', async (req, res, next) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { archived: false }, { new: true });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await logAudit({ entityType: 'project', entityId: project._id, action: 'restored', actorId: req.user.id });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
