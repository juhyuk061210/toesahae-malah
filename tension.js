/* =========================================================
   긴장 탐지 — 답변끼리 부딪혀 "읽힌 느낌"을 만든다
   ---------------------------------------------------------
   이 파일이 제품의 심장이다. 사주가 아니라 여기서 개인화가 나온다.

   설계에서 절대 어기면 안 되는 것:

   1) 흔한 조합을 "당신만의 조합"이라고 부르지 않는다.
      "퇴사 생각 많은데 준비 안 함"은 타깃의 절반 이상이다.
      실측 자료: 이직 고려 90.8% 중 적극 준비 42.6% (잡코리아),
      조용한 퇴사 51.7% (인크루트, 8~10년차 57.4%).
      → 등급제로 막는다. A급은 3중 이상 결합 + 추정 발생률 12% 이하.

   2) 관찰만 진술한다. "당신은 ~다"(진단)가 아니라
      "당신의 답변 두 개는 이렇게 붙는다"(관찰).

   3) 한 칸만 나간다. 사용자가 쓴 것에서 딱 한 걸음.
      두 칸 나가면 직면이 되고, 직면은 저항을 만든다.

   4) 억제 규칙이 우선한다. 이미 자각한 것을 통찰인 척 파는 것이
      이 카테고리 제품의 가장 흔한 실패다.

   발생률(rate)은 전부 추정치다. 파일럿 로그로 실측 교체 전까지
   A급 발화를 막으려면 STRICT 모드를 켠다.
   ========================================================= */
