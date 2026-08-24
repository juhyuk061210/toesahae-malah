/* =========================================================
   답변 다리 — 새 질문지(10+8)를 점수 계산에 연결한다
   ---------------------------------------------------------
   diagnosis.js 는 원래 옛 7문항을 기대한다. 질문지를 새로 짜면서
   답변 모양이 바뀌었으므로, 여기서 한 번에 변환한다.

   그냥 옛 형태로 되돌리는 게 아니라, 새 답변이 더 정확한 곳은
   더 정확하게 쓴다. 특히 준비도가 그렇다:
     예전 — "준비했나요?" 자기보고 한 문항
     지금 — 지난 3개월에 실제로 한 행동 12개 체크
   자기보고보다 행동이 정확하므로 점수도 행동에서 뽑는다.
   ========================================================= */
(function (global) {
  "use strict";

  var Q = global.Questions;
  if (!Q) throw new Error("questions.js 가 먼저 로드되어야 합니다.");

  /* 새 빈도 5단계 → 옛 5단계 */
  var FREQ = {
    daily: "daily", w3: "weekly", w1: "hard", m_few: "sometimes", event: "rarely"
  };

  /* '가장 지치는 것' → 옛 '퇴사 이유' */
  var DRAIN_TO_REASON = {
    person: "people", culture: "people", load: "overwork", meaning: "growth",
    fair: "pay", money: "pay", growth: "growth", future: "growth"
  };

  /* 기적질문 → 옛 '나가면 하고 싶은 것' 의 대용.
     완벽히 대응하지는 않으므로 보수적으로 매핑한다. */
  var MIRACLE_TO_PLAN = {
    person: "move", job: "switch", pay: "move", fair: "move",
    time: "move", meaning: "switch", nothing: "unknown"
  };

  /* 자기라벨 → 옛 '가장 알고 싶은 것' */
  var LABEL_TO_MAIN = {
    enough: "when", tired: "stay", noLearn: "what",
    nowhere: "better", myFault: "stay", unknown: "stay"
  };

  /* 행동 체크 → 준비 단계.
     자기보고가 아니라 실제 행동이므로 이쪽이 정확하다. */
  function prepFromActions(actions) {
    var t = Q.actionTiers(actions);
    if (t.none) return "nothing";
    if (t.active.length >= 3) return "applying";
    if (t.active.length >= 1) return "resume";
    if (t.prep.length >= 2) return "browsing";
    if (t.prep.length >= 1) return "thinking";
    return "nothing";
  }

  /* 근속 문자열 → 연수(대략) — 긴장 규칙이 숫자를 쓴다 */
  var TENURE_YEARS = {
    u1: 0.5, "1_3": 2, "3_5": 4, "5_7": 6, "7_10": 8.5, o10: 12
  };

  /* 새 답변 + 결제 후 답변 → 하나로 편다.
     탐지기는 평평한 객체를 기대한다(drainTop / drainBottom).
     입력은 { answers, answersB, tenure } 한 덩어리로 받는다. */
  function flatten(bag) {
    bag = bag || {};
    var out = {}, k;
    for (k in (bag.answers || {})) out[k] = bag.answers[k];
    for (k in (bag.answersB || {})) out[k] = bag.answersB[k];
    if (out.drain && typeof out.drain === "object") {
      out.drainTop = out.drain.top;
      out.drainBottom = out.drain.bottom;
    }
    if (bag.tenure) out.tenure = bag.tenure;
    return out;
  }

  /* 새 답변 → diagnosis.js 가 읽는 옛 형태.
     점수는 여기서 함께 계산해 _scores 로 실어 보낸다. */
  function toLegacy(bag) {
    var flat = flatten(bag);
    var tenure = (bag && bag.tenure) || flat.tenure;
    var freeText = "";
    if (flat.scene && String(flat.scene).trim()) freeText = String(flat.scene).trim();

    var pressure = pressureScore(flat, tenure);
    return {
      quitFrequency: FREQ[flat.quitFrequency] || "sometimes",
      quitReason: DRAIN_TO_REASON[flat.drainTop] || "etc",
      tenure: tenure || "3_5",
      nextPlan: MIRACLE_TO_PLAN[flat.miracle] || "unknown",
      preparation: prepFromActions(flat.actions),
      mainQuestion: LABEL_TO_MAIN[flat.selfLabel] || "stay",
      freeText: freeText,

      /* diagnosis.js 가 이 값이 있으면 우선 쓴다.
         자기보고 대신 실제 행동에서 뽑은 점수라 더 정확하다. */
      _scores: {
        careerPressure: pressure,
        preparation: preparationScore(flat)
      },
      _breakdown: pressureBreakdown(flat, pressure),

      /* 무료3이 "본인이 고른 이유와 계산이 같은 곳을 가리키는지"를 말하려면
         원본 선택값이 필요하다. 라벨이 아니라 코드값으로 넘긴다. */
      _drainTop: flat.drainTop || null,
      _drainBottom: flat.drainBottom || null
    };
  }

  /* 준비도 점수를 행동 기반으로 다시 계산한다.
     0~100. 자기보고가 아니라 실제로 한 것만 센다. */
  function preparationScore(flat) {
    var t = Q.actionTiers(flat.actions);
    if (t.none) return 6;

    var v = 0;
    v += Math.min(3, t.prep.length) * 6;        /* 준비행동 최대 18 */
    v += Math.min(4, t.active.length) * 13;     /* 적극행동 최대 52 */
    if (t.etc.length) v += 5;                   /* 가족 상의 */

    /* 최근성 — 1년 전에 한 번 본 것과 이번 주에 지원한 것은 다르다 */
    var FRESH = { thisWeek: 14, m1: 10, m3: 5, m6_12: -4, y1over: -10, never: -12 };
    v += (FRESH[flat.lastAction] !== undefined ? FRESH[flat.lastAction] : 0);

    /* 돈 계산은 준비의 실질 지표다 */
    var RUNWAY = { under1: -6, m1_3: 0, m3_6: 6, m6_12: 10, y1over: 12, never: -8 };
    v += (RUNWAY[flat.runway] !== undefined ? RUNWAY[flat.runway] : 0);

    /* 기한을 정해둔 사람은 계획이 있는 것이다 */
    var DEADLINE = { thisMonth: 12, m3: 10, m6: 6, y1: 2, more: -4, never: -10 };
    v += (DEADLINE[flat.deadline] !== undefined ? DEADLINE[flat.deadline] : 0);

    /* 결제 후 답변이 있으면 자신감을 반영 */
    if (typeof flat.confidence === "number") v += (flat.confidence - 5) * 2;

    return Math.max(3, Math.min(97, Math.round(50 + v)));
  }

  /* 압박도 — 빈도·근속에 더해 회복 신호와 버틴 경험을 본다 */
  function pressureScore(flat, tenure) {
    var FREQ_W = { daily: 100, w3: 84, w1: 62, m_few: 36, event: 15 };
    var TEN_W = { u1: 42, "1_3": 62, "3_5": 82, "5_7": 74, "7_10": 62, o10: 52 };

    var base = (FREQ_W[flat.quitFrequency] !== undefined ? FREQ_W[flat.quitFrequency] : 45) * 0.62
             + (TEN_W[tenure] !== undefined ? TEN_W[tenure] : 60) * 0.24;

    /* 예외질문 — 최근에 '할 만하다'고 느낀 적이 있으면 압박이 덜하다 */
    var EXC = { thisWeek: -10, thisMonth: -6, m3: 0, m6over: 6, never: 12 };
    if (flat.exception) base += (EXC[flat.exception] || 0);

    /* 잘 버틴 게 없다는 답은 소진 신호다 */
    if (flat.endured === "none") base += 8;

    /* '무엇이 바뀌어도 소용없다' 는 회복 여지가 낮다는 뜻 */
    if (flat.miracle === "nothing") base += 6;

    return Math.max(5, Math.min(98, Math.round(base + 14)));
  }

  /* 압박의 출처를 네 갈래로 — 이제 직접 물어본 값을 쓴다 */
  function pressureBreakdown(flat, total) {
    var axes = { 사람관계: 0, 성장: 0, 보상: 0, 업무량: 0 };
    var MAP = {
      person: "사람관계", culture: "사람관계",
      load: "업무량",
      meaning: "성장", growth: "성장", future: "성장",
      fair: "보상", money: "보상"
    };
    var base = Math.round(total * 0.55);
    Object.keys(axes).forEach(function (k) { axes[k] = base; });

    if (flat.drainTop && MAP[flat.drainTop]) axes[MAP[flat.drainTop]] += 26;
    if (flat.drainBottom && MAP[flat.drainBottom]) axes[MAP[flat.drainBottom]] -= 18;
    if (flat.miracle && MAP[flat.miracle]) axes[MAP[flat.miracle]] += 10;

    Object.keys(axes).forEach(function (k) {
      axes[k] = Math.max(8, Math.min(98, axes[k]));
    });
    return axes;
  }

  /* 리포트가 "당신은 ~라고 답하셨습니다" 라고 쓸 수 있게
     값을 사람이 읽는 라벨로 바꿔둔다. */
  function labels(bag) {
    var flat = flatten(bag);
    var out = {};

    function put(key, qid, val) {
      if (val === undefined || val === null || val === "") return;
      out[key] = Q.labelOf(qid, val);
    }

    put("quitFrequency", "quitFrequency", flat.quitFrequency);
    put("lastAction", "lastAction", flat.lastAction);
    put("selfLabel", "selfLabel", flat.selfLabel);
    put("miracle", "miracle", flat.miracle);
    put("runway", "runway", flat.runway);
    put("deadline", "deadline", flat.deadline);
    put("pastQuit", "pastQuit", flat.pastQuit);
    put("endured", "endured", flat.endured);
    put("constraint", "constraint", flat.constraint);
    put("exception", "exception", flat.exception);
    put("depth", "depth", flat.depth);
    put("sceneWhen", "sceneWhen", flat.sceneWhen);
    if (flat.drainTop) out.drainTop = Q.labelOf("drain", flat.drainTop);
    if (flat.drainBottom) out.drainBottom = Q.labelOf("drain", flat.drainBottom);

    if (flat.actions && flat.actions.length) {
      out.actions = Q.labelsOf("actions", flat.actions).join(", ");
    }
    if (flat.scene) out.freeText = String(flat.scene).trim();

    /* 근속은 birth 화면에서 온다 */
    var TEN = { u1:"1년 미만", "1_3":"1~3년", "3_5":"3~5년",
                "5_7":"5~7년", "7_10":"7~10년", o10:"10년 이상" };
    if (bag && bag.tenure && TEN[bag.tenure]) out.tenure = TEN[bag.tenure];

    /* 척도는 숫자 그대로가 더 정확하다 */
    ["regretStay", "regretLeave", "importance", "confidence"].forEach(function (k) {
      if (typeof flat[k] === "number") out[k] = flat[k] + "점";
    });

    /* 리포트 폴백이 '준비 상태'라는 이름으로 찾는다 */
    var PREP = { nothing:"아무 준비도 하지 않았다", thinking:"생각만 하고 있다",
                 browsing:"가끔 채용공고만 본다", resume:"이력서·포트폴리오를 준비했다",
                 applying:"이미 지원하고 있다" };
    out.preparation = PREP[prepFromActions(flat.actions)] || null;

    return out;
  }

  global.Bridge = {
    flatten: flatten,
    labels: labels,
    toLegacy: toLegacy,
    preparationScore: preparationScore,
    pressureScore: pressureScore,
    pressureBreakdown: pressureBreakdown,
    prepFromActions: prepFromActions,
    tenureYears: function (t) { return TENURE_YEARS[t] !== undefined ? TENURE_YEARS[t] : null; }
  };
})(typeof window !== "undefined" ? window : global);
