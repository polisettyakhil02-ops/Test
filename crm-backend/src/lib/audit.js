const AuditLog = require('../models/AuditLog');

// A broken audit write should never take down the mutation it's recording -
// log and move on rather than throwing into the route's try/catch.
async function logAudit({ entityType, entityId, action, actorId, changes }) {
  try {
    await AuditLog.create({ entityType, entityId, action, actorId, changes });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

module.exports = { logAudit };