(function (global) {
  "use strict";

  var Q = global.Questions;
  if (!Q) throw new Error("questions.js 가 먼저 로드되어야 합니다.");

  var L = Q.labelOf;

  /* ---------- 편의 함수 ---------- */
  function has(arr, v) { return (arr || []).indexOf(v) >= 0; }
  function inSet(v, list) { return list.indexOf(v) >= 0; }

  /* 받침 유무로 조사를 고른다. "느낌를" 같은 문장이 나오면
     읽는 사람이 바로 기계 티를 느낀다. */
  function josa(word, withBatchim, without) {
    var s = String(word || "");
    var last = s.charCodeAt(s.length - 1);
    if (isNaN(last) || last < 0xac00 || last > 0xd7a3) return without;
    return ((last - 0xac00) % 28) ? withBatchim : without;
  }
  function eul(w) { return w + josa(w, "을", "를"); }
  function ineun(w) { return w + josa(w, "은", "는"); }
  function iga(w) { return w + josa(w, "이", "가"); }
  function num(v, d) { return typeof v === "number" ? v : d; }

  /* 답변 묶음을 다루기 쉬운 형태로 */
  function ctxOf(a, tenureYears) {
    var t = Q.actionTiers(a.actions);
    return {
      a: a,
      tiers: t,
      activeN: t.active.length,
      prepN: t.prep.length,
      hot: inSet(a.quitFrequency, ["daily", "w3"]),
      years: typeof tenureYears === "number" ? tenureYears : null,
      B2: num(a.regretStay, null),
      B3: num(a.regretLeave, null),
      B4: num(a.importance, null),
      B5: num(a.confidence, null)
    };
  }

  /* ---------- 규칙 정의 ----------
     when(c) → 참이면 발동
     say(c)  → { claim, body, cushion }
     grade   : A | B | C | suppress | safety
     rate    : 추정 발생률(%). 낮을수록 강한 문장.
     group   : 같은 그룹에서는 하나만 뽑는다.
     needs   : 이 값들이 없으면 판정 자체를 하지 않는다.
  */
  var RULES = [

  /* ═══ 그룹 Ⅰ. 준비도 — 태도와 행동의 낙차 ═══ */
  {
    id: "R01", grade: "A", rate: 9, group: "readiness",
    needs: ["quitFrequency", "actions", "deadline", "runway"],
    when: function (c) {
      return c.hot && c.activeN === 0 &&
             c.a.deadline === "never" && c.a.runway === "never";
    },
    say: function (c) {
      return {
        claim: "퇴사가 계획이 아니라 지금을 견디는 방법으로 쓰이고 있습니다",
        body: "퇴사 생각은 " + L("quitFrequency", c.a.quitFrequency) + ". " +
              "그런데 언제까지 버틸지는 정해본 적이 없고, 나갔을 때 몇 달을 버틸 수 있는지도 " +
              "계산해본 적이 없다고 답하셨습니다. 이 조합은 '나가고 싶다'보다 " +
              "'지금 이 상태를 잠깐 벗어나고 싶다'에 가깝습니다.",
        cushion: "이게 나쁘다는 뜻은 아닙니다. 그 방법으로 버텨온 시간이 있다는 뜻이기도 합니다."
      };
    }
  },
  {
    id: "R02", grade: "A", rate: 7, group: "readiness",
    needs: ["actions", "confidence", "deadline"],
    when: function (c) { return c.activeN >= 2 && c.B5 >= 7 && c.a.deadline === "never"; },
    say: function (c) {
      return {
        claim: "준비가 부족한 게 아니라 결정을 미루고 계십니다",
        body: "이력서를 고쳤고, 지원도 하셨습니다. 6개월 안에 옮길 수 있다고도 보고 계십니다(" +
              c.B5 + "점). 그런데 언제까지 버틸지는 정해두지 않으셨습니다. " +
              "준비가 부족한 게 아니라, 결정을 대신 내려줄 무언가를 기다리고 계신 것에 가깝습니다.",
        cushion: "그 무언가가 이 리포트일 수도 있는데, 리포트는 결정을 대신해드릴 수 없습니다. " +
                 "대신 당신이 이미 어디까지 와 있는지는 정확히 말씀드릴 수 있습니다."
      };
    }
  },
  {
    id: "R03", grade: "B", rate: 18, group: "readiness",
    needs: ["actions", "lastAction", "quitFrequency"],
    when: function (c) {
      return c.prepN > 0 && c.activeN === 0 &&
             inSet(c.a.lastAction, ["m6_12", "y1over"]) && c.hot;
    },
    say: function (c) {
      return {
        claim: "공고를 보는 게 나가는 행동이 아니라 버티는 행동일 수 있습니다",
        body: "공고는 보셨는데, 마지막으로 실제로 뭘 해본 건 " +
              L("lastAction", c.a.lastAction) + "입니다. 그사이에도 퇴사 생각은 " +
              L("quitFrequency", c.a.quitFrequency) + "이었고요.",
        cushion: "공고를 보는 건 '여기 있어도 갈 데는 있다'를 확인하는 행동일 때가 있습니다. " +
                 "그 확인이 있어야 내일 출근할 수 있는 사람들이 있습니다."
      };
    }
  },
  {
    id: "R04", grade: "A", rate: 8, group: "readiness",
    needs: ["constraint", "actions"],
    /* 가장 아픈 규칙. 사용자가 부드러운 톤을 요청했으면 발화 금지 */
    when: function (c) {
      return c.a.constraint === "ready" && c.activeN === 0 &&
             !inSet(c.a.depth, ["gentle", "organize"]);
    },
    say: function () {
      return {
        claim: "당신을 붙잡고 있는 게 조건이 아닐 수 있습니다",
        body: "'다음이 정해지지 않아도 나갈 각오는 되어 있다'고 답하셨습니다. " +
              "그리고 지난 3개월간 이력서를 고치거나 지원하신 적은 없다고 답하셨습니다. " +
              "이 두 문장을 나란히 놓으면, 당신을 붙잡고 있는 게 조건이 아닐 가능성이 보입니다.",
        cushion: null   /* 여기서 멈춘다. 이유를 대신 말해주지 않는다. */
      };
    }
  },
  {
    id: "R05", grade: "A", rate: 10, group: "readiness",
    needs: ["runway", "actions"],
    when: function (c) { return inSet(c.a.runway, ["m6_12", "y1over"]) && c.activeN === 0; },
    say: function (c) {
      return {
        claim: "여유가 없어서 못 나가는 게 아니라는 건 이미 확인됐습니다",
        body: "소득이 끊겨도 " + L("runway", c.a.runway) + " 버틸 수 있다고 답하셨습니다. " +
              "많은 사람이 이 답을 못 합니다. 그런데 그 여유로 아직 아무것도 시작하지 않으셨습니다.",
        cushion: null
      };
    }
  },
  {
    id: "R06", grade: "A", rate: 4, group: "readiness",
    needs: ["runway", "deadline"],
    when: function (c) {
      return inSet(c.a.runway, ["under1", "m1_3"]) && c.a.deadline === "thisMonth";
    },
    say: function (c) {
      return {
        claim: "결심과 버틸 수 있는 기간이 어긋나 있습니다",
        body: "이번 달 안에 나가실 생각이라고 답하셨습니다. 그리고 소득이 끊기면 " +
              L("runway", c.a.runway) + " 버틸 수 있다고 답하셨습니다. " +
              "이 두 숫자는 서로 다른 이야기를 하고 있습니다.",
        cushion: "어느 쪽이 틀렸다는 게 아니라, 둘 중 하나는 지금 조정 가능한 숫자라는 뜻입니다."
      };
    }
  },

  /* ═══ 그룹 Ⅱ. 귀인 — 문제가 어디 있다고 보는가 ═══ */
  {
    id: "R07", grade: "A", rate: 8, group: "attribution",
    needs: ["miracle"],
    when: function (c) {
      return c.a.miracle === "nothing" && c.years !== null && c.years >= 5 &&
             c.a.selfLabel !== "myFault";   /* 이미 자각 → R21 로 */
    },
    say: function (c) {
      return {
        claim: "떠나고 싶은 대상이 이 회사가 맞는지부터가 질문입니다",
        body: "'무엇이 바뀌어도 소용없을 것 같다'를 고르셨습니다. " +
              c.years + "년을 계신 회사에 대해서요. " +
              "이 답을 고른 분께 '어디로 옮길까'를 이야기하는 건 순서가 틀린 것 같습니다.",
        cushion: "당신이 문제라는 뜻이 아닙니다. 지금 지쳐 있는 대상이 무엇인지의 문제입니다."
      };
    }
  },
  {
    id: "R08", grade: "B", rate: 14, group: "attribution",
    needs: ["miracle", "drain"],
    when: function (c) {
      return c.a.miracle === "person" && c.a.drainTop === "person";
    },
    say: function () {
      return {
        claim: "문제가 한 사람의 자리에 있습니다 — 이건 오히려 명확한 상황입니다",
        body: "두 번 다 같은 답을 하셨습니다. 가장 지치게 하는 것도, 바뀌면 남을 수 있는 것도 " +
              "'그 사람'입니다.",
        cushion: "문제가 회사 전체나 당신 자신이 아니라 한 사람의 자리에 있다는 뜻입니다. " +
                 "그 사람의 임기·이동 가능성이 실제 변수가 됩니다."
      };
    }
  },
  {
    id: "R09", grade: "A", rate: 6, group: "attribution",
    needs: ["drain", "miracle"],
    when: function (c) {
      return c.a.drainTop !== "money" && c.a.drainBottom === "money" &&
             c.a.miracle === "pay";
    },
    say: function () {
      return {
        claim: "돈이 아니라 '제대로 값을 쳐주는 것'에 대한 이야기일 수 있습니다",
        body: "가장 상관없는 것으로 '돈'을 고르셨습니다. " +
              "그런데 딱 하나 바뀌면 남을 수 있는 것으로는 '연봉이 확 오른다'를 고르셨습니다.",
        cushion: null
      };
    }
  },
  {
    id: "R10", grade: "A", rate: 7, group: "attribution",
    needs: ["selfLabel", "drain"],
    when: function (c) {
      return c.a.selfLabel === "myFault" && inSet(c.a.drainTop, ["fair", "culture"]);
    },
    say: function (c) {
      return {
        claim: "자책이 정확한 진단이 아닐 수 있습니다",
        body: "'회사보다 내가 문제인 것 같다'고 하셨습니다. 그런데 가장 지치게 하는 것으로는 " +
              eul(L("drain", c.a.drainTop)) + " 고르셨습니다. " +
              "당신이 고른 답 두 개가 서로 다른 곳을 가리키고 있습니다.",
        cushion: null
      };
    }
  },
  {
    id: "R11", grade: "suppress", rate: 12, group: "tone",
    needs: ["selfLabel"],
    when: function (c) {
      return c.a.selfLabel === "unknown" &&
             (c.a.miracle === "nothing" || (c.B4 !== null && c.B4 <= 5));
    },
    say: function () {
      return {
        claim: "지금 필요한 건 결론이 아니라 정리입니다",
        body: "'내가 뭘 원하는지 모르겠다는 게 제일 답답하다'를 고르셨습니다. " +
              "그래서 이 리포트는 나가라/남아라를 말하지 않습니다. 대신 당신이 답한 것들 중 " +
              "이미 방향이 정해져 있는 것과 아직 아무것도 정해지지 않은 것을 나눠서 보여드리겠습니다.",
        cushion: null
      };
    },
    /* 이 규칙이 켜지면 아래 규칙들을 잠근다 */
    locks: ["R01", "R04", "R14", "R28", "R32"]
  },

  /* ═══ 그룹 Ⅲ. 시간 — 반복인가 사건인가 ═══ */
  {
    id: "R12", grade: "A", rate: 6, group: "repeat",
    needs: ["pastQuit", "actions", "constraint"],
    when: function (c) {
      return c.a.pastQuit === "burnout" && c.activeN === 0 && c.a.constraint === "ready";
    },
    say: function () {
      return {
        claim: "지난번과 같은 방식으로 가고 있습니다",
        body: "지난번에는 다음을 정하지 않고 나오셨다고 답하셨습니다. " +
              "지금도 준비된 다음 자리는 없고, 각오는 되어 있다고 답하셨고요. 같은 방식이 두 번째입니다.",
        cushion: "그게 틀렸다는 게 아니라, 당신이 결정하는 방식이 그렇다는 것이 이번엔 미리 보인다는 뜻입니다."
      };
    }
  },
  {
    id: "R13", grade: "A", rate: 5, group: "repeat",
    needs: ["pastQuit", "drain"],
    when: function (c) { return c.a.pastQuit === "person" && c.a.drainTop === "person"; },
    say: function () {
      return {
        claim: "회사는 바뀌었는데 지치는 자리는 같은 곳입니다",
        body: "지난번 퇴사의 결정적 계기도 사람이었고, 지금 가장 지치게 하는 것도 사람이라고 답하셨습니다.",
        cushion: "이건 당신이 예민해서가 아니라, 특정한 관계 구조에서 유독 소모가 큰 사람이 " +
                 "있다는 뜻일 수 있습니다."
      };
    }
  },
  {
    id: "R14", grade: "B", rate: 15, group: "repeat",
    needs: ["quitFrequency", "sceneWhen"],
    when: function (c) { return c.hot && c.a.sceneWhen === "forget"; },
    say: function (c) {
      return {
        claim: "특정한 일이 아니라 상태가 원인에 가깝습니다",
        body: "'진짜 그만둬야겠다'고 생각한 최근 순간이 언제였는지는 기억이 안 난다고 하셨습니다. " +
              "그런데 그 생각 자체는 " + L("quitFrequency", c.a.quitFrequency) + " 하고 계시고요. " +
              "사건이 없는데 생각만 계속된다는 건 상태가 원인이라는 뜻에 가깝습니다.",
        cushion: null
      };
    }
  },
  {
    id: "R15", grade: "A", rate: 7, group: "repeat",
    needs: ["sceneWhen", "quitFrequency"],
    when: function (c) {
      return inSet(c.a.sceneWhen, ["today", "week"]) &&
             inSet(c.a.quitFrequency, ["m_few", "event"]);
    },
    say: function (c) {
      return {
        claim: "오늘 결정하면 결정하는 건 당신이 아니라 그 일이 됩니다",
        body: "평소에는 " + L("quitFrequency", c.a.quitFrequency) + " 정도인데, " +
              "그 일이 " + L("sceneWhen", c.a.sceneWhen) + " 있었습니다.",
        cushion: "2주 뒤에 같은 질문을 다시 해보시는 게 낫습니다. " +
                 "그때도 같은 답이면 그건 사건이 아니라 방향입니다."
      };
    }
  },
  {
    id: "R16", grade: "A", rate: 7, group: "repeat",
    needs: ["exception"],
    when: function (c) {
      return c.a.exception === "never" && c.years !== null && c.years >= 3;
    },
    say: function (c) {
      return {
        claim: "'조금만 더 버텨보라'고 말하는 건 무례한 일이라고 생각합니다",
        body: c.years + "년 동안 '그래도 이건 할 만하다'고 느낀 적이 한 번도 없다고 답하셨습니다.",
        cushion: null
      };
    }
  },

  /* ═══ 그룹 Ⅴ. 후회 — 두 숫자의 비대칭 ═══ */
  {
    id: "R19", grade: "B", rate: 18, group: "regret",
    needs: ["regretStay", "regretLeave"],
    when: function (c) { return c.B2 !== null && c.B3 !== null && (c.B2 - c.B3) >= 3; },
    say: function (c) {
      return {
        claim: "당신 안에서 이미 계산이 끝나 있습니다",
        body: "1년 뒤에도 여기 있을 때의 후회를 " + c.B2 + "점, " +
              "나갔다가 더 나빠졌을 때의 후회를 " + c.B3 + "점으로 답하셨습니다.",
        cushion: "남는 건 언제, 어떻게냐입니다. 당장 나가라는 뜻은 아닙니다."
      };
    }
  },
  {
    id: "R20", grade: "A", rate: 14, group: "regret",
    needs: ["regretStay", "regretLeave"],
    when: function (c) { return c.B2 !== null && c.B3 !== null && (c.B3 - c.B2) >= 3; },
    say: function (c) {
      return {
        claim: "지금 결정을 미루는 게 우유부단해서가 아닙니다",
        body: "나갔다가 더 나빠졌을 때의 후회가 " + c.B3 + "점으로, " +
              "그대로 있을 때의 후회 " + c.B2 + "점보다 큽니다. " +
              "당신 계산으로는 아직 나갈 때가 아닌 게 맞습니다.",
        cushion: "그럼 남은 질문은 하나입니다 — 무엇이 채워지면 그 숫자가 뒤집히나."
      };
    }
  },
  {
    id: "R21", grade: "A", rate: 10, group: "regret",
    needs: ["regretStay", "regretLeave"],
    when: function (c) {
      return c.B2 !== null && c.B3 !== null &&
             Math.abs(c.B2 - c.B3) <= 1 && c.B2 >= 7 && c.B3 >= 7;
    },
    say: function (c) {
      return {
        claim: "결정을 못 하는 게 아니라, 지금 정보로는 결정이 안 되는 상태입니다",
        body: "두 숫자가 거의 같습니다. 남아도 후회 " + c.B2 + "점, 나가도 후회 " + c.B3 + "점.",
        cushion: "결정을 더 밀어붙이는 대신, 어느 쪽 숫자를 먼저 흔들 수 있는지를 보는 게 순서입니다."
      };
    }
  },
  {
    id: "R22", grade: "safety", rate: 5, group: "regret",
    needs: ["regretStay", "regretLeave", "quitFrequency"],
    when: function (c) {
      return c.B2 !== null && c.B3 !== null && c.B2 <= 4 && c.B3 <= 4 && c.hot;
    },
    say: function (c) {
      return {
        claim: "지금 아무것도 별로 중요하게 느껴지지 않는 상태일 수 있습니다",
        body: "1년 뒤에도 그대로여도 후회 " + c.B2 + "점, 나갔다 더 나빠져도 후회 " + c.B3 + "점. " +
              "그런데 퇴사 생각은 " + L("quitFrequency", c.a.quitFrequency) + " 하십니다.",
        cushion: "어느 쪽이든 별로 상관없다고 느껴지는데 생각은 멈추지 않는다면, " +
                 "문제는 회사 쪽이 아닐 수 있습니다."
      };
    }
  },

  /* ═══ 그룹 Ⅵ. 자기상 ═══ */
  {
    id: "R23", grade: "A", rate: 9, group: "selfimage",
    needs: ["runway", "actions"],
    when: function (c) {
      return (c.a.selfLabel === "tired" || (c.B4 !== null && c.B4 >= 7)) &&
             c.a.runway === "never" && c.activeN === 0;
    },
    say: function (c) {
      return {
        claim: "숫자를 안 본 건 아직 계획이 되지 않았다는 신호일 수 있습니다",
        body: (c.B4 !== null ? "옮기는 게 " + c.B4 + "점만큼 중요하다고 답하셨습니다. " : "") +
              "그리고 나갔을 때 몇 달을 버틸 수 있는지는 계산해본 적 없다고 답하셨고요. " +
              "중요한 일에 대해서 우리는 보통 숫자부터 봅니다.",
        cushion: null
      };
    }
  },
  {
    id: "R24", grade: "suppress", rate: 14, group: "tone",
    needs: ["selfLabel"],
    when: function (c) { return c.a.selfLabel === "nowhere"; },
    say: function () {
      return {
        claim: "이미 알고 계신 얘기는 반복하지 않겠습니다",
        body: "'갈 데가 없을까 봐 무섭다'는 건 이미 알고 계신 얘기니까 반복하지 않겠습니다. " +
              "대신 그 두려움에 근거가 있는지를 당신 답변으로 확인해보겠습니다.",
        cushion: null
      };
    },
    locks: ["R01", "R23"]
  },
  {
    id: "R25", grade: "safety", rate: 7, group: "affirm",
    needs: ["endured", "exception"],
    when: function (c) {
      return c.a.endured === "none" && inSet(c.a.exception, ["m6over", "never"]);
    },
    say: function (c) {
      return {
        claim: "기억이 안 나는 게 아니라 지금은 볼 여력이 없는 상태에 가깝습니다",
        body: "'잘 버텼다 싶은 게 솔직히 없다'고 답하셨습니다. " +
              "회사에서 '그래도 이건 할 만하다' 느낀 것도 " +
              L("exception", c.a.exception) + "이고요. 1년 동안 아무것도 없었을 리는 없습니다.",
        cushion: null
      };
    }
  },

  /* ═══ 그룹 Ⅶ. 기대와 결론의 충돌 ═══ */
  {
    id: "R26", grade: "A", rate: 8, group: "expectation",
    needs: ["depth", "actions", "runway"],
    when: function (c) {
      return c.a.depth === "all" && c.activeN === 0 && c.a.runway === "never";
    },
    say: function () {
      return {
        claim: "지금 필요한 건 결론이 아니라 첫 숫자 하나인 것 같습니다",
        body: "'못 보고 있는 것까지 다 짚어달라'고 하셨으니 하나만 말씀드리겠습니다. " +
              "지원한 곳도, 계산해본 숫자도 아직 없습니다.",
        cushion: null
      };
    }
  },
  {
    id: "R27", grade: "A", rate: 6, group: "expectation",
    needs: ["depth", "regretStay", "regretLeave"],
    when: function (c) {
      return c.a.depth === "gentle" && c.B2 !== null && c.B3 !== null && (c.B2 - c.B3) >= 3;
    },
    say: function (c) {
      return {
        claim: "판정은 하지 않고 숫자만 남겨두겠습니다",
        body: "방향만 편하게 알려드리는 게 좋겠다고 하셔서, 세게 말하지는 않겠습니다. " +
              "다만 숫자는 남겨두겠습니다. 그대로 있을 때의 후회 " + c.B2 + "점, " +
              "나갔다 실패했을 때의 후회 " + c.B3 + "점.",
        cushion: "이 두 숫자는 당신이 직접 적으신 것입니다."
      };
    }
  },
  {
    id: "R28", grade: "B", rate: 17, group: "balance",
    needs: ["exception", "quitFrequency"],
    when: function (c) {
      return inSet(c.a.exception, ["thisWeek", "thisMonth"]) && c.hot;
    },
    say: function (c) {
      return {
        claim: "떠나고 싶은 게 회사인지, 지금의 상태인지 구분해볼 여지가 있습니다",
        body: "퇴사 생각은 " + L("quitFrequency", c.a.quitFrequency) + "인데, " +
              "'그래도 이건 할 만하다'고 느낀 게 " + L("exception", c.a.exception) + "입니다.",
        cushion: "이 둘이 같이 있다는 건 회사가 완전히 끝났다는 뜻은 아닙니다."
      };
    }
  },
  {
    id: "R29", grade: "A", rate: 4, group: "repeat",
    needs: ["pastQuit", "quitFrequency"],
    when: function (c) {
      return c.years !== null && c.years < 1 && c.hot && c.a.pastQuit !== "first";
    },
    say: function (c) {
      return {
        claim: "확인해볼 것은 회사 목록이 아니라 어떤 조건에서 소모되는가입니다",
        body: "들어온 지 1년이 안 됐는데 " + L("quitFrequency", c.a.quitFrequency) +
              " 퇴사를 생각하고 계십니다. 그리고 이전 회사에서도 " +
              L("pastQuit", c.a.pastQuit) + "고요. 1년 안에 같은 지점에 두 번 도착했습니다.",
        cushion: null
      };
    }
  },
  {
    id: "R30", grade: "suppress", rate: 18, group: "honesty",
    needs: ["pastQuit"],
    when: function (c) { return c.a.pastQuit === "first"; },
    say: function () {
      return {
        claim: "지금 데이터로는 말할 수 없는 것이 하나 있습니다",
        body: "비교할 이전 회사가 없으니, 이게 '이 회사의 문제'인지 '반복될 패턴'인지는 " +
              "지금 데이터로는 말할 수 없습니다.",
        cushion: "그렇게 말하는 리포트가 있다면 지어낸 겁니다."
      };
    },
    locks: ["R12", "R13", "R29"]
  },
  {
    id: "R31", grade: "safety", rate: 4, group: "safety",
    needs: ["endured", "exception", "importance", "confidence"],
    when: function (c) {
      return c.a.endured === "none" && c.a.exception === "never" &&
             c.B4 !== null && c.B4 <= 4 && c.B5 !== null && c.B5 <= 4;
    },
    say: function () {
      return {
        claim: "지금은 '나갈까 남을까'를 정할 시기가 아니라 회복이 먼저인 시기로 보입니다",
        body: "이 리포트는 그 판단을 대신할 수 없습니다. " +
              "몸이나 잠이 실제로 영향을 받고 있다면, 그건 커리어 문제가 아니라 " +
              "건강 문제로 다루는 게 맞습니다.",
        cushion: null
      };
    },
    /* 이게 켜지면 다른 모든 판정을 무효화한다 */
    overrideAll: true
  },
  {
    id: "R32", grade: "A", rate: 7, group: "readiness",
    needs: ["deadline", "quitFrequency", "actions"],
    when: function (c) { return c.a.deadline === "more" && c.hot && c.activeN === 0; },
    say: function () {
      return {
        claim: "'버틸 수 있다'는 문장은 종종 '그때쯤이면 뭔가 달라져 있겠지'와 같이 다닙니다",
        body: "'그 이상도 버틸 것 같다'고 답하셨습니다. 매일 퇴사를 생각하면서요. " +
              "버틸 수 있다는 건 사실일 겁니다. " +
              "다만 지난 3개월 동안 달라진 걸 만들기 위해 하신 일은 없다고 답하셨습니다.",
        cushion: null
      };
    }
  },
  {
    id: "R33", grade: "A", rate: 10, group: "balance",
    needs: ["constraint", "importance"],
    when: function (c) { return c.a.constraint === "cannot" && c.B4 !== null && c.B4 >= 7; },
    say: function (c) {
      return {
        claim: "이건 의지의 문제가 아닙니다",
        body: "옮기는 게 " + c.B4 + "점만큼 중요한데, 지금은 사실상 불가능하다고 답하셨습니다. " +
              "원하는 것과 가능한 것이 어긋나 있는 상태입니다.",
        cushion: "이 경우에 필요한 건 결심이 아니라 시간표입니다."
      };
    },
    noPush: true   /* 행동 촉구 문장을 붙이지 않는다 */
  },
  {
    id: "R34", grade: "A", rate: 5, group: "balance",
    needs: ["actions", "runway", "deadline"],
    when: function (c) {
      return c.activeN >= 2 &&
             inSet(c.a.runway, ["m3_6", "m6_12", "y1over"]) &&
             inSet(c.a.deadline, ["m3", "m6"]);
    },
    say: function () {
      return {
        claim: "고민하고 있는 게 아니라 이미 진행 중이십니다",
        body: "지원도 하셨고, 버틸 돈도 계산해두셨고, 기한도 정해두셨습니다. " +
              "이 세 개가 다 있는 분은 생각보다 적습니다.",
        cushion: "리포트가 해드릴 건 결정을 부추기는 게 아니라, 놓친 게 없는지 확인해드리는 정도입니다."
      };
    }
  },
  {
    id: "R35", grade: "B", rate: 30, group: "quote",
    needs: ["scene", "drain"],
    when: function (c) { return !!(c.a.scene && String(c.a.scene).trim().length >= 10); },
    say: function (c) {
      return {
        claim: "그날 있었던 일이 예외가 아니라 이미 알고 있던 것의 한 장면이었습니다",
        body: "“" + String(c.a.scene).trim() + "”\n\n" +
              "그리고 가장 지치게 하는 것으로도 " + eul(L("drain", c.a.drainTop)) + " 고르셨습니다.",
        cushion: null
      };
    }
  }
  ];

  /* ---------- 실행 ---------- */
  function detect(answers, opt) {
    opt = opt || {};
    var c = ctxOf(answers, opt.tenureYears);
    var fired = [], locked = {}, i, r;

    /* 필요한 답이 없으면 아예 판정하지 않는다 */
    function ready(rule) {
      return (rule.needs || []).every(function (k) {
        var v = c.a[k];
        if (k === "drain") return !!c.a.drainTop;
        return v !== undefined && v !== null && v !== "";
      });
    }

    for (i = 0; i < RULES.length; i++) {
      r = RULES[i];
      if (!ready(r)) continue;
      var ok = false;
      try { ok = !!r.when(c); } catch (e) { ok = false; }
      if (!ok) continue;
      var s = r.say(c);
      fired.push({
        id: r.id, grade: r.grade, rate: r.rate, group: r.group,
        claim: s.claim, body: s.body, cushion: s.cushion || null,
        locks: r.locks || [], overrideAll: !!r.overrideAll, noPush: !!r.noPush
      });
    }

    /* 안전 규칙이 걸리면 다른 판정을 전부 접는다 */
    var override = fired.filter(function (x) { return x.overrideAll; })[0];
    if (override) {
      return {
        all: fired, picked: [override], suppressed: [],
        mode: "safety", noPush: true,
        note: "안전 분기 — 판정 대신 회복을 권한다"
      };
    }

    /* 억제 규칙이 잠그는 것들 */
    fired.forEach(function (x) {
      (x.locks || []).forEach(function (id) { locked[id] = x.id; });
    });
    var live = fired.filter(function (x) { return !locked[x.id]; });

    /* 억제 규칙 자체는 먼저 나가고, 나머지는 희소한 것부터 */
    var suppress = live.filter(function (x) { return x.grade === "suppress"; });
    var rest = live.filter(function (x) { return x.grade !== "suppress"; });

    /* A 의 순위가 0인데 `|| 3` 을 쓰면 0이 falsy 라서 3으로 뒤집힌다.
       그러면 B 가 A 보다 먼저 뽑힌다. 반드시 명시적으로 확인한다. */
    var gradeRank = { A: 0, B: 1, C: 2 };
    function rankOf(g) {
      return Object.prototype.hasOwnProperty.call(gradeRank, g) ? gradeRank[g] : 3;
    }
    rest.sort(function (x, y) {
      var g = rankOf(x.grade) - rankOf(y.grade);
      if (g) return g;
      return x.rate - y.rate;
    });

    /* 같은 그룹이 연달아 나오면 같은 말의 반복으로 읽힌다.
       다만 readiness·repeat 처럼 규칙이 많은 그룹까지 1개로 묶으면
       좋은 규칙이 영영 발화되지 않는다(실측: 33개 중 11개가 사장).
       → 그룹당 2개까지 허용하되, 두 번째는 A급만. */
    var groupCount = {}, picked = [];

    function take(x, limit) {
      var used = groupCount[x.group] || 0;
      if (used >= limit) return false;
      if (used >= 1 && x.grade !== "A") return false;   /* 두 번째 자리는 A급만 */
      groupCount[x.group] = used + 1;
      picked.push(x);
      return true;
    }

    suppress.forEach(function (x) { take(x, 1); });
    rest.forEach(function (x) {
      if (picked.length >= 4) return;
      take(x, 2);
    });

    /* 한 방향으로만 흐르지 않게 균형 규칙을 최소 하나 넣는다 */
    /* 한 방향으로만 흐르지 않게 균형 규칙을 하나 끼운다.
       다만 A급을 밀어내지는 않는다 — 가장 값진 문장을 버리게 된다. */
    var hasBalance = picked.some(function (x) { return x.group === "balance"; });
    if (!hasBalance) {
      var bal = rest.filter(function (x) {
        return x.group === "balance" && picked.indexOf(x) < 0;
      })[0];
      if (bal) {
        if (picked.length < 4) picked.push(bal);
        else {
          var swapAt = -1, j;
          for (j = picked.length - 1; j >= 0; j--) {
            if (picked[j].grade !== "A" && picked[j].grade !== "suppress") { swapAt = j; break; }
          }
          if (swapAt >= 0) picked[swapAt] = bal;
        }
      }
    }

    picked = picked.slice(0, 4);
    var aCount = picked.filter(function (x) { return x.grade === "A"; }).length;

    /* A급이 하나도 없으면 새 문장을 지어내지 않는다.
       대신 본인이 답한 것을 그대로 되짚어준다.
       "어긋나는 지점이 없다"는 것 자체가 정직한 정보다. */
    var echo = null;
    if (aCount === 0) {
      var lines = [];
      function push(qid, val) {
        if (val === undefined || val === null || val === "") return;
        lines.push(L(qid, val));
      }
      push("quitFrequency", c.a.quitFrequency);
      push("selfLabel", c.a.selfLabel);
      if (c.a.drainTop) lines.push("가장 지치게 하는 것은 " + L("drain", c.a.drainTop));
      push("runway", c.a.runway);
      push("deadline", c.a.deadline);
      if (c.B2 !== null && c.B3 !== null) {
        lines.push("남을 때의 후회 " + c.B2 + "점, 나갈 때의 후회 " + c.B3 + "점");
      }
      echo = {
        claim: "당신의 답변에는 서로 어긋나는 지점이 거의 없습니다",
        lines: lines,
        /* 예전에는 "드문 일입니다" 라고 썼다. 근거가 없는 희소성 주장이고,
           이 파일 맨 위에 적어둔 원칙(흔한 걸 특별하다고 부르지 않는다)을
           스스로 어기는 문장이었다. 실측만 남긴다. */
        note: "퇴사를 생각하면서 아직 크게 움직이지 않은 상태는 조사에서 절반이 넘습니다" +
              "(인크루트 51.7%). 그래서 이 리포트는 새로운 걸 알려드리기보다, " +
              "이미 정리해두신 것을 한 장으로 모아 보여드리는 쪽에 가깝습니다."
      };
    }

    return {
      all: fired,
      picked: picked,
      echo: echo,
      suppressed: Object.keys(locked),
      mode: picked.length ? (aCount ? "normal" : "echo") : "thin",
      noPush: picked.some(function (x) { return x.noPush; }),
      aCount: aCount
    };
  }

  global.Tension = { RULES: RULES, detect: detect, ctxOf: ctxOf };
})(typeof window !== "undefined" ? window : global);
