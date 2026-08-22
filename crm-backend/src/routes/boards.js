const express = require('express');
const Board = require('../models/Board');
const { LINKED_ENTITY_TYPES } = require('../models/Board');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Whiteboards are internal team collaboration, same tier as chat - any
// authenticated role. Live scene sync itself goes over the /board Socket.IO
// namespace (src/realtime/index.js); these routes are list/create/rename
// plus the initial sceneData load before a socket connects.
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const boards = await Board.find().sort({ updatedAt: -1 });
    res.json({ boards });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({ board });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, linkedEntityType, linkedEntityId } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
    if (linkedEntityType && !LINKED_ENTITY_TYPES.includes(linkedEntityType)) {
      return res.status(400).json({ error: `linkedEntityType must be one of: ${LINKED_ENTITY_TYPES.join(', ')}` });
    }

    const board = await Board.create({
      title: title.trim(),
      linkedEntityType: linkedEntityType || 'none',
      linkedEntityId: linkedEntityType && linkedEntityType !== 'none' ? linkedEntityId : null,
      createdBy: req.user.id,
    });
    res.status(201).json({ board });
  } catch (err) {
    next(err);
  }
});

// Title/link only - the live scene is written by the realtime layer's
// debounced save, not this route, so two writers can't race each other's
// canvas edits against a REST edit of the same document.
router.patch('/:id', async (req, res, next) => {
  try {
    const { title, linkedEntityType, linkedEntityId } = req.body || {};
    const update = {};
    if (title !== undefined) update.title = title;
    if (linkedEntityType !== undefined) {
      if (!LINKED_ENTITY_TYPES.includes(linkedEntityType)) {
        return res.status(400).json({ error: `linkedEntityType must be one of: ${LINKED_ENTITY_TYPES.join(', ')}` });
      }
      update.linkedEntityType = linkedEntityType;
      update.linkedEntityId = linkedEntityType !== 'none' ? linkedEntityId : null;
    }

    const board = await Board.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json({ board });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
