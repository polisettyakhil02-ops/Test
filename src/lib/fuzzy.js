"use strict";

/**
 * Tier 2 - Entity Resolver matching layer (see docs/Ask_the_ERP_Developer_Spec.pdf, section 3).
 *
 * Edit distance is Damerau-Levenshtein (adjacent-transposition aware), not plain
 * Levenshtein: a swapped pair of letters - "cancle"/"cancel", "reciept"/"receipt" -
 * is the most common real typo, and plain Levenshtein scores it as 2 edits (two
 * substitutions) when a human reading it perceives one slip. Counting it as the 1
 * edit it actually is keeps the distance budget tight enough to stay precise.
 */

function editDistance(a, b) {
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Typo budget scales with word length: 1-2 letter words require an exact hit so
 * "as"/"to"/"or" don't fuzz-match everything. Words up to 7 letters get 1 edit -
 * two edits on a word that short (e.g. budget 2 on "record"/"payment") starts
 * colliding with unrelated real words ("report"~"record", "parent"~"payment" are
 * both 2 edits apart) and produces wrong matches instead of catching typos. Only
 * genuinely long words (8+) get 2, where 2 edits is still a small fraction of the
 * word. See docs/Ask_the_ERP_Developer_Spec.pdf section 3.3 for the worked example
 * this calibration is based on.
 */
function allowedDistance(word) {
  if (word.length <= 2) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

function fuzzyTokenEq(token, word) {
  if (!token || !word) return false;
  if (token === word) return true;
  const d = allowedDistance(word);
  if (d === 0) return false;
  if (Math.abs(token.length - word.length) > d) return false;
  return editDistance(token, word) <= d;
}

function fuzzyAny(tokens, words) {
  return words.some((w) => tokens.some((t) => fuzzyTokenEq(t, w)));
}

/**
 * Nearest-match search over a candidate list (student names, branches, ticket
 * pages, bus routes): tries an exact substring hit first (free, zero false
 * positives), then slides a same-width window of query tokens across each
 * multi-word candidate and scores it by normalized edit distance, returning the
 * closest candidate under the threshold.
 */
function nearestMatch(rawQuery, candidates, maxNormDist = 0.32) {
  const lower = String(rawQuery).toLowerCase();
  const exact = candidates.find((c) => lower.includes(c.toLowerCase()));
  if (exact) return exact;

  const qTokens = tokenize(rawQuery);
  let best = null;
  let bestScore = Infinity;
  for (const cand of candidates) {
    const candTokens = tokenize(cand);
    const width = candTokens.length;
    const candStr = candTokens.join(" ");
    for (let i = 0; i + width <= qTokens.length; i++) {
      const windowStr = qTokens.slice(i, i + width).join(" ");
      const norm = editDistance(windowStr, candStr) / candStr.length;
      if (norm < bestScore) {
        bestScore = norm;
        best = cand;
      }
    }
  }
  return bestScore <= maxNormDist ? best : null;
}

module.exports = { editDistance, tokenize, allowedDistance, fuzzyTokenEq, fuzzyAny, nearestMatch };
