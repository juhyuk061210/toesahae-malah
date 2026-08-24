/* =========================================================
   사주 정보 입력 (§14)
   ========================================================= */
(function () {
  "use strict";
  var T = App.Track, S = App.State;

  T("birth_input_start");

  var name = document.getElementById("name");
  var y = document.getElementById("y"), m = document.getElementById("m"), d = document.getElementById("d");
  var h = document.getElementById("h"), err = document.getElementById("err");
  var lunarHint = document.getElementById("lunarHint");

  var gender = null, cal = "solar";

  /* 이전 입력 복원 */
  var prev = S.load().birth;
  if (prev) {
    name.value = S.load().name || "";
    y.value = prev.year || ""; m.value = prev.month || ""; d.value = prev.day || "";
    h.value = prev.hourKnown ? String(prev.hour) : "unknown";
    gender = prev.gender || null;
    cal = prev.calendar || "solar";
  }

  function seg(id, onPick, current) {
    var box = document.getElementById(id);
    box.querySelectorAll(".seg__b").forEach(function (b) {
      b.classList.toggle("is-on", b.dataset.v === current);
      b.addEventListener("click", function () {
        box.querySelectorAll(".seg__b").forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        onPick(b.dataset.v);
      });
    });
  }
  var leapWrap = document.getElementById("leapWrap");
  var isLeap = document.getElementById("isLeap");

  function syncCal() {
    var lunar = cal === "lunar";
    lunarHint.hidden = !lunar;
    leapWrap.hidden = !lunar;
    if (!lunar) isLeap.checked = false;
    refreshLeap();
  }

  /* 그 해에 해당 윤달이 실제로 존재할 때만 체크박스를 살린다 */
  function refreshLeap() {
    if (cal !== "lunar" || !window.Lunar) return;
    var Y = parseInt(y.value, 10), M = parseInt(m.value, 10);
    var exists = !!(Y && M && window.Lunar.hasLeapMonth(Y, M));
    leapWrap.classList.toggle("is-off", !exists);
    isLeap.disabled = !exists;
    if (!exists) isLeap.checked = false;
  }

  seg("gender", function (v) { gender = v; }, gender);
  seg("cal", function (v) { cal = v; syncCal(); }, cal);
  if (prev && prev.isLeapMonth) isLeap.checked = true;
  syncCal();

  /* 자동 포커스 이동 */
  y.addEventListener("input", function () { refreshLeap(); if (y.value.length >= 4) m.focus(); });
  m.addEventListener("input", function () { refreshLeap(); if (m.value.length >= 2 || +m.value > 1) d.focus(); });

  /* ---- 개인정보 수집 동의 (개인정보 보호법 필수) ---- */
  var agreeAll = document.getElementById("agreeAll");
  var agreeReq = document.getElementById("agreeRequired");
  var agreeAI = document.getElementById("agreeAI");
  /* 광고성 정보 수신동의는 별도로 받아야 한다.
     정보통신망법 §50 — 나중에 다른 종류의 상품을 안내하려면
     이 동의가 미리 있어야 하고, 사후에 소급해서 받을 수 없다. */
  var agreeMkt = document.getElementById("agreeMkt");
  var subs = [agreeReq, agreeAI, agreeMkt].filter(Boolean);

  agreeAll.addEventListener("change", function () {
    subs.forEach(function (c) { c.checked = agreeAll.checked; });
    if (agreeAll.checked) err.textContent = "";
  });
  subs.forEach(function (c) {
    c.addEventListener("change", function () {
      agreeAll.checked = subs.every(function (x) { return x.checked; });
      if (agreeReq.checked) err.textContent = "";
    });
  });

  document.getElementById("go").addEventListener("click", function () {
    var Y = parseInt(y.value, 10), M = parseInt(m.value, 10), D = parseInt(d.value, 10);
    var nowY = new Date().getFullYear();

    if (!agreeReq.checked) {
      err.textContent = "개인정보 수집·이용(필수)에 동의해주세요.";
      document.querySelector(".consent").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!gender) { err.textContent = "성별을 선택해주세요."; return; }
    if (!Y || Y < 1930 || Y > nowY) { err.textContent = "태어난 연도를 확인해주세요 (1930~" + nowY + ")"; return; }
    if (!M || M < 1 || M > 12) { err.textContent = "월을 1~12 사이로 입력해주세요."; return; }
    if (cal === "lunar") {
      // 음력은 달 크기가 29/30일로 달라 실제 존재 여부를 표로 확인한다
      var conv = window.Lunar && window.Lunar.toSolar(Y, M, D, isLeap.checked);
      if (!conv) {
        err.textContent = isLeap.checked
          ? Y + "년에는 윤" + M + "월 " + D + "일이 없어요. 날짜를 확인해주세요."
          : "음력 " + Y + "년 " + M + "월 " + D + "일은 없는 날짜예요.";
        return;
      }
    } else {
      var last = new Date(Y, M, 0).getDate();
      if (!D || D < 1 || D > last) { err.textContent = M + "월은 1~" + last + "일까지 있어요."; return; }
    }
    err.textContent = "";

    var tenureEl = document.getElementById("tenure");
    if (tenureEl && !tenureEl.value) {
      err.textContent = "근속 기간을 선택해주세요.";
      tenureEl.focus();
      return;
    }

    var known = h.value !== "unknown";
    S.save({
      name: name.value.trim() || "고객",
      birth: {
        year: Y, month: M, day: D,
        hourKnown: known,
        hour: known ? parseInt(h.value, 10) : null,
        minute: 0,
        gender: gender,
        calendar: cal,
        isLeapMonth: cal === "lunar" && isLeap.checked
      },
      tenure: tenureEl ? tenureEl.value : null,
      consent: {
        required: true,
        aiTransfer: agreeAI.checked,
        marketing: !!(agreeMkt && agreeMkt.checked),
        at: new Date().toISOString()
      }
    });

    T("birth_input_complete", {
      hourKnown: known, calendar: cal, gender: gender,
      aiConsent: agreeAI.checked,
      mktConsent: !!(agreeMkt && agreeMkt.checked)
    });
    App.Nav.go("chart.html");
  });

  [y, m, d, name].forEach(function (el) {
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") document.getElementById("go").click();
    });
  });

  document.getElementById("back").addEventListener("click", function () {
    location.href = "diagnose.html";
  });
})();
