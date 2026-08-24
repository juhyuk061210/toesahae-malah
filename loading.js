/* =========================================================
   분석 로딩 연출 (§15)
   실제 계산은 즉시 끝나므로, 연출 시간 동안 결과를 캐시해둔다.
   ========================================================= */
(function () {
  "use strict";
  var T = App.Track, S = App.State;

  if (!App.Nav.require("answers")) return;
  if (!App.Nav.require("birth")) return;

  var st = S.load();
  document.getElementById("lname").textContent =
    (st.name || "고객") + "님의 사주와 직장 상황을 함께 보고 있어요";

  T("analysis_started");

  /* 결과를 미리 계산해 세션에 캐시 (결정성 보장) */
  var report = null;
  try {
    report = App.runDiagnosis();
    if (report) S.save({ report: report });
  } catch (e) {
    console.error("diagnose failed", e);
  }

  /* 연출이 도는 동안 세션만 저장한다.
     AI 서술은 여기서 부르지 않는다 — 무료로만 보고 가는 사람까지
     유료 본문을 생성하면 그 비용이 전부 손실이 된다.
     생성은 결제를 시작하는 시점(result.js)에서 띄운다. */
  if (report) {
    App.Api.saveSession()
      .then(function () { return App.Api.flushEvents(); })
      .catch(function () {});
  }

  /* 일간 글자 회전 → 마지막엔 실제 일간으로 */
  var core = document.getElementById("core");
  var GAN_H = Saju.GAN_H;
  var gi = 0;
  var spin = setInterval(function () {
    gi = (gi + 1) % GAN_H.length;
    core.textContent = GAN_H[gi];
  }, 240);

  var titles = [
    "사주 원국을 확인하고 있어요",
    "직장에서 나타나는 성향을 분석하고 있어요",
    "현재 고민과 직장 흐름을 비교하고 있어요",
    "앞으로의 변화 흐름을 확인하고 있어요",
    "리포트를 완성하고 있어요"
  ];
  var titleEl = document.getElementById("ltitle");
  var fill = document.getElementById("lfill");
  var pct = document.getElementById("lpct");
  var steps = document.querySelectorAll("#lsteps li");

  var DUR = 8600;           // §15 기준 8~15초
  var t0 = null, phase = -1;

  function tick(ts) {
    if (!t0) t0 = ts;
    var p = Math.min((ts - t0) / DUR, 1);
    var eased = p < 0.94 ? p * 0.95 + Math.sin(p * Math.PI * 4) * 0.012 : p;
    var v = Math.max(0, Math.min(100, Math.round(eased * 100)));
    fill.style.width = v + "%";
    pct.textContent = v;

    var ph = Math.min(4, Math.floor(p * 5));
    if (ph !== phase) {
      phase = ph;
      titleEl.textContent = titles[ph];
      steps.forEach(function (li, k) {
        li.classList.toggle("is-on", k === ph);
        li.classList.toggle("is-done", k < ph);
      });
    }

    if (p < 1) requestAnimationFrame(tick);
    else finish();
  }

  function finish() {
    clearInterval(spin);
    steps.forEach(function (li) { li.classList.remove("is-on"); li.classList.add("is-done"); });

    if (report && report.facts && report.facts.ilgan) {
      var idx = Saju.GAN.indexOf(report.facts.ilgan);
      if (idx >= 0) core.textContent = GAN_H[idx];
    }
    titleEl.textContent = "분석이 완료되었어요";
    T("analysis_completed");
    setTimeout(function () { App.Nav.replace("result.html"); }, 620);
  }

  requestAnimationFrame(tick);
})();
