"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { editDistance, fuzzyTokenEq, nearestMatch } = require("../src/lib/fuzzy");

test("editDistance treats an adjacent transposition as 1 edit, not 2", () => {
  assert.equal(editDistance("cancle", "cancel"), 1);
  assert.equal(editDistance("reciept", "receipt"), 1);
});

test("editDistance is 0 for identical strings and counts simple edits correctly", () => {
  assert.equal(editDistance("term", "term"), 0);
  assert.equal(editDistance("reopn", "reopen"), 1); // one deletion
  assert.equal(editDistance("feee", "fee"), 1); // one insertion
});

test("fuzzyTokenEq keeps short words exact-only", () => {
  assert.equal(fuzzyTokenEq("to", "to"), true);
  assert.equal(fuzzyTokenEq("ot", "to"), false); // 2-char word: no fuzz budget
});

test("fuzzyTokenEq does not let 6-7 letter words collide with unrelated words", () => {
  // Regression test for the report~record / parent~payment collision found
  // while building the reference prototype (spec section 3.3).
  assert.equal(fuzzyTokenEq("report", "record"), false);
  assert.equal(fuzzyTokenEq("parent", "payment"), false);
});

test("fuzzyTokenEq still catches real typos on 6-7 letter words", () => {
  assert.equal(fuzzyTokenEq("cancle", "cancel"), true);
  assert.equal(fuzzyTokenEq("reciept", "receipt"), true);
  assert.equal(fuzzyTokenEq("consolidatd", "consolidated"), true);
});

test("nearestMatch finds an exact substring hit for free", () => {
  assert.equal(nearestMatch("students in RC Puram", ["RC Puram", "Uppal"]), "RC Puram");
});

test("nearestMatch resolves a typo'd multi-word name via sliding window", () => {
  assert.equal(nearestMatch("fee report for Ravi Kumr", ["Ravi Kumar", "Priya Sharma"]), "Ravi Kumar");
  assert.equal(nearestMatch("show class consolidatd report for Kukatpaly", ["RC Puram", "Kukatpally", "Uppal"]), "Kukatpally");
});

test("nearestMatch returns null rather than forcing a bad guess", () => {
  assert.equal(nearestMatch("asdkj not a real query", ["Ravi Kumar", "Priya Sharma"]), null);
});
