const test = require('node:test');
const assert = require('node:assert/strict');
const { signToken, verifyToken } = require('../src/lib/jwt');

test('signToken/verifyToken round-trips a payload', () => {
  const token = signToken({ sub: 'user-1', role: 'admin' }, 'test-secret', '1h');
  const payload = verifyToken(token, 'test-secret');
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.role, 'admin');
});

test('verifyToken throws for a token signed with a different secret', () => {
  const token = signToken({ sub: 'user-1' }, 'secret-a', '1h');
  assert.throws(() => verifyToken(token, 'secret-b'));
});

test('verifyToken throws for an already-expired token', () => {
  const token = signToken({ sub: 'user-1' }, 'test-secret', '-1s');
  assert.throws(() => verifyToken(token, 'test-secret'));
});
