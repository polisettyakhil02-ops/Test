const test = require('node:test');
const assert = require('node:assert/strict');
const { canRead, canWrite, isValidRole } = require('../src/lib/permissions');

test('admin and sales can read companies, contacts, and deals; developer cannot', () => {
  for (const resource of ['company', 'contact', 'deal']) {
    assert.equal(canRead('admin', resource), true);
    assert.equal(canRead('sales', resource), true);
    assert.equal(canRead('developer', resource), false);
  }
});

test('only admin can read the user directory', () => {
  assert.equal(canRead('admin', 'user'), true);
  assert.equal(canRead('sales', 'user'), false);
  assert.equal(canRead('developer', 'user'), false);
});

test('any role can read tasks and activities', () => {
  for (const role of ['admin', 'sales', 'developer']) {
    assert.equal(canRead(role, 'task'), true);
    assert.equal(canRead(role, 'activity'), true);
  }
});

test('admin can write to any resource', () => {
  assert.equal(canWrite('admin', 'user'), true);
  assert.equal(canWrite('admin', 'deal'), true);
});

test('sales can write CRM resources but not users', () => {
  assert.equal(canWrite('sales', 'company'), true);
  assert.equal(canWrite('sales', 'contact'), true);
  assert.equal(canWrite('sales', 'deal'), true);
  assert.equal(canWrite('sales', 'task'), true);
  assert.equal(canWrite('sales', 'user'), false);
});

test('developer can only write tasks assigned to them', () => {
  const userId = 'dev-1';
  assert.equal(canWrite('developer', 'task', { assigneeId: userId, userId }), true);
  assert.equal(canWrite('developer', 'task', { assigneeId: 'someone-else', userId }), false);
  assert.equal(canWrite('developer', 'task', { assigneeId: null, userId }), false);
});

test('developer cannot write companies, contacts, deals, or users', () => {
  assert.equal(canWrite('developer', 'company'), false);
  assert.equal(canWrite('developer', 'contact'), false);
  assert.equal(canWrite('developer', 'deal'), false);
  assert.equal(canWrite('developer', 'user'), false);
});

test('developer can log activities', () => {
  assert.equal(canWrite('developer', 'activity'), true);
});

test('isValidRole', () => {
  assert.equal(isValidRole('admin'), true);
  assert.equal(isValidRole('sales'), true);
  assert.equal(isValidRole('developer'), true);
  assert.equal(isValidRole('superuser'), false);
});
