import assert from "node:assert/strict";
import { applyExpCoupons } from "./hunt-calc.js";

const rate = 120n;
const left = 120n;

const none = applyExpCoupons(left, rate, { double: 0, triple: 0 });
assert.equal(none.minutes, 60n);
assert.equal(none.saved, 0n);
assert.equal(none.capped, false);

const doubleOne = applyExpCoupons(left, rate, { double: 1, triple: 0 });
assert.equal(doubleOne.minutes, 45n);
assert.equal(doubleOne.saved, 15n);
assert.equal(doubleOne.cover, "");

const tripleOne = applyExpCoupons(left, rate, { double: 0, triple: 1 });
assert.equal(tripleOne.minutes, 30n);
assert.equal(tripleOne.saved, 30n);
assert.equal(tripleOne.cover, "");

const both = applyExpCoupons(300n, rate, { double: 1, triple: 1 });
assert.equal(both.minutes, 105n);
assert.equal(both.saved, 45n);
assert.equal(both.capped, false);

const doubleCover = applyExpCoupons(left, rate, { double: 10, triple: 0 });
assert.equal(doubleCover.minutes, 30n);
assert.equal(doubleCover.saved, 30n);
assert.equal(doubleCover.cover, "double");

const tripleCover = applyExpCoupons(left, rate, { double: 4, triple: 10 });
assert.equal(tripleCover.minutes, 20n);
assert.equal(tripleCover.saved, 40n);
assert.equal(tripleCover.cover, "triple");

const mixed = applyExpCoupons(left, rate, { double: 1, triple: 1 });
assert.equal(mixed.cover, "mixed");
assert.equal(mixed.minutes, 23n);
assert.equal(mixed.saved, 37n);

assert.equal(applyExpCoupons(0n, rate, { double: 2, triple: 2 }).minutes, 0n);
