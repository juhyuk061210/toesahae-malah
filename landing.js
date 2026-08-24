/* =========================================================
   랜딩 인터랙션
   ========================================================= */
(function () {
  "use strict";
  var T = App.Track, UI = App.UI;

  T("landing_view");
  UI.scrollDepth("landing");

  /* 상단바 라인 */
  var top = document.getElementById("top");
  var onScroll = function () { top.classList.toggle("top--line", window.scrollY > 10); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 미리보기 막대 */
  UI.bars(document.getElementById("peekBars"), [
    { label: "사람관계", value: 92 },
    { label: "성장",     value: 81 },
    { label: "보상",     value: 64 },
    { label: "업무량",   value: 72 }
  ], "rd");

  /* 스크롤 등장 */
  UI.reveal(".rv");

  /* 하단 고정 CTA */
  var dock = document.getElementById("dock");
  var hero = document.querySelector(".hero");
  if (dock && hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (ens) {
      ens.forEach(function (en) { dock.classList.toggle("is-on", !en.isIntersecting); });
    }, { threshold: 0, rootMargin: "-60px 0px 0px 0px" }).observe(hero);
  }

  /* CTA 클릭 추적 — 이동은 <a href> 가 처리 */
  document.getElementById("heroCta").addEventListener("click", function () {
    T("hero_cta_click", { place: "hero" });
  });
  document.querySelectorAll("[data-cta]").forEach(function (el) {
    el.addEventListener("click", function () {
      T("hero_cta_click", { place: el.dataset.cta });
    });
  });

  /* 새 진단 시작 시 이전 세션 정리 */
  document.querySelectorAll('a[href="diagnose.html"]').forEach(function (a) {
    a.addEventListener("click", function () { App.State.reset(); });
  });
})();
