const test = require('node:test');
const assert = require('node:assert/strict');
const { rateLimit } = require('../src/lib/rateLimit');

function mockReqRes(ip) {
  const req = { ip };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  return { req, res, getStatus: () => statusCode, getBody: () => body };
}

test('allows requests under the limit', () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 3 });
  const { req, res, getStatus } = mockReqRes('1.2.3.4');
  let calls = 0;
  for (let i = 0; i < 3; i++) middleware(req, res, () => calls++);
  assert.equal(calls, 3);
  assert.equal(getStatus(), null);
});

test('blocks requests over the limit with 429', () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 2 });
  const { req, res, getStatus, getBody } = mockReqRes('5.6.7.8');
  let calls = 0;
  const next = () => calls++;
  middleware(req, res, next);
  middleware(req, res, next);
  middleware(req, res, next);
  assert.equal(calls, 2);
  assert.equal(getStatus(), 429);
  assert.equal(getBody().code, 'rate_limited');
});

test('tracks each IP independently', () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 1 });
  let calls = 0;
  const next = () => calls++;
  middleware(mockReqRes('a').req, mockReqRes('a').res, next);
  middleware(mockReqRes('b').req, mockReqRes('b').res, next);
  assert.equal(calls, 2);
});

test('allows requests again once the window elapses', async () => {
  const middleware = rateLimit({ windowMs: 20, max: 1 });
  const { req, res } = mockReqRes('9.9.9.9');
  let calls = 0;
  const next = () => calls++;
  middleware(req, res, next);
  await new Promise((r) => setTimeout(r, 30));
  middleware(req, res, next);
  assert.equal(calls, 2);
});
