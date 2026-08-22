const express = require('express');
const User = require('../models/User');
const { hashPassword } = require('../lib/password');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { isValidRole } = require('../lib/permissions');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: 1 });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }
    if (!isValidRole(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ name, email, passwordHash, role });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { name, role, active } = req.body || {};
    if (role && !isValidRole(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (role !== undefined) update.role = role;
    if (active !== undefined) update.active = active;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
