// Pure logic for the automation engine - condition matching and template
// rendering - kept free of Mongoose/DB access so it's unit-testable the same
// way as lib/permissions.js. The DB-touching half (querying Rule, creating
// Notification/Task) lives in lib/events.js.

function fieldValue(entity, field) {
  const value = entity[field];
  // Deal/task fields are often ObjectIds or populated ref docs - compare and
  // template on their string form so a rule author can write "u123" instead
  // of worrying about ObjectId vs. string.
  return value != null && typeof value === 'object' && value._id ? String(value._id) : value;
}

function matchesConditions(conditions, entity) {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((cond) => {
    const actual = fieldValue(entity, cond.field);
    const matches = String(actual) === String(cond.value);
    return cond.op === 'not_equals' ? !matches : matches;
  });
}

// {{field}} substitution against top-level entity fields - deliberately not
// nested/dotted paths, so a rule author can only reference what's directly
// on the triggering record (title, stage, value, _id, ...).
function renderTemplate(template, entity) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_match, field) => {
    const value = fieldValue(entity, field);
    return value == null ? '' : String(value);
  });
}

module.exports = { matchesConditions, renderTemplate, fieldValue };
