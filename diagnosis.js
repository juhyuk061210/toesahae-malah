/* =========================================================
   퇴사해말아? · 진단 엔진
   ---------------------------------------------------------
   설계 원칙 (기획안 §26, §29, §31)
     1) 사주 계산은 saju.js(deterministic)만 사용. LLM 금지.
     2) 해석은 규칙(rule) 기반으로 먼저 확정.
     3) 최종 산출물은 JSON. HTML/문장 생성은 렌더러가 담당.
        → 나중에 LLM을 붙일 때 이 JSON을 그대로 입력으로 넘긴다.

   출력 스키마
     {
       headline, type, matrix,
       scores: { careerPressure, changeFlow, preparation },
       pressureBreakdown: { 사람관계, 성장, 보상, 업무량 },
       causeSplit: { 회사환경, 직무적합, 관계스트레스 },
       monthlyFlow: [...12],
       changeWindows: [ {...}, {...} ],
       freeSections: [...],
       paidSections: [...],
       facts: {...}   // LLM 프롬프트에 넣을 사주 원자료
     }
   ========================================================= */
(function (global) {
  "use strict";

  var S = global.Saju;

  /* =========================================================
     설문 문항 정의 (렌더러가 이걸 읽어 화면을 그린다)
     ========================================================= */
  var QUESTIONS = [
    {
      id: "quitFrequency",
      title: "현재 얼마나 자주<br />퇴사를 생각하시나요?",
      options: [
        { v: "daily",    label: "거의 매일",            w: 100 },
        { v: "weekly",   label: "일주일에 몇 번",        w: 82 },
        { v: "hard",     label: "힘든 일이 있을 때",     w: 56 },
        { v: "sometimes",label: "가끔 생각나는 정도",    w: 34 },
        { v: "rarely",   label: "아직 진지하게 고민하진 않음", w: 14 }
      ]
    },
    {
      id: "quitReason",
      title: "가장 퇴사하고 싶은<br />이유는 무엇인가요?",
      options: [
        { v: "people",  label: "상사·동료 때문에",      axis: "사람관계" },
        { v: "pay",     label: "연봉·보상 때문에",      axis: "보상" },
        { v: "growth",  label: "성장하지 못하는 느낌",   axis: "성장" },
        { v: "fit",     label: "일이 나와 안 맞아서",    axis: "성장" },
        { v: "overwork",label: "과도한 업무·야근",      axis: "업무량" },
        { v: "future",  label: "회사의 미래가 불안해서", axis: "성장" },
        { v: "tired",   label: "그냥 너무 지쳐서",      axis: "업무량" },
        { v: "etc",     label: "기타",                 axis: null }
      ]
    },
    {
      id: "tenure",
      title: "지금 회사에서<br />얼마나 근무하셨나요?",
      options: [
        { v: "u1",  label: "1년 미만",   w: 42 },
        { v: "1_3", label: "1~3년",     w: 62 },
        { v: "3_5", label: "3~5년",     w: 82 },
        { v: "5_7", label: "5~7년",     w: 74 },
        { v: "7_10",label: "7~10년",    w: 62 },
        { v: "o10", label: "10년 이상",  w: 52 }
      ]
    },
    {
      id: "nextPlan",
      title: "회사를 나가면<br />가장 하고 싶은 것은?",
      options: [
        { v: "move",      label: "다른 회사로 이직", clarity: 12 },
        { v: "switch",    label: "전혀 다른 직무",   clarity: 6 },
        { v: "freelance", label: "프리랜서",         clarity: 8 },
        { v: "startup",   label: "창업",             clarity: 8 },
        { v: "rest",      label: "한동안 쉬기",       clarity: -4 },
        { v: "unknown",   label: "아직 모르겠다",     clarity: -14 }
      ]
    },
    {
      id: "preparation",
      title: "다음 선택을<br />실제로 준비하고 있나요?",
      options: [
        { v: "applying", label: "이미 지원하고 있다",        w: 94 },
        { v: "resume",   label: "이력서·포트폴리오를 준비했다", w: 71 },
        { v: "browsing", label: "가끔 채용공고만 본다",       w: 44 },
        { v: "thinking", label: "생각만 하고 있다",          w: 21 },
        { v: "nothing",  label: "아무 준비도 하지 않았다",     w: 7 }
      ]
    },
    {
      id: "mainQuestion",
      title: "지금 가장<br />알고 싶은 것은?",
      options: [
        { v: "stay",   label: "지금 회사에 계속 있어도 될지" },
        { v: "when",   label: "언제 움직이는 게 좋을지" },
        { v: "what",   label: "어떤 일이 나와 잘 맞는지" },
        { v: "better", label: "이직하면 지금보다 나아질지" },
        { v: "own",    label: "직장보다 사업·프리랜서가 맞는지" }
      ]
    },
    {
      id: "freeText",
      title: "지금 고민을<br />한 문장으로 적어주세요",
      desc: "적지 않고 넘어가도 괜찮아요.",
      type: "text",
      placeholder: "예) 연봉은 괜찮은데 팀장 때문에 매일 출근하기 싫어요",
      optional: true
    }
  ];

  function findOpt(qid, v) {
    var q = QUESTIONS.filter(function (x) { return x.id === qid; })[0];
    if (!q || !q.options) return null;
    return q.options.filter(function (o) { return o.v === v; })[0] || null;
  }

  var clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(n))); };

  /* =========================================================
     ① 직장 압박도 — 설문 기반
     ========================================================= */
  function scorePressure(a) {
    var freq = findOpt("quitFrequency", a.quitFrequency);
    var ten = findOpt("tenure", a.tenure);
    var base = (freq ? freq.w : 45) * 0.68 + (ten ? ten.w : 60) * 0.32;

    // 준비를 이미 하고 있으면 압박이 행동으로 옮겨간 상태 → 소폭 가산
    var prep = findOpt("preparation", a.preparation);
    if (prep && (prep.v === "applying" || prep.v === "resume")) base += 4;

    return clamp(base, 5, 98);
  }

  /* 압박의 구성 (사람관계 / 성장 / 보상 / 업무량) */
  function pressureBreakdown(a, pressure) {
    var axes = { 사람관계: 0, 성장: 0, 보상: 0, 업무량: 0 };
    var keys = Object.keys(axes);

    // 전체 압박 수준을 바닥값으로 깔고
    keys.forEach(function (k) { axes[k] = pressure * 0.55; });

    // 선택한 이유 축을 크게 올린다
    var reason = findOpt("quitReason", a.quitReason);
    if (reason && reason.axis) axes[reason.axis] += 32;

    // 세부 보정
    if (a.quitReason === "overwork" || a.quitReason === "tired") axes["업무량"] += 8;
    if (a.quitReason === "people") axes["사람관계"] += 6;
    if (a.quitReason === "pay") axes["보상"] += 6;
    if (a.quitReason === "future") axes["성장"] += 4;

    // 근속이 길수록 보상 불만이 누적되는 경향
    if (a.tenure === "5_7" || a.tenure === "7_10" || a.tenure === "o10") axes["보상"] += 7;
    // 근속이 짧으면 관계 스트레스가 상대적으로 크게 체감
    if (a.tenure === "u1" || a.tenure === "1_3") axes["사람관계"] += 5;

    keys.forEach(function (k) { axes[k] = clamp(axes[k], 8, 99); });
    return axes;
  }

  /* =========================================================
     ② 변화 흐름 — 사주 기반 (설문 미사용)
     ========================================================= */
  var MOVE_SIP = { 상관: 12, 식신: 7, 겁재: 9, 비견: 6, 편재: 8, 정재: 2 };
  var STAY_SIP = { 정관: -10, 편관: -5, 정인: -7, 편인: -3 };

  function sipDelta(name) {
    if (MOVE_SIP[name] !== undefined) return MOVE_SIP[name];
    if (STAY_SIP[name] !== undefined) return STAY_SIP[name];
    return 0;
  }

  function scoreChangeFlow(chart, daewoon, age, yearly, monthly) {
    var g = chart.group;
    var total = g.비겁 + g.식상 + g.재성 + g.관성 + g.인성 || 1;
    var v = 40;

    // 원국 성향
    v += (g.식상 / total) * 100 * 0.42;
    v += (g.비겁 / total) * 100 * 0.24;
    v -= (g.관성 / total) * 100 * 0.30;
    v -= (g.인성 / total) * 100 * 0.14;

    // 현재 대운 (가장 큰 영향)
    var dw = S.daewoonAt(daewoon, age);
    v += sipDelta(dw.sipsung) * 1.15;

    // 올해 세운
    if (yearly && yearly[0]) v += sipDelta(yearly[0].sipsung) * 0.85;

    // 향후 12개월 변동성 — 이동성 십성이 몇 달이나 들어오는가
    var movers = monthly.filter(function (m) {
      return MOVE_SIP[m.sipsung] !== undefined || MOVE_SIP[m.branchSipsung] !== undefined;
    }).length;
    v += (movers / 12) * 14;

    // 신강할수록 밖으로 뻗는 힘
    if (chart.strengthLabel === "신강") v += 5;
    if (chart.strengthLabel === "신약") v -= 4;

    return clamp(v, 8, 96);
  }

  /* =========================================================
     ③ 전환 준비도 — 설문 기반
     ========================================================= */
  function scorePreparation(a) {
    var p = findOpt("preparation", a.preparation);
    var n = findOpt("nextPlan", a.nextPlan);
    var v = (p ? p.w : 30) + (n ? n.clarity : 0);
    return clamp(v, 3, 97);
  }

  /* =========================================================
     회사가 문제인가, 일이 문제인가 (§18)
     ========================================================= */
  function causeSplit(a, bd) {
    var env = 46, fit = 46, rel = 42;

    switch (a.quitReason) {
      case "people":   rel += 34; env += 18; break;
      case "pay":      env += 24; break;
      case "growth":   env += 14; fit += 20; break;
      case "fit":      fit += 34; break;
      case "overwork": env += 26; rel += 8;  break;
      case "future":   env += 30; break;
      case "tired":    env += 16; rel += 10; fit += 8; break;
    }
    // 근속이 짧은데 적합도 문제면 직무 미스매치 가능성 ↑
    if ((a.tenure === "u1" || a.tenure === "1_3") && a.quitReason === "fit") fit += 8;
    // 오래 다녔는데 성장 불만이면 환경 문제 ↑
    if ((a.tenure === "5_7" || a.tenure === "7_10" || a.tenure === "o10") &&
        (a.quitReason === "growth" || a.quitReason === "future")) env += 8;

    rel = Math.max(rel, bd["사람관계"] * 0.9);

    return {
      회사환경: clamp(env, 10, 96),
      직무적합: clamp(fit, 10, 96),
      관계스트레스: clamp(rel, 10, 96)
    };
  }

  /* =========================================================
     4가지 결과 유형 (§9)
     ========================================================= */
  var TYPES = {
    A: {
      key: "A",
      name: "변화 준비형",
      tag: "마음도 환경도 같은 방향으로 움직이는 중",
      message: "이미 변화 쪽으로 마음과 환경이 함께 움직이고 있습니다.",
      detail: "지금 흔들리는 것은 충동이 아니라 방향입니다. 준비된 것들이 실제로 쌓여 있고, 사주에서도 변화의 기운이 함께 들어오고 있습니다. 다만 서두르는 것과 제때 움직이는 것은 다릅니다."
    },
    B: {
      key: "B",
      name: "탈출 충동형",
      tag: "마음의 속도와 준비의 속도가 다른 상태",
      message: "회사를 떠나고 싶은 마음과, 떠날 준비는 아직 다른 속도로 움직이고 있습니다.",
      detail: "지금 가장 위험한 건 회사가 아니라 준비 없이 내리는 결정입니다. 지금의 답답함은 진짜지만, 그 감정만으로 움직이면 다음 자리에서 같은 장면을 반복하기 쉽습니다."
    },
    C: {
      key: "C",
      name: "커리어 정체형",
      tag: "힘들어서가 아니라, 자라지 않아서",
      message: "힘들어서라기보다, 더 이상 여기서 커지는 느낌이 없어서 흔들리고 있습니다.",
      detail: "버틸 만한데 계속 마음이 뜨는 이유가 여기 있습니다. 문제는 강도가 아니라 정체입니다. 이런 경우 퇴사보다 역할 변화가 먼저 검토되어야 할 때가 많습니다."
    },
    D: {
      key: "D",
      name: "일시적 흔들림형",
      tag: "지금은 원인을 분리해볼 때",
      message: "직장을 바꾸는 것보다 지금 불편함의 원인을 먼저 분리해볼 필요가 있습니다.",
      detail: "현재 신호들은 구조적인 전환보다 일시적인 소모에 가깝게 나타납니다. 지금 결론을 내리면 나중에 후회할 가능성이 있는 구간입니다."
    }
  };

  function decideType(sc, bd, a) {
    var P = sc.careerPressure, F = sc.changeFlow, R = sc.preparation;

    // 성장 정체가 원인인가 — 임계값이 아니라 실제 응답과 상대 우위로 판정한다.
    // (절대 임계값을 쓰면 경계에서 유형이 튀는 문제가 있었다)
    var reasonIsGrowth = a && (a.quitReason === "growth" || a.quitReason === "fit" || a.quitReason === "future");
    var growthTop = bd["성장"] >= Math.max(bd["사람관계"], bd["보상"], bd["업무량"]);
    var growthDriven = reasonIsGrowth || growthTop;

    // 압박이 매우 높고 준비가 없으면 무조건 탈출 충동형
    if (P >= 62 && R < 45) return TYPES.B;
    // 흐름·준비·압박이 모두 갖춰지면 변화 준비형
    if (P >= 62 && F >= 58 && R >= 55) return TYPES.A;
    // 견딜 만한데 성장이 막혀 흔들리는 경우
    if (growthDriven && F >= 52 && P < 78 && R < 72) return TYPES.C;
    // 흐름도 준비도 낮으면 일시적 흔들림
    if (F < 50 && R < 45) return TYPES.D;

    // 경계 보정
    if (P >= 70) return R >= 55 ? TYPES.A : TYPES.B;
    if (growthDriven) return TYPES.C;
    if (R >= 55 && F >= 55) return TYPES.A;
    return TYPES.D;
  }

  /* =========================================================
     퇴사 매트릭스 (§25) — 준비도 × 변화흐름
     ========================================================= */
  function decideMatrix(sc) {
    var hiF = sc.changeFlow >= 55;
    var hiR = sc.preparation >= 50;
    var cell =
      !hiF && !hiR ? { key: "watch",   name: "관찰형",      x: 0, y: 0 } :
      !hiF &&  hiR ? { key: "explore", name: "탐색형",      x: 1, y: 0 } :
       hiF && !hiR ? { key: "prep",    name: "준비 우선형",  x: 0, y: 1 } :
                     { key: "shift",   name: "전환 준비형",  x: 1, y: 1 };

    var lines = {
      watch:   "변화의 기운도, 준비도 아직 조용한 구간입니다. 지금은 판단보다 관찰이 유리합니다.",
      explore: "준비는 되어 있지만 흐름이 아직 열리지 않았습니다. 기회를 넓게 탐색하며 때를 기다리기 좋습니다.",
      prep:    "변화 욕구와 직장 스트레스는 충분히 높지만, 다음 선택지의 준비 속도가 따라오지 못하고 있습니다.",
      shift:   "흐름과 준비가 같은 방향을 보고 있습니다. 전환을 구체적인 일정으로 옮길 수 있는 구간입니다."
    };
    cell.line = lines[cell.key];
    return cell;
  }

  /* =========================================================
     12개월 중 변화가 강해지는 구간 2곳 (§19)
     ========================================================= */
  function monthScore(m) {
    var v = 46;
    v += sipDelta(m.sipsung) * 1.6;
    v += sipDelta(m.branchSipsung) * 1.0;
    return clamp(v, 12, 95);
  }

  function findChangeWindows(monthly) {
    var scored = monthly.map(function (m, i) {
      return { i: i, score: monthScore(m), m: m };
    });
    var sorted = scored.slice().sort(function (a, b) { return b.score - a.score; });

    var picks = [sorted[0]];
    for (var k = 1; k < sorted.length && picks.length < 2; k++) {
      // 첫 구간과 최소 3개월 떨어진 곳을 두 번째로
      if (Math.abs(sorted[k].i - picks[0].i) >= 3) picks.push(sorted[k]);
    }
    if (picks.length < 2) picks.push(sorted[1]);
    picks.sort(function (a, b) { return a.i - b.i; });

    return picks.map(function (p, idx) {
      return {
        order: idx + 1,
        year: p.m.year,
        month: p.m.month,
        label: p.m.year + "년 " + p.m.month + "월",
        ganji: p.m.ganji,
        sipsung: p.m.sipsung,
        score: p.score,
        note: windowNote(p.m.sipsung)
      };
    });
  }

  var WINDOW_NOTE = {
    상관: "틀을 벗어나고 싶은 마음이 가장 강해지는 구간입니다. 실행력이 붙는 대신 관계 마찰도 함께 커질 수 있습니다.",
    식신: "해온 것이 결과로 드러나기 쉬운 구간입니다. 준비한 것을 밖으로 내보이기 좋습니다.",
    편재: "새로운 기회와 제안이 들어오기 쉬운 구간입니다. 선택지가 늘어나는 시기입니다.",
    정재: "안정과 실속을 챙기기 좋은 구간입니다. 큰 이동보다 조건을 다지는 편이 유리합니다.",
    비견: "스스로 판단해 밀어붙이기 좋은 구간입니다. 동료·파트너와의 협업에서 실마리가 나옵니다.",
    겁재: "경쟁과 확장의 기운이 강해집니다. 승부를 걸 수 있지만 손실 관리가 필요합니다.",
    정관: "조직 안에서 인정받기 쉬운 구간입니다. 지금 나가면 아까운 기회를 놓칠 수 있습니다.",
    편관: "책임과 부담이 몰리는 구간입니다. 견디면 위상이 오르지만 소모도 큽니다.",
    정인: "쉬어가며 정비하기 좋은 구간입니다. 무리한 확장보다 회복이 어울립니다.",
    편인: "속도를 늦추고 다시 배우기 좋은 구간입니다. 자격·기술 준비에 적합합니다."
  };
  function windowNote(s) { return WINDOW_NOTE[s] || "흐름이 바뀌는 구간입니다."; }

  /* =========================================================
     직장생활 성향 (§17) — 사주 기반
     ========================================================= */
  function workStyle(chart) {
    var g = chart.group;
    var total = g.비겁 + g.식상 + g.재성 + g.관성 + g.인성 || 1;
    var top = ["비겁", "식상", "재성", "관성", "인성"].reduce(function (a, b) {
      return g[b] > g[a] ? b : a;
    }, "비겁");

    var MAP = {
      식상: {
        headline: "안정만으로 오래 버티는 타입은 아닙니다.",
        body: "반복되는 환경에서 안정감을 느끼기보다, 내가 성장하고 있다는 감각이 있을 때 오래 버티는 성향이 강하게 나타납니다. 재량이 주어질수록 성과가 좋아지고, 통제가 촘촘할수록 빠르게 지칩니다.",
        env: ["재량이 있는 역할", "결과로 평가받는 구조", "새로 만들 여지가 있는 일"]
      },
      관성: {
        headline: "구조가 분명할 때 가장 강한 타입입니다.",
        body: "역할과 기준이 명확한 환경에서 능력이 제대로 발휘됩니다. 책임을 지는 자리에서 신뢰가 쌓이고, 그 신뢰가 시간이 지날수록 자산이 되는 유형입니다. 반대로 기준이 모호한 조직에서는 소모가 큽니다.",
        env: ["역할이 명확한 조직", "평가 기준이 분명한 구조", "장기적으로 쌓이는 커리어"]
      },
      재성: {
        headline: "보상이 납득될 때 움직이는 타입입니다.",
        body: "명분보다 결과, 과정보다 보상에 정직하게 반응합니다. 지금 마음이 흔들린다면 일이 싫은 게 아니라 노력 대비 보상이 맞지 않는다는 신호를 몸이 먼저 읽은 것일 수 있습니다.",
        env: ["성과가 보상으로 연결되는 구조", "협상 여지가 있는 조건", "숫자로 증명되는 일"]
      },
      인성: {
        headline: "쌓인 깊이가 무기가 되는 타입입니다.",
        body: "즉각적인 성과보다 전문성이 축적됐을 때 가치가 드러납니다. 지식과 자격이 곧 방패가 되는 유형이라, 조급하게 움직이면 오히려 손해를 보기 쉽습니다.",
        env: ["전문성이 인정되는 분야", "배움이 이어지는 환경", "긴 호흡의 프로젝트"]
      },
      비겁: {
        headline: "대등한 위치에서 힘이 나는 타입입니다.",
        body: "누군가의 지시 아래보다 동등한 관계에서 실력을 겨룰 때 진가가 드러납니다. 조직에 있어도 사실상 자기 사업처럼 일할 때 성과가 가장 좋습니다.",
        env: ["자율성이 큰 역할", "수평적인 팀", "내 이름이 남는 일"]
      }
    };

    var m = MAP[top];
    return {
      dominant: top,
      headline: m.headline,
      body: m.body,
      goodEnv: m.env,
      evidence: [
        { k: "식상", v: g.식상, hint: "표현·자율" },
        { k: "관성", v: g.관성, hint: "조직·책임" },
        { k: "재성", v: g.재성, hint: "보상·실리" },
        { k: "인성", v: g.인성, hint: "학습·안정" },
        { k: "비겁", v: g.비겁, hint: "자립·경쟁" }
      ]
    };
  }

  /* =========================================================
     이직해도 반복될 수 있는 패턴 (CHAPTER 05)
     ========================================================= */
  function repeatPatterns(chart, a) {
    var g = chart.group, out = [];
    if (g.식상 >= 3) out.push("자율성이 막히면 흥미가 급격히 떨어집니다. 환경이 바뀌어도 통제가 촘촘하면 같은 답답함이 반복될 수 있습니다.");
    if (g.관성 >= 3) out.push("책임을 과하게 떠안는 편입니다. 새 조직에서도 어느새 짐이 몰릴 가능성이 있습니다.");
    if (g.관성 === 0) out.push("위계와 규율에 민감합니다. 조직 형태가 비슷하면 같은 마찰이 생기기 쉽습니다.");
    if (g.재성 >= 3) out.push("보상 기준이 명확하지 않으면 동기가 빠르게 식습니다. 연봉만 올려 옮기면 같은 시점에 다시 흔들릴 수 있습니다.");
    if (g.인성 >= 3) out.push("준비가 충분하다는 확신이 설 때까지 미루는 경향이 있습니다. 결정을 미루는 습관 자체가 반복될 수 있습니다.");
    if (a.quitReason === "people") out.push("특정 인물과의 갈등이 판단 전체를 흔드는 경향이 있습니다. 사람 문제와 조직 문제를 분리해두지 않으면 다음에도 같은 방식으로 힘들어집니다.");
    if (chart.strengthLabel === "신약") out.push("주변 분위기에 영향을 크게 받습니다. 팀 상태에 따라 만족도가 크게 출렁일 수 있습니다.");
    if (!out.length) out.push("초반에는 몰입도가 높지만 반복 업무가 길어지면 동기가 떨어지는 편입니다.");
    return out.slice(0, 4);
  }

  /* =========================================================
     직장 / 프리랜서 / 사업 적합 성향 (CHAPTER 09)
     ========================================================= */
  function pathFit(chart) {
    var g = chart.group;
    var total = g.비겁 + g.식상 + g.재성 + g.관성 + g.인성 || 1;
    var org = 50 + (g.관성 / total) * 100 * 0.42 + (g.인성 / total) * 100 * 0.2
                 - (g.식상 / total) * 100 * 0.24;
    var free = 46 + (g.식상 / total) * 100 * 0.44 + (g.비겁 / total) * 100 * 0.18
                  - (g.관성 / total) * 100 * 0.2;
    var biz = 44 + (g.재성 / total) * 100 * 0.38 + (g.비겁 / total) * 100 * 0.3
                 - (g.인성 / total) * 100 * 0.16;
    if (chart.strengthLabel === "신강") { biz += 5; free += 3; }
    if (chart.strengthLabel === "신약") { org += 5; }
    return {
      직장: clamp(org, 12, 95),
      프리랜서: clamp(free, 12, 95),
      사업: clamp(biz, 12, 95)
    };
  }

  /* =========================================================
     지금 먼저 정리할 것 (CHAPTER 10) — 결정을 대신하지 않는다
     ========================================================= */
  function firstStep(type, sc, win) {
    if (type.key === "B") {
      return {
        headline: "결론보다 먼저, 다음 선택지를 하나만 구체화해보세요.",
        body: "현재 결과에서는 변화 욕구가 높은 반면 준비도가 낮게 나타납니다. 지금 결론을 내리기보다, 다음 선택지를 하나만 실제로 만들어보면서 자신의 반응을 관찰하는 편이 좋겠습니다. 이력서를 고쳐 쓰는 것만으로도 감정과 판단이 분리되기 시작합니다."
      };
    }
    if (type.key === "A") {
      return {
        headline: "움직일 시점을 감정이 아니라 일정으로 정해두세요.",
        body: "흐름과 준비가 같은 방향을 보고 있습니다. 다만 지금 필요한 건 결심이 아니라 기한입니다. " + (win[0] ? win[0].label + " 전후가 흐름이 크게 달라지는 구간으로 나타나므로, 그 시점을 기준으로 역산해 준비를 마무리해두면 같은 노력으로 더 나은 결과를 얻을 수 있습니다." : "")
      };
    }
    if (type.key === "C") {
      return {
        headline: "회사를 옮기기 전에 역할을 옮겨볼 수 있는지 먼저 확인하세요.",
        body: "지금의 흔들림은 강도의 문제가 아니라 정체의 문제로 나타납니다. 이런 경우 이동 비용을 치르지 않고도 환경을 바꾸는 방법이 남아 있는지 먼저 확인하는 편이 유리합니다. 그래도 달라지지 않는다면 그때는 근거가 분명한 이동이 됩니다."
      };
    }
    return {
      headline: "지금은 결정을 내리기보다 원인을 분리해볼 때입니다.",
      body: "현재 신호들은 구조적인 전환보다 일시적인 소모에 가깝게 나타납니다. 회사 때문인지, 특정 시기 때문인지, 몸 상태 때문인지를 2~3주만 따로 기록해보면 판단이 훨씬 명확해집니다."
    };
  }

  /* =========================================================
     메인 — 진단 실행
     ========================================================= */
  function diagnose(payload) {
    var a = payload.answers || {};
    var b = payload.birth || {};
    var name = payload.name || "고객";

    /* 음력 입력이면 양력으로 변환한 뒤 사주를 뽑는다.
       (사주 계산은 절기 기준이므로 반드시 양력이어야 함) */
    var solar = { year: b.year, month: b.month, day: b.day };
    if (b.calendar === "lunar" && global.Lunar) {
      var conv = global.Lunar.toSolar(b.year, b.month, b.day, !!b.isLeapMonth);
      if (conv) solar = conv;
    }

    var chart = S.computeChart({
      year: solar.year, month: solar.month, day: solar.day,
      hourKnown: !!b.hourKnown, hour: b.hour, minute: b.minute || 0
    });

    /* 심화 엔진이 로드돼 있으면 함께 돌린다.
       없으면 기존 방식 그대로 — 서비스는 어느 쪽이든 동작한다. */
    var deep = null;
    try {
      if (global.SajuAnalyze && global.SajuRead && global.SajuDeep) {
        var GK = global.SajuDeep.GAN, JK = global.SajuDeep.JI;
        var hp = chart.pillars.hour || chart.pillars.day;
        var dp = {
          년간: GK[chart.pillars.year.gan],  년지: JK[chart.pillars.year.ji],
          월간: GK[chart.pillars.month.gan], 월지: JK[chart.pillars.month.ji],
          일간: GK[chart.pillars.day.gan],   일지: JK[chart.pillars.day.ji],
          시간: GK[hp.gan],                  시지: JK[hp.ji]
        };
        var da = global.SajuAnalyze.analyze({
          pillars: dp,
          birth: { year: solar.year, month: solar.month, day: solar.day,
                   hour: b.hourKnown ? b.hour : 12, minute: b.minute || 0,
                   hourKnown: !!b.hourKnown },
          hourKnown: !!b.hourKnown,
          termIdx: chart.termIdx, termYear: chart.termYear
        });
        deep = { analyze: da, read: global.SajuRead.read(da) };
      }
    } catch (e) { deep = null; }

    var now = payload.now || new Date();
    var nowYear = now.getFullYear();
    var nowMonth = now.getMonth() + 1;
    var age = nowYear - b.year + 1; // 한국식 나이 근사

    var daewoon = S.computeDaewoon(chart, b.gender || "M", 9);
    var yearly = S.computeYearly(chart, nowYear, 3);
    var monthly = S.computeMonthlyFlow(chart, nowYear, nowMonth, 12);

    /* 새 질문지를 거쳐 온 경우 bridge 가 더 정확한 점수를 미리 계산해 둔다.
       실제로 한 행동 12개를 물어보므로 자기보고보다 신뢰도가 높다. */
    var careerPressure = (a._scores && typeof a._scores.careerPressure === "number")
      ? a._scores.careerPressure : scorePressure(a);
    var bd = a._breakdown || pressureBreakdown(a, careerPressure);
    var changeFlow = scoreChangeFlow(chart, daewoon, age, yearly, monthly);
    var preparation = (a._scores && typeof a._scores.preparation === "number")
      ? a._scores.preparation : scorePreparation(a);

    var scores = {
      careerPressure: careerPressure,
      changeFlow: changeFlow,
      preparation: preparation
    };

    var type = decideType(scores, bd, a);
    var matrix = decideMatrix(scores);
    var windows = findChangeWindows(monthly);
    var style = workStyle(chart);
    var split = causeSplit(a, bd);
    var paths = pathFit(chart);
    var patterns = repeatPatterns(chart, a);
    var step = firstStep(type, scores, windows);
    var curDw = S.daewoonAt(daewoon, age);

    var flowSeries = monthly.map(function (m) {
      return {
        year: m.year, month: m.month,
        label: m.year + "." + String(m.month).padStart(2, "0"),
        ganji: m.ganji, sipsung: m.sipsung,
        score: monthScore(m)
      };
    });

    /* ---- 무료 구간 ---- */
    var freeSections = [
      {
        id: "pressure",
        kind: "score",
        title: name + "님의 현재 직장 압박도",
        score: careerPressure,
        level: careerPressure >= 75 ? "높음" : careerPressure >= 50 ? "보통" : "낮음",
        bars: [
          { label: "사람관계", value: bd["사람관계"] },
          { label: "성장",     value: bd["성장"] },
          { label: "보상",     value: bd["보상"] },
          { label: "업무량",   value: bd["업무량"] }
        ]
      },
      (function () {
        /* 심화 판정이 있으면 그걸 쓴다.
           여기가 "어 이거 내 얘기네" 가 나와야 하는 자리다.
           근거를 함께 보여줘야 점쟁이 말이 아니라 확인 가능한 말이 된다. */
        var base = {
          id: "style",
          kind: "style",
          title: "사주로 보는 직장생활 성향",
          headline: style.headline,
          body: style.body,
          evidence: style.evidence,
          dominant: style.dominant
        };
        if (!deep) return base;

        /* 무료 화면에서는 "흔한 판정"보다 "이 사람만의 판정"을 먼저 보여준다.
           신강·신약은 절반쯤은 같게 나오므로 뒤로 민다. */
        function distinctRank(tag) {
          if (tag.indexOf("격국_") === 0) return 0;      // 10종 × 성격/파격
          if (tag === "퇴사트리거") return 1;
          if (["조직소속형", "비소속형", "관성불안정"].indexOf(tag) >= 0) return 2;
          if (["상관견관", "상관견관_재성중재", "식상왕", "비겁왕",
               "재다신약", "관성과다"].indexOf(tag) >= 0) return 3;
          if (tag.indexOf("신살_") === 0) return 4;
          if (["충", "형", "국", "합", "합충구도"].indexOf(tag) >= 0) return 5;
          if (tag.indexOf("국면_") === 0) return 6;
          if (["유리환경", "불리환경"].indexOf(tag) >= 0) return 7;
          return 9;                                       // 신강·신약·중화
        }

        var core = deep.read.readings
          .filter(function (r) { return r.strength === "핵심"; })
          .sort(function (a, b2) { return distinctRank(a.tag) - distinctRank(b2.tag); });
        if (!core.length) return base;

        var g = deep.analyze.gyukguk;
        var st = deep.analyze.strength;
        var picks = core.slice(0, 3);

        base.headline = picks[0].claim;
        base.body = picks.map(function (r) { return r.detail; }).join(" ");
        base.proofs = picks.map(function (r) {
          return { claim: r.claim, evidence: r.evidence };
        });
        base.chartLine =
          deep.analyze.pillars.년간 + deep.analyze.pillars.년지 + " " +
          deep.analyze.pillars.월간 + deep.analyze.pillars.월지 + " " +
          deep.analyze.pillars.일간 + deep.analyze.pillars.일지 +
          (b.hourKnown
            ? " " + deep.analyze.pillars.시간 + deep.analyze.pillars.시지
            : " (시주 미상)");
        base.gyuk = g.display;
        base.strengthLabel = st.label;
        base.saryeong = deep.analyze.saryeong
          ? deep.analyze.saryeong.gan + "(" + deep.analyze.saryeong.layer + ")"
          : null;
        return base;
      })(),
      {
        id: "cause",
        kind: "split",
        title: "회사가 싫은 걸까, 일이 싫은 걸까?",
        verdict: split.회사환경 >= split.직무적합
          ? "회사 환경의 영향이 더 큽니다."
          : "직무 적합도의 영향이 더 큽니다.",
        bars: [
          { label: "회사 환경",   value: split.회사환경 },
          { label: "직무 적합",   value: split.직무적합 },
          { label: "관계 스트레스", value: split.관계스트레스 }
        ],
        /* 판정과 본문이 같은 기준을 봐야 한다.
           예전에는 판정은 '직무', 본문은 '환경'이라고 말하는 경우가 있었다. */
        body: (function () {
          var top = "회사환경", topV = split.회사환경;
          if (split.직무적합 > topV) { top = "직무적합"; topV = split.직무적합; }
          if (split.관계스트레스 > topV) { top = "관계스트레스"; topV = split.관계스트레스; }
          var vals = [split.회사환경, split.직무적합, split.관계스트레스];
          var gap = topV - Math.min.apply(null, vals);
          if (gap < 10) {
            return "세 항목의 차이가 크지 않습니다. 특정 하나가 원인이라기보다 " +
                   "전반적으로 소모되고 있는 상태에 가깝습니다.";
          }
          if (top === "관계스트레스") {
            return "현재 고민의 중심에는 업무 자체보다 사람 관계가 더 크게 자리 잡고 있습니다.";
          }
          if (top === "직무적합") {
            return "지금 힘든 이유는 환경보다 일 자체와의 결이 맞지 않는 데 가깝습니다.";
          }
          return "지금의 어려움은 특정 업무보다 조직 환경 전반에서 오는 쪽에 가깝습니다.";
        })()
      }
    ];

    /* ---- 유료 구간 (10 챕터) ---- */
    var paidSections = [
      { no: 1,  id: "why",      title: "나는 왜 지금 흔들리고 있을까?",
        body: type.detail, extra: a.freeText || null },
      { no: 2,  id: "env",      title: "나는 어떤 환경에서 오래 일하는 사람인가?",
        body: style.body, list: style.goodEnv },
      { no: 3,  id: "hard",     title: "지금 회사에서 힘든 진짜 이유",
        bars: freeSections[0].bars, body: freeSections[2].body },
      { no: 4,  id: "which",    title: "회사가 안 맞는 걸까, 직무가 안 맞는 걸까?",
        bars: freeSections[2].bars, body: freeSections[2].verdict },
      { no: 5,  id: "repeat",   title: "퇴사해도 반복될 수 있는 내 패턴",
        list: patterns },
      { no: 6,  id: "flow",     title: "앞으로 12개월 직장 흐름",
        series: flowSeries },
      { no: 7,  id: "windows",  title: "변화가 강해지는 구간",
        windows: windows,
        body: "현재 대운은 " + curDw.ganji + "(" + curDw.sipsung + ") 구간입니다." },
      { no: 8,  id: "next",     title: "다음 직장에서 찾아야 하는 환경",
        list: style.goodEnv },
      { no: 9,  id: "path",     title: "직장 · 프리랜서 · 사업 적합 성향",
        bars: [
          { label: "직장",     value: paths.직장 },
          { label: "프리랜서", value: paths.프리랜서 },
          { label: "사업",     value: paths.사업 }
        ] },
      { no: 10, id: "first",    title: "그래서 지금 무엇부터 정리해야 할까?",
        headline: step.headline, body: step.body }
    ];

    return {
      name: name,
      headline: type.message,
      type: { key: type.key, name: type.name, tag: type.tag, detail: type.detail },
      matrix: matrix,
      scores: scores,
      pressureBreakdown: bd,
      causeSplit: split,
      pathFit: paths,
      monthlyFlow: flowSeries,
      changeWindows: windows,
      freeSections: freeSections,
      paidSections: paidSections,
      /* LLM 서술 생성 시 그대로 넘길 사주 원자료 (§26 3단계) */
      solarBirth: solar,
      facts: {
        pillars: {
          year: S.pillarText(chart.pillars.year).ko,
          month: S.pillarText(chart.pillars.month).ko,
          day: S.pillarText(chart.pillars.day).ko,
          hour: chart.pillars.hour ? S.pillarText(chart.pillars.hour).ko : null
        },
        ilgan: S.GAN[chart.dayGan],
        strength: chart.strengthLabel,
        elements: chart.oh,
        tenGods: chart.ss,
        tenGodGroups: chart.group,
        daewoon: { startAge: daewoon.startAge, forward: daewoon.forward, current: curDw },
        yearly: yearly,
        age: age
      }
    };
  }

  global.Diagnosis = {
    QUESTIONS: QUESTIONS,
    diagnose: diagnose,
    TYPES: TYPES
  };
})(window);
