/* =========================================================
   무료 진단 결과 + 페이월 (§16~§20, §56)
   ========================================================= */
(function () {
  "use strict";
  var T = App.Track, S = App.State, UI = App.UI;

  if (!App.Nav.require("answers")) return;
  if (!App.Nav.require("birth")) return;

  /* 로딩에서 캐시한 결과 사용, 없으면 재계산 */
  var st = S.load();
  var R = st.report || App.runDiagnosis();
  if (!R) { App.Nav.replace("diagnose.html"); return; }
  if (!st.report) S.save({ report: R });

  var name = R.name || "고객";
  T("free_result_view", { type: R.type.key, matrix: R.matrix.key });
  UI.scrollDepth("free_result");

  /* ---------- 인트로 ---------- */
  document.getElementById("introTitle").innerHTML =
    UI.esc(name) + "님은 지금<br /><span class=\"mark\">" + UI.esc(R.type.name) + "</span>에 가깝습니다";
  document.getElementById("introSub").textContent = R.type.tag;

  /* ---------- ① 직장 압박도 ---------- */
  var f1 = R.freeSections[0];
  document.getElementById("s1Title").textContent = f1.title;
  document.getElementById("s1Level").textContent = f1.level;
  UI.count(document.getElementById("s1Score"), f1.score);
  UI.bars(document.getElementById("s1Bars"), f1.bars, "rd");
  T("free_result_section_1");

  /* ---------- ② 직장생활 성향 ---------- */
  var f2 = R.freeSections[1];
  document.getElementById("s2Head").textContent = f2.headline;
  document.getElementById("s2Body").textContent = f2.body;

  // 십성 근거는 0~10개 범위를 0~100으로 환산해 표시
  UI.bars(document.getElementById("s2Ev"), f2.evidence.map(function (e) {
    return { label: e.k + " " + e.hint, value: Math.min(100, e.v * 22) };
  }));

  /* 근거를 눈에 보이게 깐다.
     "당신은 이런 사람입니다" 로 끝내면 점쟁이 말이고,
     명식 근거를 함께 보여주면 확인 가능한 말이 된다. */
  if (f2.proofs && f2.proofs.length) {
    var ev = document.getElementById("s2Ev");
    ev.innerHTML = f2.proofs.map(function (x) {
      return '<div class="proof">' +
        '<p class="proof__claim">' + UI.esc(x.claim) + "</p>" +
        '<p class="proof__ev">' + UI.esc(x.evidence) + "</p>" +
      "</div>";
    }).join("");
  }

  var p = R.facts.pillars;
  var meta = [];
  if (f2.gyuk) meta.push(f2.gyuk);
  if (f2.strengthLabel) meta.push(f2.strengthLabel);
  if (f2.saryeong) meta.push("월령 사령 " + f2.saryeong);
  document.getElementById("s2Pillars").textContent =
    "사주 원국 " + (f2.chartLine ||
      [p.year, p.month, p.day, p.hour || "시간 미상"].join(" · ")) +
    (meta.length ? "  ·  " + meta.join(" · ") : "");
  /* 근거를 접지 않고 바로 펼쳐두므로 toggle 추적은 없앤다.
     남겨두면 요소가 없어 페이지 스크립트가 통째로 멈춘다. */
  T("free_result_section_2");

  /* ---------- ③ 회사 vs 일 ---------- */
  var f3 = R.freeSections[2];
  document.getElementById("s3Verdict").textContent = f3.verdict;
  document.getElementById("s3Body").textContent = f3.body;
  UI.bars(document.getElementById("s3Bars"), f3.bars);
  T("free_result_section_3");

  /* ---------- ④ 12개월 흐름 (앞 4개월만 공개) ---------- */
  var flow = R.monthlyFlow;
  var OPEN = 4;
  document.getElementById("s4Lead").innerHTML =
    "앞으로 12개월 중 직장 흐름이 크게 바뀌는 구간이 <b>2번</b> 발견됐습니다.";

  function flowBars(el, list, dim) {
    el.innerHTML = list.map(function (m) {
      return '<div class="fbar">' +
        '<i class="fbar__fl" style="height:' + m.score + '%"></i>' +
        '<span class="fbar__lb">' + String(m.month) + '</span>' +
      '</div>';
    }).join("");
  }
  flowBars(document.getElementById("flowOpen"), flow.slice(0, OPEN));
  flowBars(document.getElementById("flowBlur"), flow.slice(OPEN));

  /* ---------- ⑤ 종합 문구 (§56) ---------- */
  var sc = R.scores;
  var gap = sc.changeFlow - sc.preparation;
  var summaryLine =
    gap >= 22
      ? "마음은 이미 회사 밖으로 향하고 있지만, 다음 선택지는 아직 충분히 만들어지지 않았습니다."
      : gap <= -22
        ? "준비는 되어 있지만, 흐름이 아직 크게 열리지는 않았습니다."
        : "지금은 마음과 준비가 비슷한 속도로 움직이고 있습니다.";

  document.getElementById("summary").innerHTML =
    '<p class="summary__lead">' + UI.esc(name) + '님의 경우</p>' +
    '<div class="summary__rows">' +
      row("현재 직장 압박도", sc.careerPressure, "rd") +
      row("사주상 변화 흐름", sc.changeFlow, "rd") +
      row("전환 준비도", sc.preparation, sc.preparation < 45 ? "dim" : "") +
    '</div>' +
    '<p class="summary__line">' + summaryLine + '</p>';

  function row(label, val, tone) {
    return '<div class="summary__row">' +
      '<span>' + label + '</span>' +
      '<b class="' + (tone ? "is-" + tone : "") + '">' + val + '</b>' +
    '</div>';
  }

  /* ---------- 페이월 ---------- */
  var seen = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (ens) {
      ens.forEach(function (en) {
        if (en.isIntersecting && !seen) { seen = true; T("paywall_view"); }
      });
    }, { threshold: 0.3 }).observe(document.getElementById("paywall"));
  }

  function buy() {
    T("checkout_start", { price: App.PRICE });

    /* 데모 공개 중에는 결제를 흉내내지 않는다.
       "테스트 통과 처리" 같은 개발자용 문구를 손님에게 보이면 안 되고,
       결제도 안 되는데 결제창 흉내를 내면 그게 더 나쁘다. */
    if (App.DEMO) {
      T("demo_paywall_click");
      alert(
        "지금은 체험판이라 결제와 상세 리포트는 열려 있지 않습니다.\n\n" +
        "무료 진단 결과는 그대로 보실 수 있고,\n" +
        "정식 오픈하면 여기서 바로 이어집니다."
      );
      return;
    }

    /* 결제창이 뜨고 카드 정보를 넣는 동안 뒤에서 리포트를 쓰기 시작한다.
       AI 서술은 2분 가까이 걸리므로, 결제가 끝난 뒤 시작하면
       손님이 빈 화면을 오래 보게 된다.
       실패해도 여기서 막지 않는다 — report.html 이 다시 시도한다. */
    App.Api.narrative().catch(function () {});

    // 서버에 주문을 먼저 만들어 둔다. 실제 PG 연동은 이 사이에 들어간다:
    //   order 생성 → PG 결제창 → 성공 콜백 → /api/order/confirm 으로 서버 검증
    App.Api.order(App.PRICE).then(function (o) {
      var ok = confirm(
        "[결제 테스트]\n\n" +
        "퇴사해말아? 심층 리포트\n" +
        App.PRICE.toLocaleString("ko-KR") + "원\n\n" +
        "확인을 누르면 전체 리포트가 열립니다.\n" +
        "(PG 연동 자리 — 지금은 테스트 통과 처리)"
      );
      if (!ok) { T("checkout_cancel"); return; }

      var grant = function () {
        S.setPaid();
        T("purchase_complete", { price: App.PRICE, type: R.type.key });
        /* 결제 후 8문항으로 보낸다. 전부 건너뛸 수 있고,
           답할수록 리포트 문장이 그 사람 것이 된다. */
        App.Api.flushEvents().then(function () { App.Nav.go("phaseb.html"); });
      };

      if (!o || !o.orderId) {
        // 서버가 없는 정적 배포 — 로컬 확인용으로만 열어준다
        grant();
        return;
      }

      // 서버가 결제를 확정해준 경우에만 열람 권한을 준다
      App.Api.confirmOrder(o.orderId, "TEST").then(function (r) {
        if (r && r.ok) { grant(); return; }
        T("checkout_failed");
        alert(
          "결제 확인에 실패했습니다. 서버에서 결제 검증이 완료되지 않았습니다. " +
          "개발 중이라면 PAYMENT_VERIFY=off 로 서버를 실행하세요."
        );
      });
    });
  }
  document.getElementById("buy").addEventListener("click", buy);
  document.getElementById("buy2").addEventListener("click", buy);

  document.getElementById("shareTop").addEventListener("click", function () {
    T("share_click", { where: "free_result" });
    UI.share(name + "님의 직장 변화 유형은 " + R.type.name + "입니다.");
  });

  UI.reveal(".rv");
})();
