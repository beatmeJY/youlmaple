import assert from "node:assert/strict";
import { compareName, sortByName } from "./format.js";

const names = ["10. 열번째", "2. 두번째", "1. 첫번째", "11. 열한번째"];
const sorted = [...names].sort(compareName);
assert.deepEqual(sorted, ["1. 첫번째", "2. 두번째", "10. 열번째", "11. 열한번째"]);

const rows = sortByName(names.map((name) => ({ name })));
assert.deepEqual(
  rows.map((row) => row.name),
  ["1. 첫번째", "2. 두번째", "10. 열번째", "11. 열한번째"],
);
assert.deepEqual(
  names,
  ["10. 열번째", "2. 두번째", "1. 첫번째", "11. 열한번째"],
);
