const express = require('express');
const multer = require('multer');
const Attachment = require('../models/Attachment');
const { ENTITY_TYPES } = require('../models/Attachment');
const storage = require('../lib/storage');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB - generous for docs/screenshots, not for video
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

// Client-data attachments (deal/contact) follow the same admin/sales-only
// rule as the records themselves; task attachments stay open to any role,
// same as the task itself.
function canAccessEntity(req, entityType) {
  if (entityType === 'task') return true;
  return req.user.role === 'admin' || req.user.role === 'sales';
}

router.get('/', async (req, res, next) => {
  try {
    const { entityType, entityId } = req.query;
    if (!ENTITY_TYPES.includes(entityType) || !entityId) {
      return res.status(400).json({ error: `entityType (one of ${ENTITY_TYPES.join(', ')}) and entityId are required` });
    }
    if (!canAccessEntity(req, entityType)) return res.status(403).json({ error: 'Forbidden' });

    const attachments = await Attachment.find({ entityType, entityId }).sort({ createdAt: -1 });
    res.json({ attachments });
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { entityType, entityId } = req.body || {};
    if (!ENTITY_TYPES.includes(entityType) || !entityId) {
      return res.status(400).json({ error: `entityType (one of ${ENTITY_TYPES.join(', ')}) and entityId are required` });
    }
    if (!canAccessEntity(req, entityType)) return res.status(403).json({ error: 'Forbidden' });
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const storageKey = storage.save(req.file.buffer, req.file.originalname);
    const attachment = await Attachment.create({
      entityType,
      entityId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      storageKey,
      uploadedBy: req.user.id,
    });

    res.status(201).json({ attachment });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (!canAccessEntity(req, attachment.entityType)) return res.status(403).json({ error: 'Forbidden' });

    res.download(storage.getPath(attachment.storageKey), attachment.filename);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (!canAccessEntity(req, attachment.entityType)) return res.status(403).json({ error: 'Forbidden' });

    const isOwnerOrPrivileged =
      req.user.role === 'admin' || req.user.role === 'sales' || String(attachment.uploadedBy) === String(req.user.id);
    if (!isOwnerOrPrivileged) return res.status(403).json({ error: 'Forbidden' });

    storage.remove(attachment.storageKey);
    await attachment.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
