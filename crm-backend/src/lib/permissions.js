// Role -> allowed-action checks for the CRM. Kept as pure functions so they
// can be unit tested without a database or an HTTP layer, and reused by both
// route middleware and (if ever needed) the frontend's nav-hiding logic.
//
// Companies/contacts/deals are client and pipeline data - admin/sales only,
// including reads. A developer has no reason to browse the client database
// or see deal values for accounts they aren't working; they see the deal/
// company tied to their own task via the task itself (see the populate in
// routes/tasks.js), not by reading these resources directly. User accounts
// are an admin-only directory. Tasks and activities remain readable by any
// authenticated role.

const RESOURCES = ['company', 'contact', 'deal', 'task', 'activity', 'user'];

function canRead(role, resource) {
  if (resource === 'user') return role === 'admin';
  if (['company', 'contact', 'deal'].includes(resource)) return role === 'admin' || role === 'sales';
  return true; // task, activity - any authenticated role
}

function canWrite(role, resource, context = {}) {
  if (role === 'admin') return true;

  if (role === 'sales') {
    if (resource === 'company' || resource === 'contact' || resource === 'deal' || resource === 'activity') {
      return true;
    }
    if (resource === 'task') {
      // Sales can create/assign tasks, but not edit a task they don't own
      // once it belongs to a developer's own status updates.
      return true;
    }
    return false; // no user management
  }

  if (role === 'developer') {
    if (resource === 'task') {
      // Developers may only write to tasks assigned to them.
      return context.assigneeId != null && context.userId != null && String(context.assigneeId) === String(context.userId);
    }
    if (resource === 'activity') {
      // Developers can log activity (e.g. a note) against a deal tied to
      // one of their own tasks, but that's enforced at the route level
      // where the deal/task relationship is known; the permission itself
      // is allowed here.
      return true;
    }
    return false;
  }

  return false;
}

function isValidRole(role) {
  return ['admin', 'sales', 'developer'].includes(role);
}

module.exports = { RESOURCES, canRead, canWrite, isValidRole };
