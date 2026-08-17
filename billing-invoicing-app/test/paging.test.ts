import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pageNumbers } from '@/components/pagination'
import { paged, pageOffset } from '@/lib/paging'
import { isRecordId } from '@/lib/record-id'
import { endOfMonth, oneYearBefore, pageParam, startOfMonth } from '@/lib/dto'

/**
 * The small pure pieces behind pagination and the period pickers. Each has an
 * edge case that is easy to get wrong and invisible until someone hits it: page
 * zero, February, December.
 */

describe('page numbers', () => {
  test('a short list shows every page', () => {
    assert.deepEqual(pageNumbers(1, 5), [1, 2, 3, 4, 5])
  })

  test('a long list keeps first, last and a window around the current page', () => {
    assert.deepEqual(pageNumbers(6, 20), [1, null, 5, 6, 7, null, 20])
  })

  test('near the start there is no leading ellipsis', () => {
    assert.deepEqual(pageNumbers(2, 20), [1, 2, 3, null, 20])
  })

  test('near the end there is no trailing ellipsis', () => {
    assert.deepEqual(pageNumbers(19, 20), [1, null, 18, 19, 20])
  })

  test('no page is ever listed twice', () => {
    for (let page = 1; page <= 20; page += 1) {
      const numbers = pageNumbers(page, 20).filter((n): n is number => n !== null)
      assert.equal(new Set(numbers).size, numbers.length, `duplicate at page ${page}`)
    }
  })

  test('a single page is just that page', () => {
    assert.deepEqual(pageNumbers(1, 1), [1])
  })
})

describe('offsets', () => {
  test('page 1 starts at the beginning', () => {
    assert.equal(pageOffset(1, 50), 0)
    assert.equal(pageOffset(3, 50), 100)
  })

  test('a page below 1 is clamped rather than producing a negative offset', () => {
    assert.equal(pageOffset(0, 50), 0)
    assert.equal(pageOffset(-4, 50), 0)
  })

  test('a partial last page still counts as a page', () => {
    assert.equal(paged([], 69, 1, 50).pageCount, 2)
    assert.equal(paged([], 100, 1, 50).pageCount, 2)
    assert.equal(paged([], 101, 1, 50).pageCount, 3)
  })

  test('an empty list is one page, not zero', () => {
    // A control that reports "page 1 of 0" reads as broken.
    assert.equal(paged([], 0, 1, 50).pageCount, 1)
  })
})

describe('the ?page= parameter', () => {
  test('reads a number', () => {
    assert.equal(pageParam('3'), 3)
  })

  test('anything that is not a page number falls back to 1', () => {
    assert.equal(pageParam('not-a-number'), 1)
    assert.equal(pageParam(''), 1)
    assert.equal(pageParam(undefined), 1)
    assert.equal(pageParam('0'), 1)
    assert.equal(pageParam('-2'), 1)
    assert.equal(pageParam('Infinity'), 1)
  })

  test('a repeated parameter uses the first value', () => {
    assert.equal(pageParam(['2', '9']), 2)
  })

  test('a fractional page is floored, not rejected', () => {
    assert.equal(pageParam('2.7'), 2)
  })
})

describe('record ids from the URL', () => {
  test('a real uuid is accepted, in either case', () => {
    assert.equal(isRecordId('1480f47d-427e-42b4-8fbb-3a7fbf33b9d5'), true)
    assert.equal(isRecordId('1480F47D-427E-42B4-8FBB-3A7FBF33B9D5'), true)
  })

  test('the shapes a typo’d or hand-edited URL actually produces are rejected', () => {
    // Each of these reached PostgreSQL before the guard existed and came back
    // as a 500 rather than a 404.
    assert.equal(isRecordId('not-a-uuid'), false)
    assert.equal(isRecordId('undefined'), false)
    assert.equal(isRecordId(''), false)
    assert.equal(isRecordId('1480f47d-427e-42b4-8fbb'), false)
    assert.equal(isRecordId('1480f47d427e42b48fbb3a7fbf33b9d5'), false)
    assert.equal(isRecordId('1480f47d-427e-42b4-8fbb-3a7fbf33b9d5x'), false)
    assert.equal(isRecordId('zzzzzzzz-427e-42b4-8fbb-3a7fbf33b9d5'), false)
  })

  test('it does not match a uuid buried in a longer string', () => {
    assert.equal(isRecordId(' 1480f47d-427e-42b4-8fbb-3a7fbf33b9d5'), false)
    assert.equal(isRecordId("1480f47d-427e-42b4-8fbb-3a7fbf33b9d5' OR 1=1--"), false)
  })
})

describe('period boundaries', () => {
  test('a month runs from the 1st to its real last day', () => {
    assert.equal(startOfMonth('2026-08-17'), '2026-08-01')
    assert.equal(endOfMonth('2026-08-17'), '2026-08-31')
  })

  test('30-day months are not assumed to be 31', () => {
    assert.equal(endOfMonth('2026-09-05'), '2026-09-30')
  })

  test('February knows about leap years', () => {
    assert.equal(endOfMonth('2027-02-01'), '2027-02-28')
    assert.equal(endOfMonth('2028-02-01'), '2028-02-29')
  })

  test('December does not roll into the next year', () => {
    assert.equal(endOfMonth('2026-12-09'), '2026-12-31')
  })

  test('a year back from 29 February lands on a date that exists', () => {
    assert.equal(oneYearBefore('2026-08-17'), '2025-08-17')
    assert.equal(oneYearBefore('2028-02-29'), '2027-03-01')
  })
})
