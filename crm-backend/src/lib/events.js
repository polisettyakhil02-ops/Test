// The DB-touching half of the automation engine: find enabled rules for an
// event, check their conditions (lib/ruleEngine.js), and run their actions.
// Call emitEvent() from a route right after the fact it describes has
// actually happened (deal saved, task saved, ...) - see routes/deals.js and
// routes/tasks.js.
const Rule = require('../models/Rule');
const Notification = require('../models/Notification');
const Task = require('../models/Task');
const { matchesConditions, renderTemplate, fieldValue } = require('./ruleEngine');

async function emitEvent(event, entity, context = {}) {
  let rules;
  try {
    rules = await Rule.find({ 'trigger.event': event, enabled: true });
  } catch (err) {
    console.error(`Failed to load rules for event "${event}":`, err);
    return;
  }

  for (const rule of rules) {
    if (!matchesConditions(rule.trigger.conditions, entity)) continue;
    for (const action of rule.actions) {
      try {
        await executeAction(action, entity, context);
      } catch (err) {
        // One rule's broken action shouldn't stop the request that
        // triggered it, or block any other rule/action from running.
        console.error(`Automation rule "${rule.name}" action "${action.type}" failed:`, err);
      }
    }
  }
}

async function executeAction(action, entity, context) {
  if (action.type === 'notify') {
    const targetId = fieldValue(entity, action.params.targetField);
    if (!targetId) return;
    if (context.actorId && String(targetId) === String(context.actorId)) return; // don't notify yourself

    await Notification.create({
      userId: targetId,
      type: 'automation',
      message: renderTemplate(action.params.messageTemplate, entity),
      link: renderTemplate(action.params.linkTemplate, entity) || undefined,
    });
    return;
  }

  if (action.type === 'create_task') {
    const assigneeId = action.params.assigneeField ? fieldValue(entity, action.params.assigneeField) : null;
    await Task.create({
      title: renderTemplate(action.params.titleTemplate, entity),
      assigneeId: assigneeId || null,
      dealId: action.params.linkToDeal ? entity._id : null,
      createdBy: context.actorId,
    });
  }
}

module.exports = { emitEvent };
