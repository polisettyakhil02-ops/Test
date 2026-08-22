const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, comparePassword } = require('../src/lib/password');

test('hashPassword produces a hash that comparePassword accepts', async () => {
  const hash = await hashPassword('correct-horse');
  assert.notEqual(hash, 'correct-horse');
  assert.equal(await comparePassword('correct-horse', hash), true);
});

test('comparePassword rejects a wrong password', async () => {
  const hash = await hashPassword('correct-horse');
  assert.equal(await comparePassword('wrong-password', hash), false);
});
