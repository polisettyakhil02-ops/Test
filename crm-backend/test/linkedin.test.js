const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNameFromLinkedInUrl } = require('../src/lib/linkedin');

test('parseNameFromLinkedInUrl extracts a name and strips a trailing id segment', () => {
  assert.equal(parseNameFromLinkedInUrl('https://www.linkedin.com/in/jordan-lee-4a2b1c9/'), 'Jordan Lee');
});

test('parseNameFromLinkedInUrl works without a trailing id segment', () => {
  assert.equal(parseNameFromLinkedInUrl('https://linkedin.com/in/jordan-lee'), 'Jordan Lee');
});

test('parseNameFromLinkedInUrl works without protocol/www', () => {
  assert.equal(parseNameFromLinkedInUrl('linkedin.com/in/casey-rivera'), 'Casey Rivera');
});

test('parseNameFromLinkedInUrl handles query strings and trailing slashes', () => {
  assert.equal(parseNameFromLinkedInUrl('https://linkedin.com/in/casey-rivera/?trk=abc'), 'Casey Rivera');
});

test('parseNameFromLinkedInUrl returns null for empty/missing input', () => {
  assert.equal(parseNameFromLinkedInUrl(''), null);
  assert.equal(parseNameFromLinkedInUrl(undefined), null);
  assert.equal(parseNameFromLinkedInUrl(null), null);
});

test('parseNameFromLinkedInUrl returns null for a non-LinkedIn URL', () => {
  assert.equal(parseNameFromLinkedInUrl('https://example.com/in/jordan-lee'), null);
});

test('parseNameFromLinkedInUrl leaves a single-segment slug alone - nothing else to fall back to', () => {
  assert.equal(parseNameFromLinkedInUrl('https://linkedin.com/in/4a2b1c9'), '4a2b1c9');
});

test('parseNameFromLinkedInUrl single-word slug is title-cased', () => {
  assert.equal(parseNameFromLinkedInUrl('https://linkedin.com/in/jordan'), 'Jordan');
});
