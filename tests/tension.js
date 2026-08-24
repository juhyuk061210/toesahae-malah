/* 긴장 탐지 회귀 테스트 */
"use strict";
global.window = global;
require("../questions.js");
require("../tension.js");

var T = global.Tension, Q = global.Questions;
var fail = 0, pass = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log("  실패: " + m); } }

/* 규칙 구조 */
var ids = {};
T.RULES.forEach(function (r) {
  ok(!ids[r.id], "규칙 id 중복: " + r.id);
  ids[r.id] = 1;
  ok(typeof r.when === "function", r.id + " when 없음");
  ok(typeof r.say === "function", r.id + " say 없음");
  ok(["A","B","C","suppress","safety"].indexOf(r.grade) >= 0, r.id + " 등급 이상: " + r.grade);
  ok(typeof r.rate === "number" && r.rate > 0 && r.rate <= 100, r.id + " 발생률 이상");
  ok(!!r.group, r.id + " 그룹 없음");
  ok(Array.isArray(r.needs) && r.needs.length > 0, r.id + " needs 없음");
});

/* A급은 흔하면 안 된다 — 흔한 걸 "당신만의 것"이라 부르면 신뢰를 잃는다 */
T.RULES.filter(function (r) { return r.grade === "A"; }).forEach(function (r) {
  ok(r.rate <= 15, r.id + " A급인데 발생률 " + r.rate + "% (15% 이하여야 함)");
});

/* 답이 없으면 판정하지 않는다 */
var empty = T.detect({}, {});
ok(empty.picked.length === 0, "빈 답변인데 판정이 나옴: " + empty.picked.length + "개");

/* 안전 규칙이 다른 판정을 덮는다 */
var burn = T.detect({
  quitFrequency: "daily", actions: ["none"], lastAction: "never", selfLabel: "unknown",
  drainTop: "culture", drainBottom: "money", miracle: "nothing", runway: "m1_3",
  deadline: "never", pastQuit: "first", endured: "none",
  regretStay: 2, regretLeave: 2, importance: 2, confidence: 2,
  constraint: "needNext", exception: "never", depth: "organize", sceneWhen: "forget"
}, { tenureYears: 3 });
ok(burn.mode === "safety", "소진 케이스가 안전 분기로 안 감: " + burn.mode);
ok(burn.picked.length === 1, "안전 분기인데 판정이 여러 개: " + burn.picked.length);

/* 첫 직장이면 반복 패턴을 말하지 않는다 */
var first = T.detect({
  quitFrequency: "daily", actions: ["none"], lastAction: "never", selfLabel: "tired",
  drainTop: "person", drainBottom: "money", miracle: "person", runway: "m3_6",
  deadline: "m6", pastQuit: "first", endured: "quiet",
  regretStay: 7, regretLeave: 4, importance: 8, confidence: 6,
  constraint: "needNext", exception: "m3", depth: "evidence", sceneWhen: "week"
}, { tenureYears: 1 });
["R12", "R13", "R29"].forEach(function (id) {
  ok(!first.picked.some(function (x) { return x.id === id; }),
     "첫 직장인데 반복 규칙 " + id + " 이 나옴");
});

/* 부드러운 톤을 요청하면 가장 아픈 규칙을 열지 않는다 */
var gentle = T.detect({
  quitFrequency: "daily", actions: ["none"], lastAction: "never", selfLabel: "tired",
  drainTop: "load", drainBottom: "money", miracle: "job", runway: "m6_12",
  deadline: "m6", pastQuit: "hadNext", endured: "quiet",
  regretStay: 7, regretLeave: 4, importance: 8, confidence: 6,
  constraint: "ready", exception: "m3", depth: "gentle", sceneWhen: "week"
}, { tenureYears: 4 });
ok(!gentle.picked.some(function (x) { return x.id === "R04"; }),
   "부드러운 톤 요청인데 R04(가장 아픈 규칙)가 나옴");

/* 같은 입력이면 같은 결과 — 결정성 */
var a1 = {
  quitFrequency: "w3", actions: ["editCv", "apply"], lastAction: "thisWeek", selfLabel: "noLearn",
  drainTop: "growth", drainBottom: "money", miracle: "job", runway: "m6_12",
  deadline: "never", pastQuit: "hadNext", endured: "unsung",
  regretStay: 8, regretLeave: 4, importance: 9, confidence: 8,
  constraint: "ready", exception: "thisMonth", depth: "all", sceneWhen: "month"
};
var s1 = JSON.stringify(T.detect(a1, { tenureYears: 5 }).picked.map(function (x) { return x.id; }));
for (var i = 0; i < 50; i++) {
  var s2 = JSON.stringify(T.detect(a1, { tenureYears: 5 }).picked.map(function (x) { return x.id; }));
  ok(s1 === s2, "같은 입력인데 결과가 다름");
  if (s1 !== s2) break;
}

/* 조사 처리 — "느낌를" 같은 게 나오면 안 된다 */
var BAD = ["느낌를", "않음를", "불안를", "명를", "간를", "돈를", "식를"];
Q.PHASE_A.filter(function (q) { return q.id === "drain"; })[0].options.forEach(function (o) {
  var r = T.detect({
    quitFrequency: "w1", actions: ["browse"], lastAction: "m1", selfLabel: "myFault",
    drainTop: o.v, drainBottom: (o.v === "money" ? "load" : "money"), miracle: "job",
    runway: "m3_6", deadline: "y1", pastQuit: "hadNext", endured: "quiet",
    regretStay: 5, regretLeave: 5, importance: 5, confidence: 5,
    constraint: "needNext", exception: "m3", depth: "all",
    scene: "금요일 저녁에 팀장이 갑자기 일을 던졌습니다", sceneWhen: "week"
  }, { tenureYears: 5 });
  var txt = JSON.stringify(r.all);
  BAD.forEach(function (b) { ok(txt.indexOf(b) < 0, "조사 오류(" + o.v + "): " + b); });
});

/* 완충이 필요한 규칙은 완충을 갖고 있어야 한다 */
var NEED_CUSHION = ["R01", "R06", "R07", "R12", "R13", "R15"];
T.RULES.filter(function (r) { return NEED_CUSHION.indexOf(r.id) >= 0; }).forEach(function (r) {
  var out = null;
  try { out = r.say(T.ctxOf({ quitFrequency: "daily", runway: "under1", lastAction: "m1",
                              drainTop: "person", pastQuit: "person", exception: "never" }, 6)); }
  catch (e) { out = null; }
  ok(out && out.cushion, r.id + " 완충 문장 없음 (공격으로 읽힐 수 있음)");
});

console.log("긴장 탐지 테스트: " + pass + "건 통과" + (fail ? ", " + fail + "건 실패" : ""));
process.exitCode = fail ? 1 : 0;
