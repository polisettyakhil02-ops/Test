const test = require('node:test');
const assert = require('node:assert/strict');
const { STAGE_PROBABILITIES, weightedValueForStage, weightedPipelineValue } = require('../src/lib/forecast');

test('weightedValueForStage applies the stage probability', () => {
  assert.equal(weightedValueForStage(100000, 'qualified'), 50000);
  assert.equal(weightedValueForStage(100000, 'proposal'), 75000);
  assert.equal(weightedValueForStage(100000, 'new'), 10000);
});

test('weightedValueForStage: won counts in full, lost counts as zero', () => {
  assert.equal(weightedValueForStage(50000, 'won'), 50000);
  assert.equal(weightedValueForStage(50000, 'lost'), 0);
});

test('weightedValueForStage rounds to the nearest whole number', () => {
  assert.equal(weightedValueForStage(999, 'contacted'), 250); // 249.75 -> 250
});

test('weightedValueForStage treats an unknown stage as zero probability', () => {
  assert.equal(weightedValueForStage(100000, 'not_a_real_stage'), 0);
});

test('STAGE_PROBABILITIES covers every stage used by weightedValueForStage in this test file', () => {
  assert.deepEqual(Object.keys(STAGE_PROBABILITIES).sort(), ['contacted', 'lost', 'new', 'proposal', 'qualified', 'won']);
});

test('weightedPipelineValue sums only open stages (excludes won and lost)', () => {
  const dealsByStage = {
    new: { count: 1, totalValue: 10000 },
    contacted: { count: 1, totalValue: 20000 },
    qualified: { count: 1, totalValue: 40000 },
    proposal: { count: 1, totalValue: 100000 },
    won: { count: 1, totalValue: 500000 },
    lost: { count: 1, totalValue: 300000 },
  };
  // 10000*0.1 + 20000*0.25 + 40000*0.5 + 100000*0.75 = 1000 + 5000 + 20000 + 75000
  assert.equal(weightedPipelineValue(dealsByStage), 101000);
});

test('weightedPipelineValue is zero for an empty pipeline', () => {
  assert.equal(weightedPipelineValue({}), 0);
});

test('weightedPipelineValue is zero when only won/lost deals exist', () => {
  const dealsByStage = { won: { count: 2, totalValue: 80000 }, lost: { count: 1, totalValue: 5000 } };
  assert.equal(weightedPipelineValue(dealsByStage), 0);
});
