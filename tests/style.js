/* =========================================================
   문체 회귀 테스트 — 손님 화면에 나가면 안 되는 것들
   =========================================================
   여기서 잡는 건 "취향"이 아니라 명백한 사고다.
   반말이 섞이거나, 빈 변수가 문장에 새거나, 조사가 깨지거나,
   모든 손님이 같은 문장을 받는 것.

   고치는 건 사람이 문장을 다시 쓴다. 이 파일은 검출만 한다.
   자동 교정을 넣으면 "체력의 문제가 아니라." 같은 비문이 대량 생산된다.

   실행: node tests/style.js
   ========================================================= */
"use strict";
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;

const path = require("path");
const ROOT = path.join(__dirname, "..");
require(path.join(ROOT, "solar-terms.js"));
require(path.join(ROOT, "lunar-table.js"));
require(path.join(ROOT, "saju.js"));
require(path.join(ROOT, "diagnosis.js"));
require(path.join(ROOT, "saju-deep.js"));
require(path.join(ROOT, "saju-analyze.js"));
require(path.join(ROOT, "saju-read.js"));
require(path.join(ROOT, "questions.js"));
require(path.join(ROOT, "bridge.js"));
require(path.join(ROOT, "tension.js"));
require(path.join(ROOT, "narrative.js"));

const { Saju, Diagnosis, SajuDeep, SajuAnalyze, SajuRead, Bridge, Tension, Narrative } = globalThis;
const G = SajuDeep.GAN, J = SajuDeep.JI;

/* 재현 가능한 난수 — 매번 같은 표본을 쓴다 */
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FREQ = ["daily", "w3", "w1", "m_few", "event"];
const ACT = ["browse", "ask", "openCv", "calcRough", "editCv", "profile",
             "headhunt", "apply", "interview", "study", "family", "none"];
const LAST = ["thisWeek", "m1", "m3", "m6_12", "y1over"];
const SELF = ["enough", "tired", "noLearn", "nowhere", "myFault", "unknown"];
const DR = ["person", "culture", "load", "meaning", "fair", "money", "growth", "future"];
const MIR = ["person", "job", "pay", "fair", "time", "meaning", "nothing"];
const RUN = ["under1", "m1_3", "m3_6", "m6_12", "y1over", "never"];
const DL = ["thisMonth", "m3", "m6", "y1", "more", "never"];
const PQ = ["first", "hadNext", "burnout", "person", "career", "company"];
const EN = ["quiet", "temper", "team", "unsung", "health", "money", "none"];
const TEN = ["u1", "1_3", "3_5", "5_7", "7_10", "o10"];

const N = 500;
const r = rng(20260824);
const pickOf = (a) => a[Math.floor(r() * a.length)];

/* 손님이 실제로 읽는 문자열만 모은다.
   프롬프트 지시문과 선택지 라벨은 대상이 아니다 —
   선택지는 "면접을 봤다" 처럼 종결형인 게 맞다. */
const SKIP_PATH = /(answersLabel|tension\.echo\.lines|_drainTop|_drainBottom|_breakdown|_scores)/;

function walk(o, hit, p) {
  if (o == null) return;
  if (typeof o === "string") { if (!SKIP_PATH.test(p)) hit.push([p, o]); return; }
  if (typeof o !== "object") return;
  for (const k in o) walk(o[k], hit, p + "." + k);
}

/* 반말 = "~다."로 끝나는데 존댓말 어미가 아닌 문장 */
function hasBanmal(str) {
  return String(str).split(/(?<=[.!?])\s+/).some((x) => {
    const y = x.trim().replace(/[.!?]+$/, "");
    return y.length >= 4 && /[가-힣]다$/.test(y) && !/(니다|십시다)$/.test(y);
  });
}

