const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTaskCreateInput } = require('../src/lib/taskCreate');

test('buildTaskCreateInput: admin/sales pass dealId/leadId/assigneeId through unchanged', () => {
  const input = buildTaskCreateInput('sales', 'u_sales', {
    title: 'Follow up',
    assigneeId: 'u_dev1',
    dealId: 'deal1',
    leadId: null,
    projectId: 'proj1',
  });
  assert.equal(input.assigneeId, 'u_dev1');
  assert.equal(input.dealId, 'deal1');
  assert.equal(input.leadId, null);
  assert.equal(input.projectId, 'proj1');
});

test('buildTaskCreateInput: admin/sales default missing refs to null, not undefined', () => {
  const input = buildTaskCreateInput('admin', 'u_admin', { title: 'x' });
  assert.equal(input.assigneeId, null);
  assert.equal(input.dealId, null);
  assert.equal(input.leadId, null);
  assert.equal(input.projectId, null);
  assert.equal(input.relatedTaskId, null);
});

test('buildTaskCreateInput: a developer is always self-assigned, even if the request names someone else', () => {
  const input = buildTaskCreateInput('developer', 'u_dev1', {
    title: 'Fix build',
    assigneeId: 'u_dev2', // attempting to assign someone else's work
  });
  assert.equal(input.assigneeId, 'u_dev1');
});

test('buildTaskCreateInput: a developer can never set dealId/leadId, even if the request includes them', () => {
  const input = buildTaskCreateInput('developer', 'u_dev1', {
    title: 'Bug from quick-capture',
    dealId: 'someones_deal',
    leadId: 'someones_lead',
  });
  assert.equal(input.dealId, null);
  assert.equal(input.leadId, null);
});

test('buildTaskCreateInput: a developer CAN set projectId - projects are open to every role', () => {
  const input = buildTaskCreateInput('developer', 'u_dev1', { title: 'x', projectId: 'proj1' });
  assert.equal(input.projectId, 'proj1');
});

test('buildTaskCreateInput: passes bug-specific fields through unchanged for every role', () => {
  const body = {
    title: 'Crash on submit',
    description: 'TypeError: ...',
    issueType: 'bug',
    severity: 'high',
    stepsToReproduce: '1. Click submit',
    expectedBehavior: 'Form saves',
    actualBehavior: 'App crashes',
    environment: 'production',
  };
  const devInput = buildTaskCreateInput('developer', 'u_dev1', body);
  assert.equal(devInput.issueType, 'bug');
  assert.equal(devInput.severity, 'high');
  assert.equal(devInput.description, 'TypeError: ...');
  assert.equal(devInput.stepsToReproduce, '1. Click submit');
  assert.equal(devInput.expectedBehavior, 'Form saves');
  assert.equal(devInput.actualBehavior, 'App crashes');
  assert.equal(devInput.environment, 'production');
});

test('buildTaskCreateInput: missing body defaults every ref field to null without throwing', () => {
  const input = buildTaskCreateInput('developer', 'u_dev1');
  assert.equal(input.assigneeId, 'u_dev1');
  assert.equal(input.dealId, null);
  assert.equal(input.leadId, null);
  assert.equal(input.projectId, null);
  assert.equal(input.title, undefined);
});
