const test = require('node:test');
const assert = require('node:assert/strict');
const { matchBattleCard, BATTLE_CARDS } = require('../src/lib/battleCards');

test('matchBattleCard returns null for an empty/missing description', () => {
  assert.equal(matchBattleCard(''), null);
  assert.equal(matchBattleCard(undefined), null);
  assert.equal(matchBattleCard(null), null);
});

test('matchBattleCard returns null when nothing matches', () => {
  assert.equal(matchBattleCard('A description about nothing relevant at all.'), null);
});

test('matchBattleCard matches the saas template on keyword hits', () => {
  const result = matchBattleCard('A cloud-based SaaS platform with a powerful API and dashboard.');
  assert.ok(result);
  assert.equal(result.industry, 'saas');
  assert.ok(result.matchedKeywords.includes('saas'));
  assert.ok(result.matchedKeywords.includes('platform'));
  assert.ok(Array.isArray(result.questions) && result.questions.length > 0);
  assert.ok(Array.isArray(result.talkingPoints) && result.talkingPoints.length > 0);
});

test('matchBattleCard matches the retail template on keyword hits', () => {
  const result = matchBattleCard('A boutique apparel and fashion retail store with several shop locations.');
  assert.ok(result);
  assert.equal(result.industry, 'retail');
});

test('matchBattleCard is case-insensitive', () => {
  const result = matchBattleCard('SAAS PLATFORM FOR TEAMS');
  assert.ok(result);
  assert.equal(result.industry, 'saas');
});

test('matchBattleCard picks the template with the most keyword hits', () => {
  // Mentions one manufacturing keyword and three saas keywords - saas should win.
  const result = matchBattleCard('An industrial company building a cloud software platform with an API.');
  assert.equal(result.industry, 'saas');
});

test('BATTLE_CARDS entries all have the expected shape', () => {
  for (const card of BATTLE_CARDS) {
    assert.equal(typeof card.industry, 'string');
    assert.ok(Array.isArray(card.keywords) && card.keywords.length > 0);
    assert.ok(Array.isArray(card.questions) && card.questions.length > 0);
    assert.ok(Array.isArray(card.talkingPoints) && card.talkingPoints.length > 0);
  }
});