const RULES = [
  ["반말 종결", (s) => hasBanmal(s)],
  ["빈 변수 노출", (s) => /undefined|\bnull\b|NaN|\[object/.test(s)],
  ["조사 미처리", (s) => /[가-힣]\((이|가|은|는|을|를|와|과)\)/.test(s)],
  ["홑 하이픈 자리표시자", (s) => /(대운|십이운성|용신|격국)\s+-(\s|$)/.test(s)],
  ["괄호 안 괄호", (s) => /\([^()]*\([^()]*\)[^()]*\)/.test(s)],
  ["3인칭 지칭", (s) => /이 사람/.test(s)],
  ["공백 뭉침", (s) => /\s{3,}/.test(s)]
];

let checked = 0;
const found = {};
const perPerson = [];

for (let i = 0; i < N; i++) {
  const acts = [];
  const na = Math.floor(r() * 5);
  for (let j = 0; j < na; j++) { const a = pickOf(ACT); if (acts.indexOf(a) < 0) acts.push(a); }
  if (!acts.length) acts.push("none");
  let top = pickOf(DR), bot = pickOf(DR);
  while (bot === top) bot = pickOf(DR);

  const answers = {
    quitFrequency: pickOf(FREQ), actions: acts, lastAction: pickOf(LAST),
    selfLabel: pickOf(SELF), drain: { top, bottom: bot }, miracle: pickOf(MIR),
    runway: pickOf(RUN), deadline: pickOf(DL), pastQuit: pickOf(PQ), endured: pickOf(EN)
  };
  const tenure = pickOf(TEN);
  const birth = {
    year: 1975 + Math.floor(r() * 24), month: 1 + Math.floor(r() * 12),
    day: 1 + Math.floor(r() * 28), hour: Math.floor(r() * 24),
    hourKnown: r() > 0.2, gender: r() > 0.5 ? "M" : "F", calendar: "solar"
  };

  let rep;
  try {
    rep = Diagnosis.diagnose({
      name: "고객",
      answers: Bridge.toLegacy({ answers, answersB: {}, tenure }),
      birth, now: new Date(2026, 7, 24)
    });
  } catch (e) {
    (found["진단 예외: " + e.message] ||= []).push(i);
    continue;
  }
  rep.tension = Tension.detect(
    Bridge.flatten({ answers, answersB: {}, tenure }),
    { tenureYears: Bridge.tenureYears(tenure) });

  /* 유료 본문(규칙 경로)까지 포함해서 본다 */
  const c = Saju.computeChart({
    year: birth.year, month: birth.month, day: birth.day,
    hour: birth.hourKnown ? birth.hour : 12, minute: 0, hourKnown: birth.hourKnown
  });
  const hp = c.pillars.hour || c.pillars.day;
  const age = 2026 - birth.year + 1;
  const dwAll = Saju.computeDaewoon(c, birth.gender, 9);
  const dwNow = dwAll && dwAll.list && dwAll.list.length ? Saju.daewoonAt(dwAll, age) : null;
  const yrs = Saju.computeYearly(c, 2026, 1);
  const an = SajuAnalyze.analyze({
    pillars: {
      년간: G[c.pillars.year.gan], 년지: J[c.pillars.year.ji],
      월간: G[c.pillars.month.gan], 월지: J[c.pillars.month.ji],
      일간: G[c.pillars.day.gan], 일지: J[c.pillars.day.ji],
      시간: G[hp.gan], 시지: J[hp.ji]
    },
    birth: {}, hourKnown: birth.hourKnown,
    termIdx: c.termIdx, termYear: c.termYear,
    daeunJi: dwNow && dwNow.ji != null ? J[dwNow.ji] : null,
    seunJi: yrs && yrs[0] && yrs[0].ji != null ? J[yrs[0].ji] : null
  });
  const rd = SajuRead.read(an);
  const ch = Narrative.ruleChapters(
    rd, an, Bridge.labels({ answers, answersB: {}, tenure }), rep, rep.tension);

  const hits = [];
  walk(rep, hits, "report");
  walk(rd, hits, "read");
  walk(ch, hits, "paid");
  checked++;

  const mine = new Set();
  for (const [p, str] of hits) {
    if (str.length < 8) continue;
    mine.add(str);
    for (const [name, test] of RULES) {
      if (test(str)) (found[name + "  @" + p.replace(/\.\d+/g, "[]")] ||= []).push(str.slice(0, 90));
    }
  }
  perPerson.push(mine);
}

/* 전원이 똑같이 받는 문장이 있는가 */
const freq = {};
perPerson.forEach((S) => S.forEach((s) => { freq[s] = (freq[s] || 0) + 1; }));
const universal = Object.keys(freq).filter((k) => freq[k] === perPerson.length);

let fail = 0;
console.log("문체 회귀 테스트 — 표본 " + checked + "명");

const keys = Object.keys(found);
if (keys.length) {
  keys.sort((a, b) => found[b].length - found[a].length);
  keys.forEach((k) => {
    fail += found[k].length;
    console.log("  ✗ [" + found[k].length + "건] " + k);
    [...new Set(found[k])].slice(0, 3).forEach((s) => console.log("      " + s));
  });
} else {
  console.log("  ✓ 반말·빈 변수·조사 오류·괄호 중첩·3인칭 없음");
}

/* 안내문이 아닌 진단 문장이 전원에게 똑같이 나가면 안 된다.
   면책·법적 고지·사용 안내는 모두에게 같은 게 맞으므로 제외한다.
   그 밖의 "판정"이 전원 동일하면 그건 개인화가 죽었다는 뜻이다. */
const NOTICE = /(결정을 대신하지 않습니다|참고 자료|의학적|법률|재정 상황과 채용 시장|전문가와 상의|판단해주세요)/;
const badUniversal = universal.filter((s) => s.length >= 30 && !NOTICE.test(s));
if (badUniversal.length) {
  fail += badUniversal.length;
  console.log("  ✗ 전원이 똑같이 받는 문장 " + badUniversal.length + "종");
  badUniversal.slice(0, 5).forEach((s) => console.log("      " + s.slice(0, 90)));
} else {
  console.log("  ✓ 전원이 똑같이 받는 진단 문장 없음");
}

if (fail) {
  console.log("\n문체 테스트 실패: " + fail + "건");
  process.exit(1);
}
console.log("\n문체 테스트 통과");
