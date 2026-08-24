/* =========================================================
   사주 엔진 회귀 테스트
   실행: node tests/run.js   (프로젝트 루트에서)

   fixtures.json 의 정답은 manseryeok(천문 계산) 기준으로
   생성했습니다. 엔진을 고친 뒤 반드시 이 테스트를 통과해야 합니다.
   ========================================================= */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
global.window = {};
require(path.join(ROOT, "solar-terms.js"));
require(path.join(ROOT, "saju.js"));
const Saju = global.window.Saju;

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8"));

let pass = 0;
const fails = [];

for (const f of fixtures) {
  const chart = Saju.computeChart({
    year: f.y, month: f.mo, day: f.d,
    hourKnown: true, hour: f.h, minute: 0
  });
  const got = ["year", "month", "day", "hour"]
    .map(k => Saju.pillarText(chart.pillars[k]).ko).join(" ");

  if (got === f.expect) pass++;
  else fails.push(`${f.y}-${String(f.mo).padStart(2,"0")}-${String(f.d).padStart(2,"0")} ${f.h}시\n    기대: ${f.expect}\n    실제: ${got}`);
}

console.log(`사주 명식 회귀 테스트: ${pass}/${fixtures.length} 통과`);
if (fails.length) {
  console.log("\n실패한 케이스:");
  fails.forEach(x => console.log("  " + x));
}

/* 결정성(determinism) 확인 — 같은 입력은 항상 같은 결과여야 함 */
const probe = { year: 1988, month: 5, day: 20, hourKnown: true, hour: 9, minute: 0 };
const first = JSON.stringify(Saju.computeChart(probe).pillars);
let stable = true;
for (let i = 0; i < 200; i++) {
  if (JSON.stringify(Saju.computeChart(probe).pillars) !== first) { stable = false; break; }
}
console.log(`결정성 검사(200회): ${stable ? "통과" : "실패 — 같은 입력에 다른 명식이 나옵니다"}`);

process.exit(fails.length === 0 && stable ? 0 : 1);
