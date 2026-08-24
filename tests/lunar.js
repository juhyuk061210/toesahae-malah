/* =========================================================
   음력 변환 회귀 테스트
   실행: node tests/lunar.js   (프로젝트 루트에서)

   정답은 manseryeok(한국천문연구원 정본 기준)으로 생성했습니다.
   lunar-table.js 를 다시 구우면 반드시 이 테스트를 통과해야 합니다.
   ========================================================= */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
global.window = {};
require(path.join(ROOT, "lunar-table.js"));
const Lunar = global.window.Lunar;

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, "lunar-fixtures.json"), "utf8")
);

let pass = 0;
const fails = [];

for (const f of fixtures) {
  const got = Lunar.toSolar(f.ly, f.lm, f.ld, f.leap);
  const ok = got && got.year === f.sy && got.month === f.sm && got.day === f.sd;
  if (ok) pass++;
  else {
    fails.push(
      `음력 ${f.ly}-${f.lm}-${f.ld}${f.leap ? "(윤)" : ""} → ` +
      `기대 ${f.sy}-${f.sm}-${f.sd}, 실제 ${got ? got.year + "-" + got.month + "-" + got.day : "null"}`
    );
  }
}

console.log(`음력 변환 회귀 테스트: ${pass}/${fixtures.length} 통과`);
if (fails.length) {
  console.log("\n실패한 케이스:");
  fails.slice(0, 15).forEach(x => console.log("  " + x));
}

/* 없는 날짜는 반드시 null 을 돌려줘야 한다 (입력 검증이 여기에 기댄다) */
const invalid = [
  [1993, 13, 1, false],   // 13월 없음
  [1993, 1, 31, false],   // 음력 달은 최대 30일
  [1900, 1, 1, false],    // 표 범위 밖
  [2100, 1, 1, false]     // 표 범위 밖
];
let guardOk = true;
for (const [y, m, d, l] of invalid) {
  if (Lunar.toSolar(y, m, d, l) !== null) {
    guardOk = false;
    console.log(`  잘못된 입력이 통과됨: ${y}-${m}-${d}`);
  }
}
console.log(`잘못된 입력 차단: ${guardOk ? "통과" : "실패"}`);

process.exit(fails.length === 0 && guardOk ? 0 : 1);
