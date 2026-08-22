// Local-disk file storage. Swap this module for an S3-compatible adapter
// (same three functions) when moving off a single-process deployment -
// nothing above this layer needs to change.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function save(buffer, originalFilename) {
  ensureDir();
  // storageKey is always a fresh UUID - the original filename never touches
  // the filesystem path, so there's nothing to sanitize against traversal.
  // Only a short alphanumeric extension is carried over, for a nicer
  // download prompt.
  const rawExt = path.extname(originalFilename || '');
  const ext = /^\.[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : '';
  const storageKey = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storageKey), buffer);
  return storageKey;
}

function getPath(storageKey) {
  return path.join(UPLOAD_DIR, storageKey);
}

function remove(storageKey) {
  const filePath = getPath(storageKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = { save, getPath, remove, UPLOAD_DIR };
