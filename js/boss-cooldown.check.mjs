import assert from "node:assert/strict";
import { DAY_MS, bossState, bosses, bossTimeParts, formatClock, formatPossible, formatRemain, formatStamp, readBossTime, todaySlot } from "./boss-cooldown.js";

const pianus = bosses.find((boss) => boss.key === "pianus");
const papulatus = bosses.find((boss) => boss.key === "papulatus");
const at = new Date(2026, 8, 18, 23, 29, 28, 0);
const nextPianus = at.getTime() + 7 * DAY_MS;

assert.equal(formatStamp(at), "2026-09-18 23:29:28");
assert.equal(formatStamp(nextPianus), "2026-09-25 23:29:28");

const before = bossState(at, nextPianus - 1, pianus);
assert.equal(before.ready, false);
assert.equal(before.soon, true);
assert.equal(before.next, nextPianus);

const exact = bossState(at, nextPianus, pianus);
assert.equal(exact.ready, true);
assert.equal(exact.soon, false);

const dayBefore = bossState(at, new Date(2026, 8, 24, 23, 29, 28, 0).getTime(), pianus);
assert.equal(dayBefore.ready, false);
assert.equal(dayBefore.soon, false);

const morning = bossState(at, new Date(2026, 8, 25, 0, 0, 0, 0).getTime(), pianus);
assert.equal(morning.ready, false);
assert.equal(morning.soon, true);
assert.deepEqual(morning.hints, ["오늘"]);

const hourBefore = bossState(at, nextPianus - 60 * 60 * 1000, pianus);
assert.deepEqual(hourBefore.hints, ["오늘", "곧"]);
assert.deepEqual(bossState(at, nextPianus - 60 * 60 * 1000 - 1, pianus).hints, ["오늘"]);
assert.deepEqual(bossState(at, nextPianus - 1, pianus).hints, ["오늘", "곧"]);

assert.equal(bossState(String(at.getTime()), nextPianus - 1, pianus).ready, false);
assert.equal(bossState(at.toISOString(), nextPianus, pianus).ready, true);

const fresh = bossState(null, nextPianus, pianus);
assert.deepEqual(fresh, { ready: true, soon: false, hints: [], last: null, next: null });

const papAt = new Date(2026, 8, 24, 23, 29, 28, 0);
const nextPap = papAt.getTime() + DAY_MS;
assert.equal(bossState(papAt, nextPap - 60 * 60 * 1000 - 1, papulatus).soon, false);
assert.equal(bossState(papAt, nextPap - 60 * 60 * 1000, papulatus).soon, true);
assert.deepEqual(bossState(papAt, nextPap - 60 * 60 * 1000, papulatus).hints, ["곧"]);
assert.equal(bossState(papAt, nextPap - 1, papulatus).ready, false);
assert.equal(bossState(papAt, nextPap, papulatus).ready, true);
assert.equal(bossState(papAt, nextPap, papulatus).soon, false);

const rift = bosses.find((boss) => boss.key === "rift");
assert.equal(rift.cooldownMs, papulatus.cooldownMs);
assert.equal(rift.soon, papulatus.soon);
assert.equal(bossState(papAt, nextPap - 60 * 60 * 1000, rift).soon, true);
assert.equal(bossState(papAt, nextPap - 1, rift).ready, false);
assert.equal(bossState(papAt, nextPap, rift).ready, true);

const local = new Date(2026, 8, 18, 23, 29, 28, 0);
assert.deepEqual(bossTimeParts(local), { year: 2026, month: 9, day: 18, hour: 23, minute: 29 });
assert.equal(readBossTime({ year: "2026", month: "09", day: "18", hour: "23", minute: "29" }).value, new Date(2026, 8, 18, 23, 29, 0, 0).getTime());
assert.equal(readBossTime({ year: "", month: "9", day: "18", hour: "23", minute: "29" }).error, "년을 입력해 주세요.");
assert.equal(readBossTime({ year: "2026", month: "2", day: "31", hour: "1", minute: "0" }).error, "없는 날짜입니다.");
assert.equal(readBossTime({ year: "2026", month: "9", day: "18", hour: "24", minute: "0" }).error, "시는 0부터 23까지 입력해 주세요.");

assert.equal(formatClock(local), "23:29:28");
assert.equal(formatPossible(new Date(2026, 8, 26, 1, 20, 0)), "1시 20분");
assert.equal(formatPossible(new Date(2026, 8, 26, 1, 20, 5)), "1시 20분");
assert.equal(formatPossible(new Date(2026, 8, 26, 1, 0, 45)), "1시");
assert.equal(formatPossible(new Date(2026, 8, 26, 13, 5, 0)), "13시 5분");
assert.equal(formatRemain(2 * 60 * 60 * 1000 + 4 * 60 * 1000 + 12 * 1000), "2시간 4분 12초");
assert.equal(formatRemain(2 * 60 * 60 * 1000 + 5 * 1000), "2시간 0분 5초");
assert.equal(formatRemain(4 * 60 * 1000 + 12 * 1000), "4분 12초");
assert.equal(formatRemain(12 * 1000), "12초");
assert.equal(formatRemain(500), "1초");
assert.equal(formatRemain(0), "0초");

const eight = new Date(2026, 8, 25, 8, 0, 0, 0).getTime();
const laterToday = todaySlot(papAt, eight, papulatus);
assert.equal(laterToday.include, true);
assert.equal(laterToday.ready, false);
assert.equal(laterToday.at, nextPap);
assert.equal(formatClock(laterToday.at), "23:29:28");

const already = todaySlot(papAt, nextPap, papulatus);
assert.deepEqual(already, { include: true, ready: true, at: null });

const doneToday = todaySlot(new Date(2026, 8, 25, 1, 0, 0, 0), eight, rift);
assert.deepEqual(doneToday, { include: false, ready: false, at: null });

const never = todaySlot(null, eight, papulatus);
assert.deepEqual(never, { include: true, ready: true, at: null });

const pianusToday = todaySlot(at, eight, pianus);
assert.equal(pianusToday.include, true);
assert.equal(pianusToday.ready, false);
assert.equal(pianusToday.at, nextPianus);

const pianusTomorrow = todaySlot(at, new Date(2026, 8, 24, 12, 0, 0, 0).getTime(), pianus);
assert.deepEqual(pianusTomorrow, { include: false, ready: false, at: null });

console.log("boss cooldown ok");
