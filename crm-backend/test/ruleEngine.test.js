const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesConditions, renderTemplate, fieldValue } = require('../src/lib/ruleEngine');

test('matchesConditions is true with no conditions', () => {
  assert.equal(matchesConditions([], { stage: 'won' }), true);
  assert.equal(matchesConditions(undefined, { stage: 'won' }), true);
});

test('matchesConditions: equals', () => {
  const conditions = [{ field: 'stage', op: 'equals', value: 'won' }];
  assert.equal(matchesConditions(conditions, { stage: 'won' }), true);
  assert.equal(matchesConditions(conditions, { stage: 'lost' }), false);
});

test('matchesConditions: not_equals', () => {
  const conditions = [{ field: 'stage', op: 'not_equals', value: 'won' }];
  assert.equal(matchesConditions(conditions, { stage: 'lost' }), true);
  assert.equal(matchesConditions(conditions, { stage: 'won' }), false);
});

test('matchesConditions: all conditions must match (AND)', () => {
  const conditions = [
    { field: 'stage', op: 'equals', value: 'won' },
    { field: 'value', op: 'equals', value: '50000' },
  ];
  assert.equal(matchesConditions(conditions, { stage: 'won', value: 50000 }), true);
  assert.equal(matchesConditions(conditions, { stage: 'won', value: 1 }), false);
});

test('matchesConditions: compares populated ref docs by id', () => {
  const conditions = [{ field: 'companyId', op: 'equals', value: 'c1' }];
  assert.equal(matchesConditions(conditions, { companyId: { _id: 'c1', name: 'Acme' } }), true);
  assert.equal(matchesConditions(conditions, { companyId: { _id: 'c2', name: 'Globex' } }), false);
});

test('renderTemplate substitutes known fields', () => {
  assert.equal(renderTemplate('You were assigned "{{title}}"', { title: 'Set up staging' }), 'You were assigned "Set up staging"');
});

test('renderTemplate substitutes multiple fields', () => {
  assert.equal(renderTemplate('"{{title}}" moved to {{stage}}', { title: 'Acme deal', stage: 'proposal' }), '"Acme deal" moved to proposal');
});

test('renderTemplate leaves unknown fields blank', () => {
  assert.equal(renderTemplate('Hello {{nope}}', { title: 'x' }), 'Hello ');
});

test('renderTemplate handles an empty template', () => {
  assert.equal(renderTemplate('', { title: 'x' }), '');
  assert.equal(renderTemplate(undefined, { title: 'x' }), '');
});

test('fieldValue unwraps a populated ref doc to its id string', () => {
  assert.equal(fieldValue({ dealId: { _id: 'd1', title: 'x' } }, 'dealId'), 'd1');
  assert.equal(fieldValue({ stage: 'won' }, 'stage'), 'won');
});
