/* =========================================================
   사이트 공통 — 사업자 정보 렌더 + Meta 픽셀 로더
   config.js 다음에 로드하세요.
   ========================================================= */
(function (g) {
  "use strict";
  var C = g.SITE || {};
  var biz = C.biz || {};
  var meta = C.meta || {};

  /* =========================================================
     Meta 픽셀
     pixelId 가 비어 있으면 아무것도 로드하지 않습니다.
     ========================================================= */
  if (meta.pixelId) {
    /* 표준 픽셀 부트스트랩 */
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(g, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    g.fbq("init", meta.pixelId);
    g.fbq("track", "PageView");
  }

  /* 도메인 인증 메타태그 (Meta 광고 관리자에서 발급) */
  if (meta.domainVerification && !document.querySelector('meta[name="facebook-domain-verification"]')) {
    var mt = document.createElement("meta");
    mt.name = "facebook-domain-verification";
    mt.content = meta.domainVerification;
    document.head.appendChild(mt);
  }

  /* =========================================================
     사업자 정보 렌더
     .foot__biz 요소가 있으면 config 값으로 채웁니다.
     ========================================================= */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var el = document.querySelector(".foot__biz");
    if (!el) return;

    var filled = biz.name && biz.regNo && biz.mailOrderNo;
    if (!filled) {
      /* 데모 공개 중에는 개발자용 경고 대신 손님용 안내를 보여준다.
         "사업자 정보 미등록" 은 개발자에게 하는 말이지 손님에게 할 말이 아니다. */
      if (C.demo) {
        el.innerHTML =
          '<span style="font-weight:700">체험판입니다</span><br />' +
          "지금은 결제 없이 무료 진단만 제공합니다. " +
          "정식 판매는 사업자 등록과 결제 연동을 마친 뒤 시작합니다.";
      } else {
        el.innerHTML =
          '<span style="color:var(--rd);font-weight:700">사업자 정보 미등록</span><br />' +
          "config.js 의 biz 항목을 채워야 판매를 시작할 수 있습니다.";
      }
      return;
    }

    var rows = [
      "상호 " + esc(biz.name) + (biz.ceo ? " · 대표 " + esc(biz.ceo) : ""),
      "사업자등록번호 " + esc(biz.regNo),
      "통신판매업 신고번호 " + esc(biz.mailOrderNo)
    ];
    if (biz.address) rows.push(esc(biz.address));
    var contact = [];
    if (biz.tel) contact.push("전화 " + esc(biz.tel));
    if (biz.email) contact.push("이메일 " + esc(biz.email));
    if (contact.length) rows.push(contact.join(" · "));

    el.innerHTML = rows.join("<br />");
  });
})(window);
