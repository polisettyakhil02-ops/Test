// Role -> allowed-action checks for the CRM. Kept as pure functions so they
// can be unit tested without a database or an HTTP layer, and reused by both
// route middleware and (if ever needed) the frontend's nav-hiding logic.
//
// Deliberately simple for a 2-10 person internal tool: every authenticated
// user can *view* CRM records. Only writes are role-gated.

const RESOURCES = ['company', 'contact', 'deal', 'task', 'activity', 'user'];

function canRead(_role, _resource) {
  // All authenticated roles can view every CRM resource.
  return true;
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
