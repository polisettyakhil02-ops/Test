// Pure, DB-free sanitization of a POST /api/tasks body by the caller's
// role. Split out of routes/tasks.js so the one security-critical part -
// what a developer's self-service quick-capture (Developer Workstation's
// bug parser / Cmd+K quick-add) is and isn't allowed to set - is
// unit-testable without a database, same pattern as lib/permissions.js.
//
// A developer creating a task this way (as opposed to admin/sales creating
// and assigning one through the normal Tasks board) can only ever create
// work for *themselves*: assigneeId is forced to their own id regardless of
// what the request sends, and dealId/leadId are stripped entirely, since a
// developer can't otherwise read companies/contacts/deals (see
// lib/permissions.js) and shouldn't be able to point a task at one via a
// crafted request either. projectId is left alone - projects are open to
// every role (see routes/projects.js).
function buildTaskCreateInput(role, userId, body = {}) {
  const {
    title,
    description,
    priority,
    dealId,
    leadId,
    projectId,
    dueDate,
    issueType,
    severity,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    environment,
    relatedTaskId,
    assigneeId,
  } = body;

  const isDeveloper = role === 'developer';

  return {
    title,
    description,
    priority,
    assigneeId: isDeveloper ? userId : assigneeId || null,
    dealId: isDeveloper ? null : dealId || null,
    leadId: isDeveloper ? null : leadId || null,
    projectId: projectId || null,
    dueDate,
    issueType,
    severity,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    environment,
    relatedTaskId: relatedTaskId || null,
  };
}

module.exports = { buildTaskCreateInput };
