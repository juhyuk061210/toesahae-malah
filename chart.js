/* =========================================================
   명식 화면 — 생년월일만으로 즉시 나오는 것
   =========================================================
   왜 이 화면이 필요한가:
   예전에는 질문 10개를 먼저 시키고 그 뒤에 생년월일을 받았다.
   손님 입장에서는 사주를 한 글자도 못 본 채 심리 문항만 열 개를 답하게 되니
   "이거 그냥 설문 아냐?" 라는 느낌이 남았다.
   실측으로도 결제 전 화면 글자의 47%가 답변에서 나온 것이었다.

   그래서 순서를 뒤집었다. 생년월일 → 이 화면(만세력) → 질문 → 결과.
   여기 나오는 건 전부 생년월일에서만 나온다. 답변은 한 글자도 안 쓴다.
   ========================================================= */
(function () {
  "use strict";
  var T = App.Track, S = App.State, UI = App.UI;

  if (!App.Nav.require("birth")) return;

  var st = S.load();
  var b = st.birth;

  /* 받침 유무로 조사를 고른다. "토이(가)" 같은 표기가 하나라도 남으면
     손님은 그것 때문에 나머지 문장까지 기계가 썼다고 본다. */
  function josa(w, withB, without) {
    var t = String(w), c = t.charCodeAt(t.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return withB;
    return ((c - 0xac00) % 28) ? withB : without;
  }
  function iga(w) { return w + josa(w, "이", "가"); }
  function eun(w) { return w + josa(w, "은", "는"); }

  document.getElementById("back").addEventListener("click", function () {
    App.Nav.go("birth.html");
  });

  /* ---------- 명식 계산 ---------- */
  var G = window.SajuDeep && window.SajuDeep.GAN;
  var J = window.SajuDeep && window.SajuDeep.JI;

  var solar = { year: b.year, month: b.month, day: b.day };
  if (b.calendar === "lunar" && window.Lunar) {
    var conv = window.Lunar.toSolar(b.year, b.month, b.day, !!b.isLeapMonth);
    if (conv) solar = conv;
  }

  var chart, analyze, read, daewoon, dwNow;
  try {
    chart = window.Saju.computeChart({
      year: solar.year, month: solar.month, day: solar.day,
      hour: b.hourKnown ? b.hour : 12, minute: b.minute || 0,
      hourKnown: !!b.hourKnown
    });
    var hp = chart.pillars.hour || chart.pillars.day;
    var P = {
      년간: G[chart.pillars.year.gan],  년지: J[chart.pillars.year.ji],
      월간: G[chart.pillars.month.gan], 월지: J[chart.pillars.month.ji],
      일간: G[chart.pillars.day.gan],   일지: J[chart.pillars.day.ji],
      시간: G[hp.gan],                  시지: J[hp.ji]
    };
    var now = new Date();
    var age = now.getFullYear() - solar.year + 1;
    daewoon = window.Saju.computeDaewoon(chart, b.gender || "M", 9);
    dwNow = (daewoon && daewoon.list && daewoon.list.length)
      ? window.Saju.daewoonAt(daewoon, age) : null;
    var yearly = window.Saju.computeYearly(chart, now.getFullYear(), 1);

    analyze = window.SajuAnalyze.analyze({
      pillars: P,
      birth: { year: solar.year, month: solar.month, day: solar.day,
               hour: b.hourKnown ? b.hour : 12, minute: 0, hourKnown: !!b.hourKnown },
      hourKnown: !!b.hourKnown,
      termIdx: chart.termIdx, termYear: chart.termYear,
      daeunJi: dwNow && dwNow.ji != null ? J[dwNow.ji] : null,
      seunJi: yearly && yearly[0] && yearly[0].ji != null ? J[yearly[0].ji] : null
    });
    read = window.SajuRead.read(analyze);
  } catch (e) {
    /* 계산이 안 되면 질문으로 넘긴다. 빈 화면을 보여주지 않는다. */
    App.Nav.replace("diagnose.html");
    return;
  }

  T("chart_view", { hourKnown: !!b.hourKnown, gyuk: analyze.gyukguk.display });

  /* ---------- 사주 8글자 ---------- */
  var A = analyze.pillars;
  var COLS = [
    { key: "시", gan: A.시간, ji: A.시지, cap: "시주", sub: "말년·자식" },
    { key: "일", gan: A.일간, ji: A.일지, cap: "일주", sub: "나 자신" },
    { key: "월", gan: A.월간, ji: A.월지, cap: "월주", sub: "직장·사회" },
    { key: "년", gan: A.년간, ji: A.년지, cap: "년주", sub: "배경" }
  ];
  /* 시간을 모르면 시주는 계산에 쓰지 않는다. 있는 척하지 않는다. */
  if (!b.hourKnown) COLS[0] = { key: "시", gan: "?", ji: "?", cap: "시주", sub: "시간 미상", off: true };

  var OH_OF = window.SajuDeep.GAN_OH;
  var JI_OH = window.SajuDeep.JI_OH;
  function ohClass(o) { return "oh--" + ({ 목: "mok", 화: "hwa", 토: "to", 금: "geum", 수: "su" }[o] || "to"); }

  document.getElementById("mzGrid").innerHTML = COLS.map(function (c) {
    var go = c.off ? "" : ohClass(OH_OF[c.gan]);
    var jo = c.off ? "" : ohClass(JI_OH[c.ji]);
    return '<div class="mzc' + (c.off ? " is-off" : "") + '">' +
      '<div class="mzc__cap">' + c.cap + '</div>' +
      '<div class="mzc__g ' + go + '">' + UI.esc(c.gan) + '</div>' +
      '<div class="mzc__j ' + jo + '">' + UI.esc(c.ji) + '</div>' +
      '<div class="mzc__sub">' + c.sub + '</div>' +
    '</div>';
  }).join("");

  var line = [A.년간 + A.년지, A.월간 + A.월지, A.일간 + A.일지,
              b.hourKnown ? A.시간 + A.시지 : "시주 없음"].join(" · ");
  document.getElementById("mzTitle").textContent = line;

  var termNote = "";
  if (chart.termIdx != null) {
    termNote = "달은 절기로 끊습니다. 양력 " + solar.month + "월생이라도 절입 전이면 앞 달로 봅니다. ";
  }
  document.getElementById("mzNote").textContent =
    termNote + (b.hourKnown
      ? "태어난 시간을 주셔서 네 기둥이 다 섰습니다."
      : "태어난 시간을 모르셔서 시주는 비워 두었습니다. 시주에서만 나오는 판정은 쓰지 않습니다.");

  /* ---------- 판정 카드 ---------- */
  var st2 = analyze.strength, gy = analyze.gyukguk, ys = analyze.yongsin;
  var cards = [
    { k: "격국", v: gy.display, d: "타고난 구조의 이름" },
    { k: "일간", v: A.일간 + " (" + OH_OF[A.일간] + ")", d: "사주에서 '나'에 해당하는 글자" },
    { k: "강약", v: st2.label, d: "내 기운이 센 편인지 약한 편인지" },
    { k: "용신", v: ys.용신오행, d: "나를 가장 잘 살리는 기운" }
  ];
  if (analyze.saryeong) {
    cards.push({ k: "사령", v: analyze.saryeong.gan + " (" + analyze.saryeong.layer + ")",
                 d: "태어난 달에서 실제로 힘을 쥔 글자" });
  }
  /* 카드가 다섯이면 마지막 줄에 빈 칸이 남는다.
     십이운성 일주는 만세력에 당연히 들어가는 항목이라 여섯 번째로 채운다. */
  if (analyze.unseong && analyze.unseong.일주) {
    cards.push({ k: "십이운성", v: analyze.unseong.일주,
                 d: "지금 기운이 어느 단계에 있는지" });
  }
  document.getElementById("mzCards").innerHTML = cards.map(function (c) {
    return '<div class="mzk">' +
      '<div class="mzk__k">' + c.k + '</div>' +
      '<div class="mzk__v">' + UI.esc(c.v) + '</div>' +
      '<div class="mzk__d">' + c.d + '</div>' +
    '</div>';
  }).join("");

  /* ---------- 오행 ---------- */
  var OH = analyze.score.oh;
  var ohTot = 0, k;
  for (k in OH) ohTot += OH[k];
  var OHS = ["목", "화", "토", "금", "수"];
  document.getElementById("ohBars").innerHTML = OHS.map(function (o) {
    var pct = ohTot ? Math.round(OH[o] / ohTot * 100) : 0;
    return '<div class="ohr">' +
      '<span class="ohr__l">' + o + '</span>' +
      '<span class="ohr__t"><i class="' + ohClass(o) + '" style="width:' + Math.max(2, pct) + '%"></i></span>' +
      '<span class="ohr__v">' + pct + '%</span>' +
    '</div>';
  }).join("");
  var ohMax = OHS[0], ohMin = OHS[0];
  OHS.forEach(function (o) { if (OH[o] > OH[ohMax]) ohMax = o; if (OH[o] < OH[ohMin]) ohMin = o; });
  document.getElementById("ohCap").textContent =
    iga(ohMax) + " 가장 많고 " + iga(ohMin) + " 가장 적습니다. " +
    "한쪽으로 몰릴수록 성향이 뚜렷해지고, 고를수록 상황을 타는 폭이 큽니다.";

  /* ---------- 십성 ---------- */
  var GR = analyze.score.group;
  var GS = ["비겁", "식상", "재성", "관성", "인성"];
  var GD = { 비겁: "나·동료", 식상: "표현·결과물", 재성: "돈·성과", 관성: "조직·책임", 인성: "배움·인정" };
  var grTot = 0; GS.forEach(function (g) { grTot += GR[g] || 0; });
  document.getElementById("ssBars").innerHTML = GS.map(function (g) {
    var pct = grTot ? Math.round((GR[g] || 0) / grTot * 100) : 0;
    return '<div class="ohr">' +
      '<span class="ohr__l ohr__l--w">' + g + '</span>' +
      '<span class="ohr__t"><i class="oh--ss" style="width:' + Math.max(2, pct) + '%"></i></span>' +
      '<span class="ohr__v">' + pct + '%</span>' +
      '<span class="ohr__d">' + GD[g] + '</span>' +
    '</div>';
  }).join("");
  var gMax = GS[0]; GS.forEach(function (g) { if ((GR[g] || 0) > (GR[gMax] || 0)) gMax = g; });
  document.getElementById("ssCap").textContent =
    iga(gMax) + " 가장 셉니다. 직장 이야기로 옮기면 " + GD[gMax] +
    " 쪽에 무게가 실려 있다는 뜻입니다.";

  /* ---------- 대운 ---------- */
  if (daewoon && daewoon.list && daewoon.list.length) {
    var nowAge = new Date().getFullYear() - solar.year + 1;
    document.getElementById("dwRow").innerHTML = daewoon.list.map(function (d) {
      var on = nowAge >= d.ageFrom && nowAge <= d.ageTo;
      return '<div class="dwc' + (on ? " is-now" : "") + '">' +
        '<div class="dwc__a">' + d.ageFrom + '</div>' +
        '<div class="dwc__g">' + UI.esc(d.ganji) + '</div>' +
        '<div class="dwc__s">' + UI.esc(d.sipsung || "") + '</div>' +
      '</div>';
    }).join("");
    document.getElementById("dwCap").textContent =
      "대운수 " + daewoon.startAge + ", " + (daewoon.forward ? "순행" : "역행") + "입니다. " +
      (dwNow
        ? "지금은 " + dwNow.ageFrom + "~" + dwNow.ageTo + "세 " + dwNow.ganji + " 구간(진하게 표시)에 계십니다."
        : "");
  }

  /* ---------- 통변 ---------- */
  var rs = (read.readings || []).filter(function (r) { return r.strength === "핵심"; });
  if (rs.length < 5) rs = read.readings || [];
  document.getElementById("tbList").innerHTML = rs.slice(0, 7).map(function (r) {
    return '<div class="tbi">' +
      '<p class="tbi__c">' + UI.esc(r.claim) + '</p>' +
      '<p class="tbi__d">' + UI.esc(r.detail) + '</p>' +
      (r.evidence ? '<p class="tbi__e">' + UI.esc(r.evidence) + '</p>' : '') +
    '</div>';
  }).join("");

  document.getElementById("toQ").addEventListener("click", function () {
    T("chart_to_questions");
  });

  UI.reveal(".mz__sec");
})();
