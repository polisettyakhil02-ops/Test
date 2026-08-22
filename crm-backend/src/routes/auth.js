const express = require('express');
const User = require('../models/User');
const { comparePassword } = require('../lib/password');
const { signToken } = require('../lib/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(
      { sub: user._id.toString(), role: user.role, name: user.name, email: user.email },
      req.app.get('jwtSecret'),
      req.app.get('jwtExpiresIn')
    );

    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
