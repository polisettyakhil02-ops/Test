const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyStaleDeal,
  classifyOverdueBug,
  buildActionItems,
  normalizeStageVelocity,
  buildFunnel,
  STAGES,
  FUNNEL_STAGES,
} = require('../src/lib/dashboardInsights');

test('classifyStaleDeal: red past 14 days, yellow from 7-14, null below 7', () => {
  assert.equal(classifyStaleDeal(20), 'red');
  assert.equal(classifyStaleDeal(14), 'red');
  assert.equal(classifyStaleDeal(10), 'yellow');
  assert.equal(classifyStaleDeal(7), 'yellow');
  assert.equal(classifyStaleDeal(6.9), null);
  assert.equal(classifyStaleDeal(0), null);
});

test('classifyOverdueBug: critical is red, everything else is yellow', () => {
  assert.equal(classifyOverdueBug('critical'), 'red');
  assert.equal(classifyOverdueBug('high'), 'yellow');
  assert.equal(classifyOverdueBug('medium'), 'yellow');
});

test('buildActionItems: maps each source into a normalized shape', () => {
  const items = buildActionItems({
    rottingDeals: [{ _id: 'd1', title: 'Website Revamp', companyName: 'Acme Corp', daysSinceActivity: 20.4 }],
    dealsWithoutTasks: [{ _id: 'd2', title: 'ERP Integration', companyName: 'Globex', daysSinceActivity: 1 }],
    overdueBugs: [{ _id: 't1', title: 'Checkout crashes', severity: 'critical', daysOverdue: 3.2, assigneeName: 'Dev One' }],
  });

  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((i) => i.category),
    ['rotting_deal', 'overdue_bug', 'deal_no_task'] // red items (rotting deal + critical bug) sort before the yellow one
  );
  assert.equal(items[0].id, 'rotting_deal:d1');
  assert.equal(items[0].title, 'Acme Corp — Website Revamp');
  assert.equal(items[0].detail, 'No activity logged in 20 days');
  assert.equal(items[0].link, '/deals/d1');
});

test('buildActionItems: red items sort before yellow, preserving each source order within a tier', () => {
  const items = buildActionItems({
    rottingDeals: [
      { _id: 'd1', title: 'A', daysSinceActivity: 8 }, // yellow
      { _id: 'd2', title: 'B', daysSinceActivity: 30 }, // red
    ],
    overdueBugs: [{ _id: 't1', title: 'C', severity: 'critical', daysOverdue: 1 }], // red
  });
  assert.deepEqual(items.map((i) => i.id), ['rotting_deal:d2', 'overdue_bug:t1', 'rotting_deal:d1']);
});

test('buildActionItems: a deal below the stale threshold is defensively dropped, not misclassified', () => {
  const items = buildActionItems({ rottingDeals: [{ _id: 'd1', title: 'Fresh deal', daysSinceActivity: 1 }] });
  assert.equal(items.length, 0);
});

test('buildActionItems: deal-without-task item always yellow, never red', () => {
  const items = buildActionItems({ dealsWithoutTasks: [{ _id: 'd1', title: 'No next step' }] });
  assert.equal(items[0].severity, 'yellow');
  assert.equal(items[0].detail, 'No open task defines the next step');
});

test('buildActionItems: handles no arguments / all-empty sources', () => {
  assert.deepEqual(buildActionItems(), []);
  assert.deepEqual(buildActionItems({}), []);
});

test('normalizeStageVelocity: fills every stage, missing ones resolve to null (not zero)', () => {
  const out = normalizeStageVelocity([
    { _id: 'new', avgDays: 2.34, sampleSize: 10 },
    { _id: 'contacted', avgDays: 5.05, sampleSize: 4 },
  ]);
  assert.deepEqual(Object.keys(out), STAGES);
  assert.deepEqual(out.new, { avgDays: 2.3, sampleSize: 10 });
  assert.deepEqual(out.contacted, { avgDays: 5.1, sampleSize: 4 });
  assert.deepEqual(out.qualified, { avgDays: null, sampleSize: 0 });
  assert.deepEqual(out.won, { avgDays: null, sampleSize: 0 });
  assert.deepEqual(out.lost, { avgDays: null, sampleSize: 0 });
});

test('normalizeStageVelocity: empty input still returns every stage as null', () => {
  const out = normalizeStageVelocity([]);
  assert.deepEqual(Object.keys(out), STAGES);
  assert.ok(Object.values(out).every((v) => v.avgDays === null && v.sampleSize === 0));
});

test('buildFunnel: "new" uses totalDealCount, not audit-log/current-stage counts', () => {
  const out = buildFunnel({
    auditReached: [{ _id: 'new', dealIds: ['a', 'b'] }], // should be ignored for 'new'
    currentByStage: [{ _id: 'new', dealIds: ['c'] }],
    totalDealCount: 10,
  });
  assert.equal(out.stages.find((s) => s.stage === 'new').count, 10);
});

test('buildFunnel: unions audit-reached and currently-there deals per stage, deduped', () => {
  const out = buildFunnel({
    auditReached: [{ _id: 'qualified', dealIds: ['x', 'y'] }],
    currentByStage: [{ _id: 'qualified', dealIds: ['y', 'z'] }], // 'y' overlaps - union size should be 3, not 4
    totalDealCount: 10,
  });
  assert.equal(out.stages.find((s) => s.stage === 'qualified').count, 3);
});

test('buildFunnel: computes drop-off relative to the immediately preceding stage', () => {
  const out = buildFunnel({
    auditReached: [
      { _id: 'contacted', dealIds: ['1', '2', '3', '4', '5', '6', '7', '8'] }, // 8 of 10
      { _id: 'qualified', dealIds: ['1', '2', '3', '4'] }, // 4 of 8
    ],
    currentByStage: [],
    totalDealCount: 10,
  });
  const [newStage, contacted, qualified] = out.stages;
  assert.equal(newStage.dropOffFromPrev, 0); // first stage has no "prev"
  assert.equal(contacted.dropOffFromPrev, 20); // 1 - 8/10 = 20%
  assert.equal(qualified.dropOffFromPrev, 50); // 1 - 4/8 = 50%
});

test('buildFunnel: never divides by zero when the previous stage has no deals', () => {
  const out = buildFunnel({ auditReached: [], currentByStage: [], totalDealCount: 0 });
  assert.ok(out.stages.every((s) => s.dropOffFromPrev === 0));
});

test('buildFunnel: reports lost separately, not as a funnel stage', () => {
  const out = buildFunnel({ totalDealCount: 20, lostCount: 5 });
  assert.deepEqual(out.stages.map((s) => s.stage), FUNNEL_STAGES);
  assert.ok(!out.stages.some((s) => s.stage === 'lost'));
  assert.equal(out.lostCount, 5);
  assert.equal(out.lostRate, 25);
});

test('buildFunnel: lostRate is zero when there are no deals at all', () => {
  const out = buildFunnel({ totalDealCount: 0, lostCount: 0 });
  assert.equal(out.lostRate, 0);
});
