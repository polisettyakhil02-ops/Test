"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { rateLimit } = require("../src/lib/rateLimit");

function fakeReqRes(ip) {
  const req = { ip };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; },
  };
  return { req, res, get statusCode() { return statusCode; }, get body() { return body; } };
}

test("allows requests under the limit", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 3 });
  let calls = 0;
  const { req, res } = fakeReqRes("1.2.3.4");
  for (let i = 0; i < 3; i++) mw(req, res, () => { calls += 1; });
  assert.equal(calls, 3);
});

test("blocks once the limit is exceeded, with a 429", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2 });
  const ctx = fakeReqRes("5.6.7.8");
  let nextCalls = 0;
  const next = () => { nextCalls += 1; };
  mw(ctx.req, ctx.res, next);
  mw(ctx.req, ctx.res, next);
  mw(ctx.req, ctx.res, next); // 3rd call, over the max of 2
  assert.equal(nextCalls, 2);
  assert.equal(ctx.statusCode, 429);
  assert.equal(ctx.body.code, "rate_limited");
});

test("tracks each IP independently", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1 });
  const a = fakeReqRes("1.1.1.1");
  const b = fakeReqRes("2.2.2.2");
  let calls = 0;
  mw(a.req, a.res, () => calls++);
  mw(b.req, b.res, () => calls++);
  assert.equal(calls, 2);
});
