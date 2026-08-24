/* =========================================================
   리포트 품질 계측
   ---------------------------------------------------------
   서로 다른 사주 × 서로 다른 답변으로 리포트를 대량 생성해
   "분량"과 "개인차"를 숫자로 잰다.

     node tools/quality.js            요약
     node tools/quality.js --full     챕터별 상세
   ========================================================= */
"use strict";
global.window = global;
require("../solar-terms.js");
require("../lunar-table.js");
require("../saju.js");
require("../diagnosis.js");

var Diagnosis = global.Diagnosis;
var NOW = new Date("2026-08-21T00:00:00+09:00");

/* ---------- 표본 ---------- */
function births() {
  var out = [], y, m, d, h;
  for (y = 1975; y <= 2000; y += 5) {
    for (m = 1; m <= 12; m += 3) {
      for (d = 3; d <= 27; d += 12) {
        for (h = 1; h <= 21; h += 10) {
          out.push({
            year: y, month: m, day: d, hour: h, minute: 0,
            hourKnown: true, gender: (out.length % 2) ? "female" : "male",
            calendar: "solar", isLeapMonth: false
          });
        }
      }
    }
  }
  return out;
}

var ANSWER_SETS = [
  { quitFrequency:"daily",  quitReason:"tired",    tenure:"3_5", nextPlan:"rest",      preparation:"nothing",  mainQuestion:"stay" },
  { quitFrequency:"weekly", quitReason:"growth",   tenure:"5_7", nextPlan:"switch",    preparation:"resume",   mainQuestion:"what" },
  { quitFrequency:"daily",  quitReason:"pay",      tenure:"1_3", nextPlan:"move",      preparation:"applying", mainQuestion:"when" },
  { quitFrequency:"rarely", quitReason:"etc",      tenure:"o10", nextPlan:"unknown",   preparation:"nothing",  mainQuestion:"stay" },
  { quitFrequency:"hard",   quitReason:"people",   tenure:"u1",  nextPlan:"freelance", preparation:"browsing", mainQuestion:"own"  }
];

/* ---------- 텍스트 추출 ---------- */
function textOf(sec) {
  var parts = [];
  if (sec.headline) parts.push(sec.headline);
  if (sec.body) parts.push(sec.body);
  if (Array.isArray(sec.list)) parts.push(sec.list.join(" "));
  if (Array.isArray(sec.windows)) {
    sec.windows.forEach(function (w) { if (w && w.note) parts.push(w.note); });
  }
  if (sec.extra) parts.push(String(sec.extra));
  return parts.join(" ").trim();
}

/* 문장 단위로 쪼갠다 — 중복률의 단위 */
function sentences(t) {
  return t.split(/(?<=[.!?])\s+|\n+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length >= 6; });
}

/* ---------- 실행 ---------- */
var B = births();
var reports = [];
B.forEach(function (b, i) {
  var a = ANSWER_SETS[i % ANSWER_SETS.length];
  reports.push(Diagnosis.diagnose({ name: "표본", answers: a, birth: b, now: NOW }));
});

var CH = reports[0].paidSections.length;
var perChapter = [];
for (var c = 0; c < CH; c++) {
  var texts = reports.map(function (r) { return textOf(r.paidSections[c]); });
  var lens = texts.map(function (t) { return t.length; });
  perChapter.push({
    no: c + 1,
    title: reports[0].paidSections[c].title,
    avgLen: Math.round(lens.reduce(function (a, b) { return a + b; }, 0) / lens.length),
    minLen: Math.min.apply(null, lens),
    maxLen: Math.max.apply(null, lens),
    variants: new Set(texts).size
  });
}

/* 리포트 전체 문장 중복률: 표본 전체에서 서로 겹치는 문장의 비율 */
var allSent = [], uniqSent = new Set();
reports.forEach(function (r) {
  var t = r.paidSections.map(textOf).join(" ");
  sentences(t).forEach(function (s) { allSent.push(s); uniqSent.add(s); });
});
var dupRate = allSent.length ? (1 - uniqSent.size / allSent.length) : 0;

var totals = reports.map(function (r) {
  return r.paidSections.reduce(function (a, s) { return a + textOf(s).length; }, 0);
});
var avgTotal = Math.round(totals.reduce(function (a, b) { return a + b; }, 0) / totals.length);

/* 유형·매트릭스 분포 */
var typeCnt = {}, mtxCnt = {};
reports.forEach(function (r) {
  typeCnt[r.type.key] = (typeCnt[r.type.key] || 0) + 1;
  mtxCnt[r.matrix.key] = (mtxCnt[r.matrix.key] || 0) + 1;
});

/* ---------- 출력 ---------- */
var N = reports.length;
console.log("리포트 품질 계측 — 표본 " + N + "건 (생일 " + B.length + " × 답변 " + ANSWER_SETS.length + "종 순환)");
console.log("=".repeat(64));
console.log("유료 본문 평균 총량   " + avgTotal + "자   (최소 " + Math.min.apply(null,totals) + " / 최대 " + Math.max.apply(null,totals) + ")");
console.log("문장 중복률           " + (dupRate * 100).toFixed(1) + "%   (낮을수록 개인화됨)");
console.log("고유 문장 수          " + uniqSent.size + " / " + allSent.length);
console.log("유형 분포             " + JSON.stringify(typeCnt));
console.log("매트릭스 분포         " + JSON.stringify(mtxCnt));

if (process.argv.indexOf("--full") >= 0) {
  console.log("\n챕터별");
  console.log("-".repeat(64));
  console.log("  " + "챕터".padEnd(30) + "평균  최소  최대   서로 다른 문안");
  perChapter.forEach(function (p) {
    var flag = p.variants === 1 ? "  ← 전원 동일" : "";
    console.log("  " + (p.no + ". " + p.title).slice(0, 28).padEnd(30) +
      String(p.avgLen).padStart(4) + String(p.minLen).padStart(6) + String(p.maxLen).padStart(6) +
      String(p.variants).padStart(8) + "종" + flag);
  });
}

var fixed = perChapter.filter(function (p) { return p.variants === 1; }).length;
console.log("\n판정");
console.log("-".repeat(64));
console.log("  분량      " + (avgTotal >= 4000 ? "통과" : "미달") + "   목표 4,000자 이상 / 현재 " + avgTotal + "자");
console.log("  개인화    " + (dupRate <= 0.25 ? "통과" : "미달") + "   목표 중복률 25% 이하 / 현재 " + (dupRate*100).toFixed(1) + "%");
console.log("  고정문안  " + (fixed === 0 ? "통과" : "미달") + "   목표 0개 / 현재 " + fixed + "개 챕터가 전원 동일");

process.exitCode = (avgTotal >= 4000 && dupRate <= 0.25 && fixed === 0) ? 0 : 1;
