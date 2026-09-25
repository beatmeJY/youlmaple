import { parseMonsterPaste } from "./monster-paste.js";

const sample = [
  "몬스터\t속성 약점\t속성 반감",
  "스텀프\t불\t",
  "다크스텀프\t불\t",
  '주니어레이스\t"불',
  '성"\t',
  "다크엑스텀프\t불\t",
  "리게이터\t불\t얼음",
].join("\n");

console.log(JSON.stringify(parseMonsterPaste(sample), null, 2));
console.log("stats", JSON.stringify(parseMonsterPaste("레벨\t이름\tHP\tEXP\n2\t파란 달팽이\t15\t4")));
console.log("acc", JSON.stringify(parseMonsterPaste("몬스터명\t레벨\t회피율\t필요명중률\t1레벨 당 패널티\n달팽이\t1\t10\t12\t1.5")));
