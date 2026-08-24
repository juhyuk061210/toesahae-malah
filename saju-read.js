/* =========================================================
   통변(通辯) — 판정 결과를 "읽어낸 것"으로 바꾼다
   ---------------------------------------------------------
   saju-analyze.js 가 뽑아낸 사실을 받아, 직장·퇴사 맥락의
   해석 태그로 옮긴다. 문장은 여기서 만들지 않는다.
   여기서 만드는 것은 "무엇을 말할 수 있는가 + 그 근거"이고,
   실제 문장은 서술 단계(LLM 또는 템플릿)에서 만든다.

   설계 원칙 — 조사에서 가장 강하게 나온 것:
     "근거가 붙지 않는 단정은 정의상 바넘 문장입니다."
   그래서 모든 읽기에 evidence 를 강제한다. 근거를 못 다는
   읽기는 애초에 만들지 않는다.
   ========================================================= */
(function (global) {
  "use strict";

  var D = global.SajuDeep;
  if (!D) throw new Error("saju-deep.js 가 먼저 로드되어야 합니다.");

  /* 챕터 키 — 리포트 10장 */
  var CH = {
    WHY:      "why",       // 1 나는 왜 지금 흔들리고 있을까
    ENV:      "env",       // 2 어떤 환경에서 오래 일하는가
    HARD:     "hard",      // 3 지금 회사에서 힘든 진짜 이유
    FIT:      "which",     // 4 회사가 안 맞나 직무가 안 맞나
    REPEAT:   "repeat",    // 5 퇴사해도 반복될 패턴
    FLOW:     "flow",      // 6 앞으로 12개월 흐름
    WINDOW:   "windows",   // 7 변화가 강해지는 구간
    NEXT:     "next",      // 8 다음 직장에서 찾아야 할 환경
    PATH:     "path",      // 9 직장·프리랜서·사업 성향
    FIRST:    "first"      // 10 무엇부터 정리할까
  };

  function ev(parts) { return parts.filter(Boolean).join(" + "); }

  /* 받침 유무로 조사를 고른다. "계·경이(가)" 같은 표기가 남으면
     그 한 곳 때문에 나머지 문장까지 기계가 쓴 것처럼 읽힌다. */
  function josa(w, withB, without) {
    var c = String(w).charCodeAt(String(w).length - 1);
    if (c < 0xac00 || c > 0xd7a3) return withB;
    return ((c - 0xac00) % 28) ? withB : without;
  }
  function iga(w) { return w + josa(w, "이", "가"); }

  /* 같은 뜻을 여러 벌 써두고 명식마다 다른 것을 고른다.
     고정 문구를 그대로 두면 모든 리포트에 100% 등장한다.
     같은 명식이면 언제나 같은 문장이 나온다(재현성). */
  var _seed = 0, _n = 0;
  function seedFrom(a) {
    var p = a.pillars;
    var src = p.년간 + p.년지 + p.월간 + p.월지 + p.일간 + p.일지 + p.시간 + p.시지 +
              (a.strength ? a.strength.S : "") + (a.gyukguk ? a.gyukguk.display : "");
    var h = 5381, i;
    for (i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) & 0x7fffffff;
    _seed = h; _n = 0;
  }
  function V(list) {
    if (!list || !list.length) return "";
    _n++;
    return list[(_seed + _n * 2654435761) % list.length];
  }

  /* =========================================================
     관성 상태 — 조직 적합도의 1차 좌표
     조사에서 가장 강한 규칙이었다. 관성이 살아 있으면
     소속이 정체성을 지탱하고, 없으면 소속이 숨막힘이 된다.
     ========================================================= */
  /* 관성 = 조직·직함·평가체계와의 관계. 퇴사 앱에서 가장 중요한 축이다.

     예전에는 세 갈래(건재/부재/무근+손상)뿐이라 세 명 중 두 명이
     같은 문장을 읽었다. 원인이 두 개였다.
       (1) 지장간 여기·중기까지 전부 통근으로 세서 대부분이 "뿌리 있음" 이 됐다.
       (2) 올해 세운까지 섞어서 판정했다. 평생 구조를 보면서 올해를 섞으면
           같은 해에 태어나지도 않은 사람들이 같은 결론으로 몰린다.
     그래서 지장간은 층별로 무게를 다르게 주고, 관계는 원국만 본다. */
  function readGwanseong(a) {
    var p = a.pillars, il = a.ilgan, out = [];
    var tugan = [p.년간, p.월간, p.시간];

    var gwanGan = tugan.filter(function (g) {
      return D.SS_GROUP[D.sipsung(il, g)] === "관성";
    });
    var gwanOh = D.groupToOh(il, "관성");

    /* 통근 — 지장간 층과 자리에 따라 무게가 다르다.
       정기(본기)에 앉은 것과 여기에 살짝 걸친 것은 같지 않다.
       월지는 사령 자리라 가장 무겁고, 시지는 가장 가볍다. */
    var LAYER_R = { 정기: 1.0, 중기: 0.5, 여기: 0.3 };
    var SLOT_R  = { 월지: 1.5, 일지: 1.2, 년지: 1.0, 시지: 0.8 };
    var rooted = [], rootW = 0, slots = ["년지", "월지", "일지", "시지"];
    slots.forEach(function (sl) {
      D.JIJANGGAN[p[sl]].forEach(function (seg) {
        if (D.GAN_OH[seg.g] !== gwanOh) return;
        var w = (LAYER_R[seg.layer] || 0.3) * (SLOT_R[sl] || 1);
        rooted.push({ slot: sl, ji: p[sl], gan: seg.g, layer: seg.layer, w: w });
        rootW += w;
      });
    });
    rooted.sort(function (x, y) { return y.w - x.w; });

    /* 손상 판정 — 원국 안에서만 본다. 대운·세운은 시기 이야기지 구조가 아니다. */
    var hapGan = gwanGan.filter(function (g) { return tugan.indexOf(D.GAN_HAP[g]) >= 0; });
    var voidRoot = rooted.filter(function (r) { return a.sinsal.gongmangDay.indexOf(r.ji) >= 0; });
    var natal = (a.natalRelations && a.natalRelations.list) || [];
    var hitRoot = [];
    natal.forEach(function (r) {
      if (["육충", "삼형", "상형"].indexOf(r.type) < 0) return;
      r.slots.forEach(function (sl) {
        rooted.forEach(function (x) { if (x.slot === sl && hitRoot.indexOf(x) < 0) hitRoot.push(x); });
      });
    });

    var score = a.score.group["관성"];
    var total = 0; for (var k in a.score.group) total += a.score.group[k];
    var ratio = total ? score / total : 0;

    /* 손상은 "관성을 지탱하던 뿌리 중 얼마나"로 본다.
       뿌리가 다섯인데 하나 깨진 것과 하나뿐인데 그게 깨진 것은 다르다. */
    var voidW = 0, hitW = 0;
    voidRoot.forEach(function (r) { voidW += r.w; });
    hitRoot.forEach(function (r) { hitW += r.w; });
    var voidShare = rootW ? voidW / rootW : 0;
    var hitShare  = rootW ? hitW / rootW : 0;

    /* 순서가 중요하다. 손상 검사를 뒤로 미루면 "뿌리는 있는데 안 드러남"
       한 갈래에 절반이 몰린다. 뿌리가 깨졌는지를 먼저 보고,
       그다음에 천간에 드러났는지를 본다.
       뿌리가 월지(직장·사회 자리)에 있는지도 갈라 준다 —
       퇴사 앱에서 월지에 걸린 사람과 시지에 걸린 사람은 다른 이야기다. */
    var wolRoot = rooted.some(function (r) { return r.slot === "월지" && r.w >= 0.9; });

    var state;
    if (rootW < 0.4 && !gwanGan.length)            state = "부재";
    else if (rootW < 0.4)                          state = "무근";
    else if (voidShare >= 0.5)                     state = "공망";
    else if (hitShare >= 0.5)                      state = "충형손상";
    else if (gwanGan.length && hapGan.length === gwanGan.length) state = "합거";
    else if (!gwanGan.length && wolRoot)           state = "월령소속";
    else if (!gwanGan.length)                      state = "유근무투";
    else if (rootW < 1.0 || ratio < 0.12)          state = "약함";
    else                                           state = "건재";

    var evParts = [
      gwanGan.length ? "천간 관성 " + gwanGan.join("·") : "천간에 관성 없음",
      rooted.length ? rooted[0].slot + " " + rooted[0].ji + " " + rooted[0].layer + "에 통근"
                    : "지지에 뿌리 없음",
      /* "뿌리 무게 2.6" 은 내부 계산값이다. 손님에게는 개인 측정치처럼
         보이는데 실제로는 이 엔진 안에서만 뜻이 있는 숫자다. 내보내지 않는다. */
      rooted.length > 1 ? "다른 자리에도 " + (rooted.length - 1) + "곳 뿌리" : null,
      hapGan.length ? "합거 " + hapGan.join("·") : null,
      voidShare >= 0.5 ? "뿌리 공망" : null,
      hitShare >= 0.5 ? "뿌리 충형" : null
    ];
    var evidence = ev(evParts);

    /* 여덟 갈래에 각각 다른 이야기를 붙인다.
       "A가 아니라 B" 구문과 "~구조입니다" 종결이 몰리지 않게 흩어 쓴다. */
    var SAY = {
      건재: { tag: "조직소속형", ch: [CH.ENV, CH.PATH, CH.NEXT],
        claim: "직함과 소속이 자기 자리를 지탱하는 편",
        detail: "그만둘 때 수입 걱정보다 '내가 누구인지 모르겠다'가 먼저 옵니다. " +
                "혼자 일하게 되더라도 법인이든 자격증이든 계약서든, 형식이 하나 있어야 안정되십니다." },

      월령소속: { tag: "월령소속형", ch: [CH.ENV, CH.PATH, CH.WHY],
        claim: "직장이라는 판 자체가 삶의 중심에 놓여 있는 배치",
        detail: "일을 좋아하느냐와는 별개로, 회사가 하루의 축이 되어 있습니다. " +
                "그래서 그만두는 상상을 하면 시간표부터 무너집니다. " +
                "옮기실 때 연봉보다 하루가 어떻게 짜이는지를 먼저 보시는 편이 낫습니다." },

      유근무투: { tag: "조직잠재형", ch: [CH.ENV, CH.WHY, CH.PATH],
        claim: "조직에서 버틸 힘은 있는데 겉으로 드러나지 않는 배치",
        detail: "안에서는 자리를 지키시는데 밖에서 보이는 직함이나 평가로는 잘 안 잡힙니다. " +
                "그래서 인정이 늦게 옵니다. 티가 나는 자리로 옮기면 체감이 크게 달라집니다." },

      무근: { tag: "관성불안정", ch: [CH.WHY, CH.HARD, CH.REPEAT],
        claim: "소속을 원하면서도 그 소속이 오래 버텨주지 않는 배치",
        detail: "조직을 붙잡고 싶은 마음과, 그 조직이 받쳐주지 못하는 현실이 겹칩니다. " +
                "이 어긋남 때문에 퇴사 고민이 반복됩니다." },

      합거: { tag: "관성합거", ch: [CH.WHY, CH.HARD, CH.NEXT],
        claim: "직함이 붙어 있어도 실권은 다른 데 가 있는 자리",
        detail: "책임은 오는데 결정권은 옆으로 새는 배치입니다. " +
                "일한 만큼 이름이 남지 않는 느낌이 반복되면 원인이 여기일 수 있습니다." },

      공망: { tag: "관성공망", ch: [CH.WHY, CH.REPEAT, CH.PATH],
        claim: "자리를 얻어도 며칠이면 허전해지는 자리",
        detail: "직위나 인정을 못 받는다는 뜻이 아닙니다. 받아도 오래 채워지지 않습니다. " +
                "승진해도 금방 다시 비는 감각이 있다면 여기서 옵니다." },

      충형손상: { tag: "관성손상", ch: [CH.HARD, CH.REPEAT, CH.WHY],
        claim: "자리가 자주 흔들리는 배치",
        detail: "조직이 바뀌거나, 위가 바뀌거나, 평가 기준이 바뀌는 일을 남들보다 자주 겪으십니다. " +
                "본인 탓으로 돌리기 쉬운데 구도상 그렇게 걸려 있습니다." },

      약함: { tag: "관성미약", ch: [CH.ENV, CH.PATH, CH.NEXT],
        claim: "규칙보다 재량이 있어야 힘이 나는 편",
        detail: "위계가 촘촘한 곳에서 유난히 빨리 지치십니다. " +
                "같은 일이라도 맡겨주는 쪽에서 성과가 훨씬 잘 나옵니다." },

      부재: { tag: "비소속형", ch: [CH.ENV, CH.PATH, CH.WHY],
        claim: "위계 자체가 몸으로 답답하게 느껴지는 편",
        detail: "직장을 못 다닌다는 말이 아닙니다. 직장이 정체성이 되지 않는다는 뜻입니다. " +
                "소속보다 실력이나 결과물로 사회와 연결되십니다." }
    };

    var say = SAY[state];
    if (say) {
      out.push({
        tag: say.tag, strength: "핵심",
        claim: say.claim, detail: say.detail,
        evidence: evidence, chapters: say.ch
      });
    }

    if (ratio >= 0.4) {
      out.push({
        tag: "관성과다", strength: "핵심",
        claim: "감당할 책임과 기대가 본인 그릇보다 크게 걸려 있는 상태",
        detail: "일이 많아서가 아니라, 거절하면 관계가 깨진다는 감각이 기본값으로 돌아갑니다.",
        evidence: "관성 세력 " + Math.round(ratio * 100) + "% (5군 중 최대)",
        chapters: [CH.HARD, CH.WHY]
      });
    }
    return out;
  }

  /* =========================================================
     식상·비겁 — 표현 욕구와 자립 성향
     ========================================================= */
  function readSiksangBigeop(a) {
    var out = [], G = a.score.group, il = a.ilgan, p = a.pillars;
    var total = 0; for (var k in G) total += G[k];
    var tugan = [p.년간, p.월간, p.시간];

    var hasSanggwan = tugan.some(function (g) { return D.sipsung(il, g) === "상관"; });
    var hasJeonggwan = tugan.some(function (g) { return D.sipsung(il, g) === "정관"; });
    var jaeRatio = G["재성"] / (total || 1);

    /* 상관견관 — 적천수는 재성 유무로 갈린다고 본다 */
    if (hasSanggwan && hasJeonggwan) {
      out.push({
        tag: jaeRatio >= 0.18 ? "상관견관_재성중재" : "상관견관",
        strength: "핵심",
        claim: jaeRatio >= 0.18
          ? "윗선과 부딪히되, 성과로 무마되는 구조"
          : "윗선의 방식에 그대로 부딪히는 구조",
        detail: jaeRatio >= 0.18
          ? "할 말은 하지만 실적이 받쳐줘서 넘어갑니다. 다만 실적이 꺾이는 순간 관계가 먼저 터집니다."
          : "지시가 비합리적이면 속으로 정리가 끝나버립니다. 표정에 드러나지 않아도 상대는 압니다.",
        evidence: ev(["천간 상관·정관 동시 투출",
                      "재성 " + Math.round(jaeRatio * 100) + "%"]),
        chapters: [CH.HARD, CH.REPEAT, CH.FIT]
      });
    }

    if (G["식상"] / (total || 1) >= 0.3) {
      out.push({
        tag: "식상왕", strength: "핵심",
        claim: "내 방식대로 만들어내고 싶은 욕구가 큰 구조",
        detail: "정해진 절차를 그대로 따르는 일에서 먼저 지칩니다. 결과보다 과정의 재량이 만족을 좌우합니다.",
        evidence: "식상 세력 " + Math.round(G["식상"] / total * 100) + "%",
        chapters: [CH.ENV, CH.PATH, CH.NEXT]
      });
    }

    if (G["비겁"] / (total || 1) >= 0.35) {
      out.push({
        tag: "비겁왕", strength: "핵심",
        claim: "지시받는 위치를 오래 견디기 어려운 구조",
        detail: "동료와 나란히 서는 것은 편한데, 위에서 눌리는 구조에서 소모가 큽니다.",
        evidence: "비겁 세력 " + Math.round(G["비겁"] / total * 100) + "%",
        chapters: [CH.PATH, CH.ENV]
      });
    }

    if (G["재성"] > G["비겁"] * 1.5 && G["비겁"] / (total || 1) < 0.15) {
      out.push({
        tag: "재다신약", strength: "보조",
        claim: "벌 기회는 보이는데 그걸 감당할 체력이 모자란 구조",
        detail: "일을 벌이면 수습이 힘듭니다. 규모를 키우는 것보다 하나를 끝까지 가져가는 쪽이 유리합니다.",
        evidence: ev(["재성 " + Math.round(G["재성"] / total * 100) + "%",
                      "비겁 " + Math.round(G["비겁"] / total * 100) + "%"]),
        chapters: [CH.PATH, CH.FIRST]
      });
    }
    return out;
  }

  /* =========================================================
     격국 — 사회에서 서는 무대
     사길신(정관·정재·정인·식신)은 순용, 사흉신(편관·상관·겁재·양인)은 역용
     ========================================================= */
  var GIL = ["정관격", "정재격", "정인격", "식신격"];
  var GYUK_READ = {
    정관격: { 무대:"규칙과 절차가 분명한 조직", 강점:"신뢰·일관성", 약점:"융통성 요구 상황",
              퇴사:"조직 자체보다 '그 조직의 규칙이 무너졌을 때' 떠납니다" },
    편관격: { 무대:"압박과 마감이 있는 현장", 강점:"위기 대응·추진", 약점:"평온한 반복",
              퇴사:"압박이 사라지면 오히려 무료해서 떠납니다" },
    정재격: { 무대:"성과가 숫자로 확인되는 자리", 강점:"현실감각·꾸준함", 약점:"모호한 평가",
              퇴사:"보상이 노력과 어긋날 때 떠납니다" },
    편재격: { 무대:"기회를 다루는 자리", 강점:"판을 읽는 감각", 약점:"장기 반복",
              퇴사:"더 큰 판이 보이면 떠납니다" },
    식신격: { 무대:"만들어내는 일", 강점:"몰입·지속", 약점:"정치적 조율",
              퇴사:"만들 게 없어지면 떠납니다" },
    상관격: { 무대:"기존 방식을 바꾸는 자리", 강점:"개선·표현", 약점:"위계",
              퇴사:"내 방식이 계속 막히면 떠납니다" },
    정인격: { 무대:"전문성이 축적되는 자리", 강점:"학습·해석", 약점:"즉각 실행 압박",
              퇴사:"배울 게 없어지면 떠납니다" },
    편인격: { 무대:"남들이 안 보는 각도를 파는 자리", 강점:"통찰·독자성", 약점:"표준화",
              퇴사:"관심이 식으면 떠납니다" },
    녹겁격: { 무대:"내 이름으로 서는 자리", 강점:"자립·추진", 약점:"지시받는 구조",
              퇴사:"위에 사람이 있는 한 반복적으로 고민합니다" },
    양인격: { 무대:"강도 높은 실행이 필요한 자리", 강점:"돌파력", 약점:"완만한 조율",
              퇴사:"결정이 늦은 조직에서 오래 못 버팁니다" }
  };

  function readGyukguk(a) {
    var g = a.gyukguk, r = GYUK_READ[g.key] || GYUK_READ[g.display];
    var out = [];
    if (!r) return out;

    var 순용 = GIL.indexOf(g.key) >= 0;
    out.push({
      tag: "격국_" + g.key, strength: "핵심",
      claim: r.무대 + "에서 오래 갑니다",
      detail: (순용
        ? "보호하고 키우는 구조라, 안정된 틀 안에서 자랍니다. 그 틀이 흔들리면 성과보다 먼저 마음이 흔들립니다."
        : "눌러서 쓰는 구조라, 적당한 압박이 있어야 오히려 살아납니다. 편한 자리에서 더 빨리 지칩니다.") +
        " 강점은 " + r.강점 + ", 부담은 " + r.약점 + "입니다.",
      evidence: ev([g.display, "월지 " + a.pillars.월지 + "에서 " + g.cand + " 취용",
                    g.merits.length ? g.merits.join("·") : null]),
      confidence: g.confidence,
      chapters: [CH.ENV, CH.NEXT, CH.PATH]
    });

    out.push({
      tag: "퇴사트리거", strength: "핵심",
      claim: r.퇴사,
      detail: V([
        "지금 힘든 이유가 이것과 맞는지 확인해보면, 회사 문제인지 구조 문제인지 갈립니다.",
        "지금의 이유가 여기에 해당하는지 보면, 이 회사가 문제인지 구조가 문제인지 나뉩니다.",
        "이 설명이 지금 상황과 겹치는지 보세요. 겹치면 회사를 옮겨도 같은 지점이 옵니다.",
        "지금 힘든 게 이 결과 때문인지 아닌지가, 이직으로 풀릴 일인지를 가릅니다."
      ]),
      evidence: g.display,
      chapters: [CH.WHY, CH.FIT, CH.REPEAT]
    });

    if (g.flaws.length) {
      var FLAW = {
        상관견관: "말과 태도가 위선과 부딪히는 지점",
        관살혼잡: "책임 라인이 둘 이상으로 갈려 소모되는 지점",
        군겁쟁재: "성과를 나눠야 하는 구조에서 손해 보는 지점",
        월령훼손: "기반 자체가 흔들린 시기가 있었다는 흔적",
        일간무근: "기댈 언덕 없이 혼자 버텨온 구조"
      };
      out.push({
        tag: "격국흠", strength: "보조",
        claim: g.flaws.map(function (f) { return FLAW[f] || f; }).join(", ") + "이 있습니다",
        detail: "이건 결함이 아니라 반복해서 부딪히게 되는 자리입니다. " +
                "회사를 옮겨도 같은 자리에서 같은 감정이 올라옵니다.",
        evidence: g.display + " · " + g.flaws.join("·") + " (격국 " + g.score + "점)",
        chapters: [CH.REPEAT, CH.HARD]
      });
    }
    return out;
  }

  /* =========================================================
     용신 — 다음 환경을 고르는 기준
     ========================================================= */
  var OH_ENV = {
    목: { 환경:"성장하고 뻗어나가는 조직", 키워드:"신사업·교육·기획", 사람:"방향을 제시하는 사람" },
    화: { 환경:"드러나고 표현되는 자리", 키워드:"마케팅·영업·콘텐츠", 사람:"에너지를 주는 사람" },
    토: { 환경:"기반이 단단한 조직", 키워드:"운영·관리·부동산", 사람:"중재하는 사람" },
    금: { 환경:"기준과 원칙이 분명한 조직", 키워드:"금융·법무·품질", 사람:"선을 지키는 사람" },
    수: { 환경:"유연하고 정보가 도는 조직", 키워드:"연구·기획·유통", 사람:"흐름을 읽는 사람" }
  };

  function readYongsin(a) {
    var y = a.yongsin, out = [];
    var e = OH_ENV[y.용신오행], k = OH_ENV[y.기신오행];
    if (!e) return out;

    out.push({
      tag: "유리환경", strength: "핵심",
      claim: e.환경 + "에서 회복이 빠릅니다",
      detail: V([
        "직무 이름보다 조직의 성질이 중요합니다. " + e.키워드 + " 계열이나, " +
        e.사람 + "이 위에 있는 자리가 그렇습니다.",
        "무슨 일을 하느냐보다 어떤 조직이냐가 더 크게 갈립니다. " +
        e.키워드 + " 쪽, 그리고 " + e.사람 + "이 위에 있는 구조가 맞습니다.",
        "직무명은 참고만 하시고 조직의 성질을 보세요. " + e.키워드 + " 계열에서 " +
        "특히 덜 소모되고, " + e.사람 + "과 일할 때 회복이 빠릅니다.",
        "고를 때 기준은 직무가 아니라 조직입니다. " + e.키워드 + " 쪽이 결이 맞고, " +
        e.사람 + "이 위에 있으면 오래 갑니다."
      ]),
      evidence: ev(["용신 " + y.용신군 + "(" + y.용신오행 + ")",
                    y.method === "조후" ? "조후 우선" : "억부",
                    y.confidence === "LOW" ? "판정 신뢰도 낮음" : null]),
      confidence: y.confidence,
      chapters: [CH.NEXT, CH.ENV]
    });

    if (k) {
      out.push({
        tag: "불리환경", strength: "보조",
        claim: k.환경 + "에서는 같은 일도 더 지칩니다",
        detail: V([
        "능력 문제가 아니라 결이 안 맞는 것입니다. 이직할 때 이 조건이 겹치면 " +
        "회사만 바뀌고 피로는 그대로 따라옵니다.",
        "못해서가 아니라 맞지 않아서입니다. 다음 자리가 같은 성질이면 " +
        "이름표만 바뀌고 피로는 그대로입니다.",
        "실력의 문제가 아닙니다. 같은 일을 해도 여기서는 더 많이 깎입니다. " +
        "옮길 때 이 조건이 반복되면 소용이 없습니다.",
        "적성이 아니라 환경의 결 문제입니다. 이 조건을 그대로 둔 채 옮기면 " +
        "몇 달 뒤 같은 자리에 서 있게 됩니다."
      ]),
        evidence: "기신 " + y.기신군 + "(" + y.기신오행 + ")",
        chapters: [CH.NEXT, CH.REPEAT]
      });
    }
    return out;
  }

  /* =========================================================
     십이운성 — 지금 어느 국면인가
     ========================================================= */
  var TAG_READ = {
    독립실행적기:     { claim:"기질도 시기도 자립 쪽으로 모여 있는 구간", ch:[CH.WINDOW, CH.PATH] },
    독립기질_시기미흡: { claim:"기질은 독립인데 시기가 아직 받쳐주지 않는 구간", ch:[CH.WINDOW, CH.FIRST] },
    독립기질_축적구간: { claim:"기질은 독립인데 지금은 쌓는 구간 — 재직 중 준비가 유리", ch:[CH.WINDOW, CH.FIRST] },
    정리기:           { claim:"묵은 것을 정리하는 국면", ch:[CH.FLOW, CH.WINDOW] },
    잠복기:           { claim:"드러나지 않고 안으로 모으는 국면", ch:[CH.FLOW, CH.FIRST] },
    성장기:           { claim:"쌓이는 국면 — 지금 자리에서 얻을 게 남아 있습니다", ch:[CH.FLOW, CH.WINDOW] },
    동요기:           { claim:"마음이 먼저 움직이는 국면 — 충동적 결정 주의", ch:[CH.WHY, CH.WINDOW] },
    주도권상승기:     { claim:"발언권과 결정권이 올라오는 국면", ch:[CH.FLOW, CH.WINDOW] },
    명식기반:         { claim:"대운 진입 전 — 타고난 구조 위주로 봅니다", ch:[CH.FLOW] }
  };

  function readUnseong(a) {
    var u = a.unseong, out = [], t = TAG_READ[u.tag];

    /* 대운 십이운성 값이 없으면 대운 문장을 만들지 않는다.
       예전에는 (u.대운지 || "-") 로 받아서 "대운으로는 - 국면입니다" 가
       그대로 손님 화면에 나갔다. 빈 값을 대체 문구로 덮는 것도 안 된다 —
       "대운 진입 전" 이라고 쓰면 서른 넘은 분께 사실이 아닌 말을 하게 된다.
       근거가 없으면 그 문장은 아예 없는 편이 낫다. */
    if (t && u.대운지) {
      out.push({
        tag: "국면_" + u.tag, strength: "핵심",
        claim: t.claim,
        detail: V([
        "대운 " + u.대운지 + " 구간의 성질입니다. " +
        "이 국면과 반대로 움직이면 같은 결정도 더 비싸게 치릅니다.",
        "대운 " + u.대운지 + " 구간입니다. " +
        "흐름을 거슬러 움직이면 같은 일을 해도 힘이 더 듭니다.",
        "지금은 대운 " + u.대운지 + " 자리입니다. " +
        "이 구간의 결과 반대로 가면 대가가 커집니다.",
        "대운으로는 " + u.대운지 + " 국면입니다. " +
        "국면에 맞춰 움직일 때와 거스를 때의 비용 차이가 큽니다."
      ]),
        evidence: ev(["대운 십이운성 " + u.대운지,
                      "월지 " + u.월지, "일지 " + u.일지]),
        chapters: t.ch
      });
    }
    if (u.자립최강) {
      out.push({
        tag: "자립최강", strength: "핵심",
        claim: "일주가 스스로 서는 구조 — 남의 밑에서 오래 있기 어렵습니다",
        detail: "간여지동이라 천간과 지지가 같은 기운입니다. 자기 확신이 강한 만큼 " +
                "설득당하기보다 스스로 납득해야 움직입니다.",
        evidence: a.pillars.일간 + a.pillars.일지 + " (" +
                  (u.자립최강 === "A" ? "건록" : "제왕") + " 간여지동)",
        chapters: [CH.PATH, CH.ENV]
      });
    }
    if (u.소속불안) {
      out.push({
        tag: "소속불안정", strength: "보조",
        claim: "한 자리에 오래 머무는 것 자체가 잘 안 되는 구조",
        detail: "끈기 부족이 아니라, 공백과 재시작이 반복되는 리듬을 타고났다는 뜻입니다.",
        evidence: "명식 지지에 절·태·묘가 2개 이상",
        chapters: [CH.REPEAT, CH.FLOW]
      });
    }
    if (u.변동형) {
      out.push({
        tag: "기복형", strength: "참고",
        claim: "성장·절정·쇠퇴·재생이 한 명식 안에 다 들어 있습니다",
        detail: "삶의 국면이 뚜렷하게 갈리는 편입니다. 잘 될 때와 안 될 때의 낙차가 큽니다.",
        evidence: "4지지 십이운성이 4국면 전부에 분포",
        chapters: [CH.FLOW]
      });
    }
    return out;
  }

  /* =========================================================
     형충회합 — 움직임과 붙잡힘
     ========================================================= */
  /* 궁위(宮位) — 어느 기둥이 흔들렸는지에 따라 이야기가 완전히 달라진다.
     년=배경·집안 / 월=직장·사회 / 일=본인·가정 / 시=말년·자식.
     퇴사 앱에서 월지가 흔들린 사람과 일지가 흔들린 사람은 다른 얘기다.
     예전에는 월지만 한 줄 다르고 나머지는 뭉뚱그렸다.
     걸리지 않은 자리에 "직장 자리" 라고 붙이면 없는 근거를 만드는 것이라
     기본값 폴백은 두지 않는다. */
  var GUNG = {
    년지: { name: "배경",   say: "집안이나 출신 배경 쪽" },
    월지: { name: "직장",   say: "직장과 사회생활 쪽" },
    일지: { name: "본인",   say: "본인과 가장 가까운 관계 쪽" },
    시지: { name: "말년",   say: "앞으로의 자리와 방향 쪽" }
  };
  function gungOf(slots) {
    var order = ["월지", "일지", "년지", "시지"];   // 직장 앱이므로 월지 우선
    for (var i = 0; i < order.length; i++) {
      if (slots.indexOf(order[i]) >= 0) return GUNG[order[i]];
    }
    return null;
  }

  function readRelations(a) {
    var out = [], rel = a.relations;
    var top = (rel.list || []).slice(0, 3);

    top.forEach(function (r) {
      var pos = r.slots.join("·");
      var gg = gungOf(r.slots);
      if (r.type === "육충") {
        var CHUNG_SAY = {
          월지: "직장 자리가 주기적으로 흔들리는 배치입니다. 조직이 바뀌거나 위가 바뀌거나 " +
                "평가 기준이 바뀌는 일을 남들보다 자주 겪으십니다. 본인이 못 버텨서가 아닙니다.",
          일지: "가장 가까운 자리가 흔들리는 배치입니다. 회사 일이 집으로, 집 일이 회사로 " +
                "잘 넘어옵니다. 그래서 한쪽이 흔들리면 양쪽이 같이 흔들립니다.",
          년지: "출발선 쪽이 흔들려 있는 배치입니다. 기댈 배경이 얇았던 만큼 " +
                "스스로 만들어온 몫이 큽니다. 그래서 놓기가 더 어렵습니다.",
          시지: "앞으로의 자리 쪽이 흔들리는 배치입니다. 지금보다 몇 년 뒤 그림이 " +
                "잘 안 그려지는 감각이 여기서 옵니다."
        };
        out.push({
          tag: gg ? "충_" + gg.name : "충", strength: "핵심",
          claim: gg ? gg.say + "이 흔들리는 배치" : "기반이 주기적으로 흔들리는 배치",
          detail: (gg && CHUNG_SAY[r.slots.indexOf("월지") >= 0 ? "월지" :
                                   r.slots.indexOf("일지") >= 0 ? "일지" :
                                   r.slots.indexOf("년지") >= 0 ? "년지" : "시지"]
                   || "붙잡으면 손해가 크고, 정리하면 오히려 풀립니다.") +
                  " 충은 깨지는 게 아니라 열리는 쪽이기도 합니다.",
          evidence: r.ji.join("") + " 충 (" + pos + ")" + (r.complete ? " — 운에서 완성" : ""),
          chapters: [CH.WINDOW, CH.WHY]
        });
      } else if (r.type === "삼형" || r.type === "상형") {
        out.push({
          tag: "형", strength: "보조",
          claim: "사람 관계에서 반복적으로 걸리는 지점이 있습니다",
          detail: (r.mean || "믿었던 쪽과 어긋나거나, 좋게 시작한 관계가 끝이 안 좋아지는 형태입니다.") +
                  " 충처럼 한 번에 터지지 않고 오래 끕니다.",
          evidence: r.ji.join("") + " " + r.type + (r.name ? "(" + r.name + ")" : "") + " (" + pos + ")",
          chapters: [CH.HARD, CH.REPEAT]
        });
      } else if (r.type === "삼합" || r.type === "방합") {
        out.push({
          tag: "국", strength: "핵심",
          claim: r.hwa + " 기운이 크게 뭉쳐 있습니다",
          detail: "한 방향으로 힘이 모이는 구조입니다. 그 방향에 맞는 일에서는 강하고, " +
                  "어긋나는 일에서는 유난히 소모가 큽니다.",
          evidence: r.ji.join("") + " " + r.type + " → " + r.hwa + (r.complete ? " (운에서 완성)" : ""),
          chapters: [CH.ENV, CH.PATH]
        });
      } else if (r.type === "육합") {
        out.push({
          tag: "합", strength: "보조",
          claim: "떠나야 한다고 생각하면서도 묶여 있는 자리가 있습니다",
          detail: "합은 좋고 나쁨이 아니라 '붙잡힘'입니다. 관계든 조건이든, " +
                  "결정을 미루게 만드는 무언가가 있습니다.",
          evidence: r.ji.join("") + " 합" + (r.hwa ? " → " + r.hwa : "") + " (" + pos + ")",
          chapters: [CH.WHY, CH.FIRST]
        });
      }
    });

    if (rel.note) {
      var NOTE = {
        탐합망충: "움직일 조건은 있는데 붙잡는 힘이 더 셉니다 — 결정이 늦어집니다",
        충중봉합: "붙잡는 게 있어도 움직임이 이깁니다 — 변화가 실제로 일어납니다",
        합충병존: "묶였다 풀렸다를 반복합니다 — 결심과 번복이 잦습니다"
      };
      out.push({
        tag: "합충구도", strength: "핵심",
        claim: NOTE[rel.note] || rel.note,
        detail: "이게 지금 결정을 못 내리는 구조적 이유입니다.",
        evidence: rel.note + " (이동 " + rel.moveScore + " / 정체 " + rel.stayScore + ")",
        chapters: [CH.WHY, CH.WINDOW]
      });
    }
    return out;
  }

  /* =========================================================
     신살 — 성향 서술로만 환원한다. 길흉 단정 금지.
     ========================================================= */
  var SIN_READ = {
    역마: { claim:"자리를 옮기는 것 자체가 에너지가 되는 성향",
            detail:"한곳에 오래 있으면 답답해집니다. 이동·출장·외부 접점이 있는 일에서 살아납니다." },
    도화: { claim:"사람 눈에 띄고 관계로 일이 풀리는 성향",
            detail:"실력만으로 조용히 인정받기보다, 드러나는 자리에서 기회가 옵니다." },
    화개: { claim:"혼자 파고드는 시간이 필요한 성향",
            detail:"모임보다 몰입에서 회복됩니다. 전문성·연구·창작 쪽 결이 맞습니다." },
    양인: { claim:"결정할 때 세게 밀어붙이는 성향",
            detail:"미루다가 한 번에 결단하십니다. 그래서 퇴사도 갑자기 나올 수 있습니다. 속도 조절이 필요합니다." },
    괴강: { claim:"타협보다 정면으로 가는 성향",
            detail:"두루뭉술한 조직에서 마찰이 잦습니다. 대신 위기 상황에서 신뢰를 얻습니다." },
    백호: { claim:"강도 높게 몰아치는 기질",
            detail:"큰 폭으로 성과를 내지만 소모도 큽니다. 페이스 관리가 실력만큼 중요합니다." },
    공망: { claim:"채워도 채워지지 않는 감각이 있는 자리",
            detail:"그 영역에서 노력 대비 체감이 약합니다. 기대치를 낮추면 오히려 편해집니다." },
    /* 공망은 43%에게 걸린다. 한 문장으로 끝내면 절반 가까운 사람이 같은 글을 읽는다.
       공망이 앉은 자리의 지장간 정기를 십성으로 환원해서 갈라 준다.
       통설도 "그 영역이 없다"가 아니라 "계속 좇는데 아쉬움이 남는다" 쪽이다. */
    _공망군: {
      관성: { claim:"자리와 인정을 좇는데 손에 남는 느낌이 옅은 배치",
              detail:"승진해도, 인정받아도 며칠이면 다시 허전해지십니다. " +
                     "못 받아서가 아니라 받아도 오래 안 채워집니다. " +
                     "직함으로 채우려 하실수록 갈증이 길어집니다." },
      인성: { claim:"배워도 배운 것 같지 않은 감각이 남는 배치",
              detail:"자격증을 따도, 공부를 해도 '아직 부족하다'가 먼저 옵니다. " +
                     "실력이 없어서가 아닙니다. 기준선이 계속 위로 움직입니다. " +
                     "남과 견주기보다 작년의 본인과 견주시는 편이 낫습니다." },
      재성: { claim:"벌어도 모이는 감각이 옅은 배치",
              detail:"수입이 늘어도 안정감이 그만큼 안 따라옵니다. " +
                     "쓰는 게 헤퍼서가 아니라, 숫자가 마음을 잘 안 눌러줍니다. " +
                     "연봉만 보고 옮기시면 몇 달 뒤 같은 자리로 돌아옵니다." },
      비겁: { claim:"사람 사이에 있어도 혼자인 감각이 남는 배치",
              detail:"동료와 잘 지내면서도 어딘가 한 겹 떨어져 계십니다. " +
                     "관계가 나쁘다는 뜻이 아니라, 채워지는 몫이 작다는 뜻입니다. " +
                     "팀 분위기로 버티는 자리는 오래 못 가십니다." },
      식상: { claim:"내놓아도 남는 게 적은 감각이 있는 배치",
              detail:"만들고 표현하는 데 힘을 쓰시는데 결과물이 손에 안 남습니다. " +
                     "기록으로 남는 형태의 일을 고르시면 이 감각이 꽤 줄어듭니다." }
    },
    천을귀인: { claim:"결정적일 때 사람이 도와주는 자리",
                detail:"혼자 해결하려 들기보다 물어보는 쪽이 유리합니다." },
    문창귀인: { claim:"글·자료·설명으로 인정받는 성향", detail:"말보다 정리된 문서에서 강점이 나옵니다." },
    학당귀인: { claim:"배우고 가르치는 흐름이 맞는 성향", detail:"학습이 곧 회복이 됩니다." },
    겁살: { claim:"예상 밖의 변수에 자주 노출되는 자리", detail:"계획을 촘촘히 짜기보다 여유를 남겨두는 편이 낫습니다." },
    망신: { claim:"드러나는 것에 민감한 자리", detail:"체면이 판단에 영향을 줍니다. 그걸 알고 결정하면 덜 흔들리십니다." },
    장성: { claim:"책임을 맡으면 힘이 나는 성향", detail:"보조 역할보다 총대를 멜 때 성과가 좋습니다." },
    반안: { claim:"윗사람 덕이 있는 자리", detail:"기댈 언덕이 생기면 안정감이 커집니다." }
  };

  function readSinsal(a) {
    var out = [];
    (a.sinsal.top || []).forEach(function (s) {
      var r = SIN_READ[s.name];
      /* 공망은 걸린 자리의 정기를 십성으로 환원해 갈라 읽는다.
         자리를 모르거나 환원이 안 되면 원래 문장으로 돌아간다. */
      if (s.name === "공망" && s.ji && D.JIJANGGAN[s.ji]) {
        var segs = D.JIJANGGAN[s.ji];
        var jeong = segs[segs.length - 1];
        var grp = jeong ? D.SS_GROUP[D.sipsung(a.ilgan, jeong.g)] : null;
        if (grp && SIN_READ._공망군[grp]) r = SIN_READ._공망군[grp];
      }
      if (!r) return;
      out.push({
        tag: "신살_" + s.name, strength: "보조",
        claim: r.claim,
        /* 예전에는 이 꼬리표가 한 문장 고정이라 리포트당 두 번씩 똑같이 붙었다.
           같은 단서를 두 번 읽으면 읽는 사람은 기계가 붙였다고 느낀다. */
        /* 본문은 손님이 읽는 산문이다. "충·공망" 처럼 뜻을 모르는 한자어를
           설명 없이 넣으면 그 문장이 통째로 안 읽힌다.
           전문 용어는 아래 evidence 줄에만 남기고, 여기서는 풀어 쓴다. */
        detail: r.detail + (s.damped ? " " + V([
          "다만 이 성향이 늘 같은 세기로 나오지는 않습니다. 부딪히는 자리가 함께 걸려 있어서입니다.",
          "다만 명식 안에서 서로 부딪히는 자리가 있어, 때에 따라 흐려집니다.",
          "이 성질은 시기마다 진하게도, 옅게도 나옵니다. 눌러주는 자리가 함께 있기 때문입니다.",
          "늘 일정하게 나오지는 않습니다. 강하게 나오는 때와 거의 안 보이는 때가 갈립니다."
        ]) : ""),
        evidence: s.name + " (" + s.slot + " " + s.ji + ")" +
                  (s.ganji ? " " + s.ganji : "") + (s.both ? " · 일지·연지 양쪽" : ""),
        chapters: [CH.ENV, CH.PATH, CH.REPEAT]
      });
    });
    if (a.sinsal.none) {
      out.push({
        tag: "신살없음", strength: "참고",
        claim: "특정 기질로 튀는 구조가 아닙니다",
        detail: "극단이 없다는 건 평범하다는 뜻이 아니라, 환경에 따라 달라진다는 뜻입니다. " +
                "그래서 어떤 조직에 있느냐가 남보다 더 크게 작용합니다.",
        evidence: "주요 신살 미검출",
        chapters: [CH.ENV]
      });
    }
    return out;
  }

  /* =========================================================
     신강신약 — 단정 금지 구간을 반드시 지킨다
     ========================================================= */
  function readStrength(a) {
    var st = a.strength, out = [];
    if (st.borderline) {
      out.push({
        tag: "중화", strength: "핵심",
        claim: "어느 한쪽으로 기울지 않은 구조",
        detail: "밀어주는 힘과 덜어내는 힘이 비슷합니다. 그래서 '이런 사람'이라고 " +
                "한마디로 규정되지 않습니다. 환경이 성향을 만듭니다.",
        evidence: "신강도 " + st.S + "점 (판정 경계 구간 — 술사에 따라 갈리는 자리)",
        confidence: "LOW",
        chapters: [CH.ENV, CH.WHY]
      });
      return out;
    }
    var weak = ["신약", "극신약", "중화신약"].indexOf(st.label) >= 0;
    out.push({
      tag: weak ? "신약" : "신강", strength: "핵심",
      claim: weak
        ? "혼자 다 끌어안기보다 기댈 구조가 있어야 오래 가는 타입"
        : "스스로 밀고 나가는 힘이 강한 타입",
      detail: weak
        ? "체력이나 의지의 문제가 아니라, 지원·팀·시스템이 있을 때 성과가 확 달라지는 구조입니다. 혼자 하는 일에서는 소진이 빠릅니다."
        : "지시받는 것보다 맡겨지는 쪽이 편합니다. 다만 도움을 안 구해서 혼자 짊어지는 일이 잦습니다.",
      evidence: ev(["신강도 " + st.S + "점",
                    "득령" + (st.deukRyeong ? "O" : "X") + "·득지" + (st.deukJi ? "O" : "X") +
                    "·득세" + (st.deukSe ? "O" : "X"),
                    st.ryeongBy ? "월령 사령 " + st.ryeongBy : null]),
      confidence: st.confidence,
      chapters: [CH.ENV, CH.PATH, CH.NEXT]
    });
    return out;
  }

  /* =========================================================
     통합
     ========================================================= */
  /* =========================================================
     조후 — 궁통보감이 그 일간·그 달에 필요하다고 지목한 글자
     =========================================================
     120칸짜리 표를 만들어두고 서술에는 한 줄도 안 쓰고 있었다.
     명식마다 고르게 퍼지는 몇 안 되는 축이라 아깝다.

     단, "한랭/서늘/중화/온난/조열" 5단계로 나누는 방식은 쓰지 않는다.
     서늘 33% + 중화 28% = 61%가 아무한테나 맞는 말이 되기 때문이다.
     대신 지목된 글자가 실제 명식에 있느냐 없느냐만 본다.
     이건 명식을 펼쳐놓고 세면 누구나 확인할 수 있는 사실이다. */
  function readJohu(a) {
    var y = a.yongsin, p = a.pillars, out = [];
    if (!y || !y.johu) return out;

    var need = String(y.johu).split("");           // 필요한 글자들
    var haveGan = [p.년간, p.월간, p.일간, p.시간];
    var haveJi  = [p.년지, p.월지, p.일지, p.시지];

    var got = [], missing = [];
    need.forEach(function (g) {
      var inGan = haveGan.indexOf(g) >= 0;
      var inJi = haveJi.some(function (j) {
        return D.JIJANGGAN[j].some(function (seg) { return seg.g === g; });
      });
      if (inGan) got.push({ g: g, where: "천간" });
      else if (inJi) got.push({ g: g, where: "지장간" });
      else missing.push(g);
    });

    var topGan = need[0];                          // 표에서 첫 글자가 가장 중요하다
    var topGot = got.some(function (x) { return x.g === topGan; });
    var topInGan = got.some(function (x) { return x.g === topGan && x.where === "천간"; });

    var oh = D.GAN_OH[topGan];
    var ENV = {
      목: "새로 벌이고 키우는 일", 화: "드러나고 알려지는 일",
      토: "쌓고 관리하는 일",     금: "정리하고 끊는 일",
      수: "궁리하고 흐름을 읽는 일"
    };
    var work = ENV[oh] || "본인에게 맞는 일";

    var evd = ev([
      "일간 " + p.일간 + " · 월지 " + p.월지 + " 조후 " + y.johu,
      topGot ? (topInGan ? "천간에 " + topGan + " 있음" : "지장간에 " + topGan + " 있음")
             : topGan + " 없음",
      typeof y.temp === "number" ? "한난 " + y.temp : null
    ]);

    if (topInGan) {
      out.push({
        tag: "조후_충족", strength: "보조",
        claim: "계절이 요구하는 것을 이미 갖고 태어난 배치",
        detail: "이 계절에 태어난 " + p.일간 + " 일간에게 필요한 건 " + topGan + "입니다. " +
                "그게 천간에 나와 있습니다. " + work + "에서 힘이 덜 들고 회복도 빠르십니다. " +
                "지금 지치신다면 타고난 조건보다 지금 환경 쪽을 먼저 보셔야 합니다.",
        evidence: evd, chapters: [CH.ENV, CH.PATH]
      });
    } else if (topGot) {
      out.push({
        tag: "조후_잠복", strength: "보조",
        claim: "필요한 것이 안에는 있는데 밖으로는 잘 안 나오는 배치",
        detail: "이 계절의 " + p.일간 + " 일간에게 필요한 " + topGan + "이 지장간에 숨어 있습니다. " +
                "쓸 수는 있는데 저절로 나오지는 않습니다. " +
                work + " 쪽에서 판을 깔아주는 사람이나 계기가 있을 때 확 살아나십니다.",
        evidence: evd, chapters: [CH.ENV, CH.PATH, CH.NEXT]
      });
    } else {
      out.push({
        tag: "조후_결핍", strength: "핵심",
        claim: "계절이 요구하는 것이 명식에 없는 배치",
        detail: "이 계절의 " + p.일간 + " 일간에게는 " + topGan + "이 필요한데 명식에 없습니다. " +
                "그래서 " + work + "을 밖에서 끌어와야 합니다. 사람이든 환경이든 " +
                "그게 채워지는 자리에서는 눈에 띄게 편해지시고, 없으면 유난히 오래 헤매십니다. " +
                "직장을 고르실 때 조건표보다 이게 있는 자리인지를 먼저 보십시오.",
        evidence: evd, chapters: [CH.ENV, CH.WHY, CH.PATH]
      });
    }

    /* 두 글자 이상 빠졌으면 그것만 한 줄 더 */
    if (missing.length >= 2) {
      out.push({
        tag: "조후_다결", strength: "보조",
        claim: "여러 조건이 한꺼번에 비어 있는 배치",
        detail: "이 계절에 필요한 글자 중 " + iga(missing.join("·")) + " 함께 비어 있습니다. " +
                "하나만 채워서는 체감이 잘 안 바뀌는 구성이라, " +
                "환경을 고르실 때 한 가지 조건만 보고 결정하지 않으시는 편이 낫습니다.",
        evidence: "조후 " + y.johu + " 중 " + missing.join("·") + " 없음",
        chapters: [CH.PATH, CH.NEXT]
      });
    }
    return out;
  }

  /* =========================================================
     유통(流通) — 힘이 어디로 흘러가는가
     =========================================================
     이 앱의 핵심 질문("회사가 문제인가 일이 문제인가")에 가장 직접
     답하는 판정인데 코드에 아예 없었다.

     관인상생: 조직 → 인정 → 나  (조직 안에서 자라는 구조)
     식상생재: 만듦 → 돈          (만든 걸 값으로 바꾸는 구조)
     상관패인: 튀는 힘을 배움이 눌러줌
     식신제살: 압박을 일로 받아냄
     재생관:   돈이 자리를 만들어줌
     유통단절: 한 군데 고여 있음

     문턱은 실측 분포를 보고 잡는다. 너무 높으면 3분의 1이 아무 문장도
     못 받고, 너무 낮으면 전원에게 붙어 의미가 없어진다. */
  function readFlow(a) {
    var G = a.score.group, out = [];
    var total = 0, k;
    for (k in G) total += G[k];
    if (!total) return out;

    function r(x) { return (G[x] || 0) / total; }
    var 비 = r("비겁"), 식 = r("식상"), 재 = r("재성"), 관 = r("관성"), 인 = r("인성");

    /* 두 축이 함께 살아 있어야 "흐른다"고 말할 수 있다 */
    var LIVE = 0.13;
    var cands = [];
    if (관 >= LIVE && 인 >= LIVE) cands.push({ k: "관인상생", v: Math.min(관, 인) });
    if (식 >= LIVE && 재 >= LIVE) cands.push({ k: "식상생재", v: Math.min(식, 재) });
    if (재 >= LIVE && 관 >= LIVE) cands.push({ k: "재생관",   v: Math.min(재, 관) });
    if (식 >= LIVE && 인 >= LIVE) cands.push({ k: "상관패인", v: Math.min(식, 인) });
    if (식 >= LIVE && 관 >= LIVE) cands.push({ k: "식신제살", v: Math.min(식, 관) });

    var SAY = {
      관인상생: {
        claim: "조직 안에서 인정을 받아 자라는 흐름",
        detail: "맡은 일이 평가로 이어지고 그 평가가 다시 힘이 되는 구조입니다. " +
                "이 흐름이 도는 조직에서는 오래 다니시고 성과도 쌓입니다. " +
                "반대로 평가가 납득이 안 되기 시작하면 다른 조건이 좋아도 빠르게 식으십니다.",
        ch: [CH.ENV, CH.PATH, CH.NEXT] },
      식상생재: {
        claim: "만든 것이 값으로 바뀌는 흐름",
        detail: "결과물이 눈에 보이고 그게 숫자로 돌아오는 자리에서 힘이 나십니다. " +
                "월급처럼 성과와 보상이 멀리 떨어져 있으면 동기가 잘 안 붙습니다. " +
                "성과급·수주·개인 작업물이 있는 쪽을 보시면 체감이 다릅니다.",
        ch: [CH.PATH, CH.NEXT, CH.ENV] },
      재생관: {
        claim: "성과가 자리를 만들어주는 흐름",
        detail: "숫자로 증명하면 직함이 따라오는 구조입니다. " +
                "말이나 관계로 올라가는 조직에서는 유난히 답답하시고, " +
                "실적이 그대로 보이는 곳에서 제일 빨리 자리를 잡으십니다.",
        ch: [CH.ENV, CH.PATH] },
      상관패인: {
        claim: "튀어나가려는 힘을 배움이 눌러주는 흐름",
        detail: "하고 싶은 말과 참아야 하는 말 사이에서 자주 서 계십니다. " +
                "공부나 자격이 붙어 있을 때는 그 힘이 실력으로 나가고, " +
                "그게 없으면 마찰로 나갑니다. 배우는 걸 멈추지 않는 편이 안전합니다.",
        ch: [CH.WHY, CH.REPEAT, CH.PATH] },
      식신제살: {
        claim: "압박을 일로 받아내는 흐름",
        detail: "스트레스를 감정으로 풀지 않고 결과물로 바꾸시는 편입니다. " +
                "그래서 힘든 시기에 오히려 성과가 나옵니다. " +
                "다만 몸이 먼저 신호를 보내기 쉬우니 총량 관리가 필요합니다.",
        ch: [CH.HARD, CH.PATH] }
    };

    if (cands.length) {
      cands.sort(function (x, y) { return y.v - x.v; });
      var win = cands[0], sy = SAY[win.k];
      out.push({
        tag: "유통_" + win.k, strength: "핵심",
        claim: sy.claim, detail: sy.detail,
        /* 내부 문턱값(13%)을 화면에 찍으면 안 된다.
           손님에게는 개인 측정치처럼 보이는데 실제로는 모두에게 같은 상수다. */
        evidence: ev([win.k, "두 축이 모두 살아 있음"]),
        chapters: sy.ch
      });
      return out;
    }

    /* 어느 쌍도 안 이어지면 한 군데 고여 있다는 뜻이다.
       어디가 고였는지까지 말해줘야 쓸모가 있다. */
    var mx = "비겁", mv = 비;
    var pairs = [["식상", 식], ["재성", 재], ["관성", 관], ["인성", 인]];
    pairs.forEach(function (x) { if (x[1] > mv) { mx = x[0]; mv = x[1]; } });
    var STUCK = {
      비겁: "힘은 있는데 그걸 내보낼 통로가 좁습니다. 혼자 버티는 데 다 쓰이는 배치라, " +
            "같이 할 사람이나 내놓을 자리가 생기면 확 달라지십니다.",
      식상: "만들고 표현하는 힘은 큰데 그게 값이나 자리로 이어지는 길이 약합니다. " +
            "재능이 아니라 연결의 문제라, 결과물이 남는 형태로 일하시면 크게 나아집니다.",
      재성: "실적과 숫자 쪽에 힘이 몰려 있는데 그걸 받아줄 자리가 얇습니다. " +
            "잘해도 자리로 잘 안 바뀌는 답답함이 여기서 옵니다.",
      관성: "책임과 기대는 크게 걸려 있는데 그걸 받쳐줄 힘이 얇습니다. " +
            "그래서 같은 일을 해도 더 많이 소모되십니다.",
      인성: "배우고 받아들이는 쪽에 힘이 몰려 있는데 밖으로 내는 통로가 좁습니다. " +
            "준비만 길어지기 쉬운 배치라, 완성 전에 한 번 꺼내보시는 편이 낫습니다."
    };
    out.push({
      tag: "유통_단절", strength: "핵심",
      claim: mx + " 쪽에 힘이 고여 흐르지 않는 배치",
      detail: STUCK[mx],
      evidence: ev(["유통 단절", mx + " 쪽으로 치우침"]),
      chapters: [CH.WHY, CH.HARD, CH.PATH]
    });
    return out;
  }

  function read(a) {
    seedFrom(a);
    var all = []
      .concat(readStrength(a))
      .concat(readGwanseong(a))
      .concat(readGyukguk(a))
      .concat(readSiksangBigeop(a))
      .concat(readYongsin(a))
      .concat(readUnseong(a))
      .concat(readRelations(a))
      .concat(readSinsal(a))
      .concat(readJohu(a))
      .concat(readFlow(a));

    /* 챕터별로 나눠 담는다 */
    var byChapter = {};
    Object.keys(CH).forEach(function (k) { byChapter[CH[k]] = []; });
    all.forEach(function (r) {
      (r.chapters || []).forEach(function (c) {
        if (byChapter[c]) byChapter[c].push(r);
      });
    });

    /* 각 챕터 안에서 핵심 → 보조 → 참고 순 */
    var order = { 핵심: 0, 보조: 1, 참고: 2 };
    Object.keys(byChapter).forEach(function (c) {
      byChapter[c].sort(function (x, y) {
        return (order[x.strength] || 3) - (order[y.strength] || 3);
      });
    });

    return {
      readings: all,
      byChapter: byChapter,
      coreCount: all.filter(function (r) { return r.strength === "핵심"; }).length,
      lowConfidence: all.filter(function (r) { return r.confidence === "LOW"; })
                        .map(function (r) { return r.tag; })
    };
  }

  global.SajuRead = { read: read, CH: CH, GYUK_READ: GYUK_READ, OH_ENV: OH_ENV, SIN_READ: SIN_READ };
})(typeof window !== "undefined" ? window : global);
