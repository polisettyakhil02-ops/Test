const express = require('express');
const User = require('../models/User');
const ChatChannel = require('../models/ChatChannel');
const ChatMessage = require('../models/ChatMessage');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Internal team chat, not client/pipeline data - any authenticated role.
router.use(requireAuth);

// GET /api/users is admin-only (it's the account-management surface), but
// any team member needs to know who else exists to start a DM - a minimal
// name/role-only directory, scoped to this feature, not the full user record.
router.get('/directory', async (req, res, next) => {
  try {
    const users = await User.find({ active: true }).select('name role').sort({ name: 1 });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

function isMember(channel, userId) {
  return channel.type === 'team' || channel.memberIds.some((id) => String(id) === String(userId));
}

// 'team' channels are implicitly open to everyone rather than requiring
// every new user to be backfilled into memberIds - group/dm channels stay
// membership-scoped.
router.get('/channels', async (req, res, next) => {
  try {
    const channels = await ChatChannel.find({ $or: [{ type: 'team' }, { memberIds: req.user.id }] }).sort({
      updatedAt: -1,
    });
    res.json({ channels });
  } catch (err) {
    next(err);
  }
});

router.post('/channels', async (req, res, next) => {
  try {
    const { name, memberIds } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

    const members = Array.from(new Set([req.user.id, ...(Array.isArray(memberIds) ? memberIds : [])]));
    const channel = await ChatChannel.create({ type: 'group', name: name.trim(), memberIds: members, createdBy: req.user.id });
    res.status(201).json({ channel });
  } catch (err) {
    next(err);
  }
});

// Find-or-create a DM (2 members) or group-DM (3+), keyed by the exact
// member set so re-requesting the same pair/group returns the same channel
// instead of spawning duplicates.
router.post('/channels/direct', async (req, res, next) => {
  try {
    const { memberIds } = req.body || {};
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'memberIds is required' });
    }

    const allMembers = Array.from(new Set([req.user.id, ...memberIds])).sort();
    if (allMembers.length < 2) return res.status(400).json({ error: 'A direct channel needs at least one other member' });

    const type = allMembers.length === 2 ? 'dm' : 'group';
    let channel = await ChatChannel.findOne({ type, memberIds: { $all: allMembers, $size: allMembers.length } });
    const created = !channel;
    if (!channel) {
      channel = await ChatChannel.create({ type, memberIds: allMembers, createdBy: req.user.id });
    }

    res.status(created ? 201 : 200).json({ channel });
  } catch (err) {
    next(err);
  }
});

router.get('/channels/:id/messages', async (req, res, next) => {
  try {
    const channel = await ChatChannel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!isMember(channel, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    const filter = { channelId: channel._id };
    if (req.query.before) filter._id = { $lt: req.query.before };

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const messages = await ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('authorId', 'name');
    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
