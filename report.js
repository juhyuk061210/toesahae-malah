/* =========================================================
   심층 리포트 (§23 · 10 챕터)
   diagnosis.js 가 만든 JSON 을 렌더링만 한다.
   ========================================================= */
(function () {
  "use strict";
  var T = App.Track, S = App.State, UI = App.UI;

  if (!App.Nav.require("answers")) return;
  if (!App.Nav.require("birth")) return;
  if (!App.Nav.require("paid")) return;

  var st = S.load();
  var R = st.report || App.runDiagnosis();
  if (!R) { App.Nav.replace("diagnose.html"); return; }

  var name = R.name || "고객";
  T("paid_report_start", { type: R.type.key });
  UI.scrollDepth("paid_report");

  /* ---------- 표지 ---------- */
  document.getElementById("cvTitle").innerHTML =
    UI.esc(name) + "님의<br />퇴사 고민 리포트";
  var b = st.birth;
  var f = R.facts;
  document.getElementById("cvMeta").textContent =
    (b.calendar === "lunar" ? "음력" : "양력") + " " + b.year + "." + b.month + "." + b.day +
    " · " + (b.hourKnown ? f.pillars.hour + "시" : "시간 미상") +
    " · " + f.ilgan + "일간 " + f.strength;

  /* ---------- 매트릭스 ---------- */
  var m = R.matrix;
  document.getElementById("mtxName").textContent = m.name;
  document.getElementById("mtxLine").textContent = m.line;
  document.querySelector('.mtx__cell[data-c="' + m.key + '"]').classList.add("is-on");
  var dot = document.getElementById("mtxDot");
  // x: 준비도(0~100) → 25%/75%, y: 변화흐름 → 아래가 낮음
  dot.style.left = (m.x === 1 ? 75 : 25) + "%";
  dot.style.top = (m.y === 1 ? 25 : 75) + "%";

  /* ---------- 종합 점수 ---------- */
  UI.bars(document.getElementById("sumBars"), [
    { label: "직장 압박도", value: R.scores.careerPressure },
    { label: "변화 흐름",   value: R.scores.changeFlow },
    { label: "전환 준비도", value: R.scores.preparation }
  ], "rd");

  /* ---------- AI 서술 ----------
     예전에는 별도 박스에 요약만 보여줬지만, 이제 서술이 본문 자체다.
     서버가 쓴 챕터 문장을 아래 챕터 렌더링에 합쳐 넣는다. */
  var narrative = null;

  function narrativeById(n) {
    var map = {};
    if (n && n.result && n.result.chapters) {
      n.result.chapters.forEach(function (c) { map[c.id] = c; });
    }
    return map;
  }

  function markSource(n) {
    var box = document.getElementById("aiSec");
    if (!box) return;
    var lb = document.getElementById("aiLabel");
    var hd = document.getElementById("aiHead");
    var bd = document.getElementById("aiBody");
    if (!n || !n.result) { box.hidden = true; return; }
    if (lb) lb.textContent = n.source === "llm" ? "AI 맞춤 해설" : "맞춤 해설";
    if (hd) hd.textContent = n.result.headline || "";
    if (bd) bd.innerHTML = n.result.closing
      ? '<p class="ai__p">' + UI.esc(n.result.closing) + "</p>" : "";
    box.hidden = false;
    box.classList.add("is-in");
  }

  /* ---------- 챕터 ---------- */
  var host = document.getElementById("chapters");

  function renderChapters() {
  var byId = narrativeById(narrative);
  var html = "";

  R.paidSections.forEach(function (sec) {
    /* 서술이 있으면 문장은 서술 것을 쓰고, 표·그래프는 계산 결과를 쓴다 */
    var nar = byId[sec.id];
    var c = {
      no: sec.no, id: sec.id, title: sec.title,
      headline: (nar && nar.lead) || sec.headline,
      body: (nar && nar.body) || sec.body,
      extra: sec.extra, list: sec.list, bars: sec.bars,
      series: sec.series, windows: sec.windows
    };
    html += '<section class="ch rv">';
    html += '<div class="ch__head"><span class="ch__no">' +
            String(c.no).padStart(2, "0") + '</span><h2 class="ch__t">' + UI.esc(c.title) + '</h2></div>';

    if (c.headline) html += '<p class="ch__lead">' + UI.esc(c.headline) + "</p>";

    /* body 는 문단 배열도 받는다.
       긴 본문을 <p> 하나에 몰아넣으면 모바일에서 글자 벽이 된다. */
    if (c.body) {
      var paras = Array.isArray(c.body)
        ? c.body
        : String(c.body).split(new RegExp("\\n{2,}"));
      paras.forEach(function (t) {
        t = String(t).trim();
        if (t) html += '<p class="ch__body">' + UI.esc(t) + "</p>";
      });
    }

    if (c.extra) {
      html += '<div class="quotebox"><span class="quotebox__lb">입력하신 고민</span>' +
              '<p>' + UI.esc(c.extra) + "</p></div>";
    }

    if (c.list) {
      html += '<ul class="ticks">' + c.list.map(function (x) {
        return "<li>" + UI.esc(x) + "</li>";
      }).join("") + "</ul>";
    }

    if (c.bars) html += '<div class="bars" data-bars=\'' + JSON.stringify(c.bars) + "'></div>";

    if (c.series) html += '<div class="mflow" data-series=\'' + JSON.stringify(c.series) + "'></div>";

    if (c.windows) {
      html += '<div class="wins">' + c.windows.map(function (w) {
        return '<div class="win">' +
          '<div class="win__head"><span class="win__no">' + w.order + '번째 구간</span>' +
          '<b class="win__when">' + UI.esc(w.label) + "</b></div>" +
          '<p class="win__note">' + UI.esc(w.note) + "</p>" +
          '<p class="win__gz">' + UI.esc(w.ganji) + " · " + UI.esc(w.sipsung) + "</p>" +
        "</div>";
      }).join("") + "</div>";
    }

    html += "</section>";
  });

  host.innerHTML = html;

  /* 막대 렌더 */
  host.querySelectorAll("[data-bars]").forEach(function (el) {
    UI.bars(el, JSON.parse(el.dataset.bars), "rd");
  });

  /* 12개월 흐름 렌더 */
  host.querySelectorAll("[data-series]").forEach(function (el) {
    var list = JSON.parse(el.dataset.series);
    var max = Math.max.apply(null, list.map(function (x) { return x.score; }));
    el.innerHTML =
      '<div class="mflow__chart">' +
        list.map(function (x) {
          var hi = x.score >= max - 4;
          return '<div class="mflow__col' + (hi ? " is-hi" : "") + '" title="' +
            x.label + " " + x.ganji + " " + x.sipsung + '">' +
            '<i style="height:' + x.score + '%"></i>' +
            "<span>" + x.month + "</span>" +
          "</div>";
        }).join("") +
      "</div>" +
      '<p class="mflow__cap">막대가 높을수록 변화·이동의 기운이 강해지는 달입니다.</p>';
  });

  /* reveal 은 선택자를 받는다. 요소를 넘기면 querySelectorAll 이 터지고,
     그 뒤 코드가 통째로 멈춘다(공유·인쇄·이메일까지 죽는다). */
  UI.reveal("#chapters .ch");
  }

  /* ---------- 서술 대기 ----------
     AI 서술은 2분 가까이 걸린다. 결제 시작 시점에 미리 띄워두지만
     그래도 못 끝났을 수 있다. 그때 빈 화면이나 규칙 문장을 먼저 보여주면
     "돈 냈는데 이게 다야?" 가 된다. 그래서 기다리는 화면을 명확히 띄운다. */
  var waitBox = document.getElementById("narrWait");
  var waitBar = document.getElementById("narrBar");
  var waitMsg = document.getElementById("narrMsg");

  var WAIT_MSGS = [
    "명식을 다시 훑어보는 중이에요",
    "직장 흐름과 겹쳐 읽는 중이에요",
    "반복되는 지점을 찾는 중이에요",
    "시기별 흐름을 정리하는 중이에요",
    "문장을 다듬는 중이에요"
  ];

  var waitTimer = null, waitStart = 0;

  function startWait() {
    if (!waitBox) return;
    waitBox.hidden = false;
    waitStart = Date.now();
    var i = 0;
    waitTimer = setInterval(function () {
      var el = (Date.now() - waitStart) / 1000;
      /* 실측 56초. 여유를 둬 70초 기준으로 채우되 끝까지 붙지는 않게 한다.
         100%에서 멈춰 있으면 오히려 고장난 것처럼 보인다. */
      var pct = Math.min(96, Math.round(el / 70 * 100));
      if (waitBar) waitBar.style.width = pct + "%";
      var idx = Math.min(WAIT_MSGS.length - 1, Math.floor(el / 14));
      if (idx !== i) { i = idx; if (waitMsg) waitMsg.textContent = WAIT_MSGS[idx]; }
    }, 400);
    if (waitMsg) waitMsg.textContent = WAIT_MSGS[0];
  }

  function endWait() {
    if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
    if (waitBar) waitBar.style.width = "100%";
    if (waitBox) setTimeout(function () { waitBox.hidden = true; }, 260);
  }

  if (st.narrative && st.narrative.result) {
    /* 결제 전에 이미 완성돼 있던 경우 — 기다림 없음 */
    narrative = st.narrative;
    markSource(narrative);
    renderChapters();
  } else {
    renderChapters();          // 표·그래프는 먼저 그려둔다
    startWait();
    T("narrative_wait_start");
    App.Api.narrative().then(function (n) {
      endWait();
      if (!n || !n.result) return;
      narrative = n;
      markSource(n);
      renderChapters();
      T("narrative_ready", {
        source: n.source,
        secs: Math.round((Date.now() - waitStart) / 1000)
      });
    }).catch(function () {
      endWait();
      T("narrative_failed");
    });
  }

  /* ---------- 공유 카드 ---------- */
  document.getElementById("shType").textContent = R.type.name;
  document.getElementById("shTag").textContent = R.type.tag;

  function share() {
    T("share_click", { where: "paid_report" });
    UI.share(name + "님의 직장 변화 유형은 " + R.type.name + "입니다.");
  }
  document.getElementById("shareBtn").addEventListener("click", share);
  document.getElementById("shareBtn2").addEventListener("click", share);
  document.getElementById("shareTop").addEventListener("click", share);

  document.getElementById("printBtn").addEventListener("click", function () {
    T("save_print_click");
    window.print();
  });

  /* ---------- 저장 ----------
     예전에는 여기에 이메일 입력란이 있었다. 그런데 발송 기능이 없어서
     주소만 받아두고 "발송은 정식 오픈 시 제공됩니다" 라고 답했다.
     결제한 손님에게 "메일로 받아두세요" 라고 해놓고 안 보내는 건
     하지 않은 약속이라 입력란 자체를 걷어냈다.
     지금 실제로 되는 저장 수단은 인쇄·PDF 뿐이므로 그것만 안내한다. */
  var saveBtn = document.getElementById("saveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      T("save_print_click", { where: "mailbox" });
      window.print();
    });
  }

  /* ---------- 완독 추적 ---------- */
  var end = document.querySelector(".rfoot");
  if (end && "IntersectionObserver" in window) {
    new IntersectionObserver(function (ens, obs) {
      ens.forEach(function (en) {
        if (en.isIntersecting) { T("paid_report_complete"); obs.disconnect(); }
      });
    }, { threshold: 0.4 }).observe(end);
  }

  UI.reveal(".rv");
})();
