/* =========================================================
   퇴사해말아? · 공통 앱 레이어
   - 세션 상태 (회원가입 없이 guest 진행, 기획안 §40)
   - 이벤트 추적 (§49)
   - 화면 이동 가드
   - 렌더 헬퍼
   ========================================================= */
(function (g) {
  "use strict";

  var KEY = "tsm.session";
  var EVKEY = "tsm.events";

  /* =========================================================
     상태
     ========================================================= */
  var State = {
    load: function () {
      try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); }
      catch (e) { return {}; }
    },
    save: function (patch) {
      var cur = State.load();
      Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
      try { sessionStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
      return cur;
    },
    answer: function (id, value) {
      var cur = State.load();
      cur.answers = cur.answers || {};
      cur.answers[id] = value;
      try { sessionStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
      return cur;
    },
    reset: function () {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
    },

    hasAnswers: function () {
      var s = State.load();
      if (!s.answers) return false;
      /* 새 질문지 기준. 결제 후 문항(answersB)은 전부 선택이라 여기서 안 본다. */
      var need = ["quitFrequency", "actions", "selfLabel", "drain",
                  "miracle", "runway", "deadline", "pastQuit"];
      return need.every(function (k) {
        var v = s.answers[k];
        if (k === "drain") return !!(v && v.top);
        if (k === "actions") return Array.isArray(v) && v.length > 0;
        return v !== undefined && v !== null && v !== "";
      });
    },
    hasBirth: function () {
      var b = State.load().birth;
      return !!(b && b.year && b.month && b.day && b.gender);
    },
    isPaid: function () { return !!State.load().paid; },
    setPaid: function () { return State.save({ paid: true, paidAt: Date.now() }); }
  };

  /* =========================================================
     이벤트 추적 (§49)
     실제 서비스에서는 여기서 GA4 / Meta Pixel / PostHog 로 전송합니다.
     지금은 로컬에 쌓아 두고 콘솔에 남깁니다.
     ========================================================= */
  function Track(name, props) {
    var ev = {
      name: name,
      props: props || {},
      t: Date.now(),
      path: location.pathname.split("/").pop() || "index.html"
    };
    try {
      var log = JSON.parse(sessionStorage.getItem(EVKEY) || "[]");
      log.push(ev);
      sessionStorage.setItem(EVKEY, JSON.stringify(log.slice(-200)));
    } catch (e) {}

    // 외부 도구 연동 지점
    if (g.dataLayer && g.dataLayer.push) g.dataLayer.push({ event: name, ...ev.props });
    if (typeof g.fbq === "function") {
      var META = { purchase_complete: "Purchase", checkout_start: "InitiateCheckout", diagnosis_start: "Lead" };
      if (META[name]) g.fbq("track", META[name]);
    }
    if (g.console && console.debug) console.debug("[track]", name, ev.props);
  }
  Track.dump = function () {
    try { return JSON.parse(sessionStorage.getItem(EVKEY) || "[]"); } catch (e) { return []; }
  };

  /* =========================================================
     이동 가드
     ========================================================= */
  var Nav = {
    go: function (page) { location.href = page; },
    replace: function (page) { location.replace(page); },

    /* 필요한 데이터가 없으면 앞 단계로 되돌린다 */
    require: function (what) {
      /* 순서가 바뀌었다. 생년월일 → 명식 → 질문 → 결과.
         그래서 답변이 없을 때 되돌릴 곳은 여전히 질문 화면이지만,
         생년월일이 없으면 질문보다 앞 단계인 birth 로 보내야 한다. */
      if (what === "answers" && !State.hasAnswers()) {
        Nav.replace(State.hasBirth() ? "diagnose.html" : "birth.html");
        return false;
      }
      if (what === "birth" && !State.hasBirth()) { Nav.replace("birth.html"); return false; }
      if (what === "paid" && !State.isPaid()) { Nav.replace("result.html"); return false; }
      return true;
    }
  };

  /* =========================================================
     진단 실행
     ========================================================= */
  function runDiagnosis() {
    var s = State.load();
    if (!s.answers || !s.birth) return null;

    /* 새 질문지 → 진단 엔진이 읽는 형태로 옮긴다.
       점수는 bridge 가 실제 행동 기준으로 다시 계산한 것을 쓴다. */
    var legacy = g.Bridge
      ? g.Bridge.toLegacy({ answers: s.answers, answersB: s.answersB, tenure: s.tenure })
      : s.answers;

    var report = g.Diagnosis.diagnose({
      name: s.name || (s.birth && s.birth.name) || "고객",
      answers: legacy,
      birth: s.birth,
      now: new Date()
    });

    /* 리포트가 "~라고 답하셨습니다" 라고 쓸 수 있게 라벨을 붙여준다 */
    if (report && g.Bridge) {
      report.answersLabel = g.Bridge.labels(
        { answers: s.answers, answersB: s.answersB, tenure: s.tenure });
    }

    /* 답변끼리 부딪혀 나온 것 — 개인화의 실제 근거 */
    if (report && g.Tension && g.Bridge) {
      try {
        report.tension = g.Tension.detect(
          g.Bridge.flatten({ answers: s.answers, answersB: s.answersB, tenure: s.tenure }),
          { tenureYears: g.Bridge.tenureYears(s.tenure) }
        );
      } catch (e) { report.tension = null; }
    }
    return report;
  }

  /* =========================================================
     렌더 헬퍼
     ========================================================= */
  var UI = {
    /* 막대 그래프 */
    bars: function (el, items, variant) {
      if (!el) return;
      el.innerHTML = items.map(function (b) {
        return '<div class="bar">' +
          '<span class="bar__lb">' + b.label + '</span>' +
          '<span class="bar__tr"><i class="bar__fl' + (variant ? " bar__fl--" + variant : "") +
          '" data-w="' + b.value + '"></i></span>' +
          '<span class="bar__vl">' + b.value + '</span>' +
        '</div>';
      }).join("");
      requestAnimationFrame(function () {
        setTimeout(function () {
          el.querySelectorAll(".bar__fl").forEach(function (f) { f.style.width = f.dataset.w + "%"; });
        }, 80);
      });
    },

    /* 숫자 카운트업 */
    count: function (el, target, dur) {
      if (!el) return;
      dur = dur || 1100;
      var t0 = null;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
        if (p < 1) requestAnimationFrame(step); else el.textContent = target;
      }
      requestAnimationFrame(step);
    },

    /* 스크롤 등장 */
    reveal: function (sel) {
      var els = document.querySelectorAll(sel || ".rv");
      if (!("IntersectionObserver" in window)) {
        els.forEach(function (e) { e.classList.add("is-in"); });
        return;
      }
      var io = new IntersectionObserver(function (ens, obs) {
        ens.forEach(function (en) {
          if (!en.isIntersecting) return;
          var el = en.target;
          var sibs = Array.prototype.slice.call(el.parentNode.children);
          el.style.transitionDelay = Math.min(sibs.indexOf(el), 4) * 60 + "ms";
          el.classList.add("is-in");
          obs.unobserve(el);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
      els.forEach(function (e) { io.observe(e); });
    },

    /* 스크롤 깊이 추적 */
    scrollDepth: function (label) {
      var hits = {};
      window.addEventListener("scroll", function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        if (h <= 0) return;
        var p = Math.round((window.scrollY / h) * 100);
        [25, 50, 75, 100].forEach(function (m) {
          if (p >= m && !hits[m]) { hits[m] = 1; Track("scroll_depth", { page: label, depth: m }); }
        });
      }, { passive: true });
    },

    /* 공유 */
    share: function (text) {
      var url = location.origin + location.pathname.replace(/[^/]+$/, "index.html");
      if (navigator.share) {
        navigator.share({ title: "퇴사해말아?", text: text, url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { alert("링크가 복사되었습니다."); });
      } else { alert(url); }
    },

    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  };

  /* =========================================================
     서버 연동
     서버가 없어도(정적 호스팅) 앱은 그대로 동작한다 — 저장과
     AI 서술만 생략된다.
     ========================================================= */
  var Api = {
    _dead: false,

    post: function (path, body) {
      if (Api._dead) return Promise.resolve(null);
      return fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {})
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { Api._dead = true; return null; });
    },

    /* 진단 결과를 서버에 저장하고 세션 ID를 받아둔다 */
    saveSession: function () {
      var s = State.load();
      if (!s.report) return Promise.resolve(null);
      return Api.post("/api/session", {
        sessionId: s.serverSessionId || null,
        name: s.name,
        birth: s.birth,
        answers: s.answers,
        answersB: s.answersB || null,
        tenure: s.tenure || null,
        report: s.report,
        consent: s.consent || null
      }).then(function (r) {
        if (r && r.sessionId) State.save({ serverSessionId: r.sessionId });
        return r;
      });
    },

    /* 쌓인 이벤트를 서버로 넘긴다 */
    flushEvents: function () {
      var log = Track.dump();
      if (!log.length) return Promise.resolve(null);
      return Api.post("/api/events", {
        sessionId: State.load().serverSessionId || null,
        events: log.map(function (e) { return { name: e.name, props: e.props }; })
      }).then(function (r) {
        if (r) { try { sessionStorage.removeItem(EVKEY); } catch (e) {} }
        return r;
      });
    },

    /* LLM 서술 — 실패하면 서버가 규칙 기반으로 내려준다.
       국외 이전에 동의하지 않았으면 아예 호출하지 않는다 (개인정보 보호법). */
    narrative: function () {
      var s = State.load();
      if (s.narrative) return Promise.resolve(s.narrative);
      if (!s.birth) return Promise.resolve(null);

      /* 사주 판정은 서버가 직접 한다. 생년월일과 답변만 보낸다.
         국외 이전에 동의하지 않았으면 LLM 을 쓰지 말라고 알린다. */
      /* 서버가 사주와 긴장을 직접 다시 계산한다. 원본 답변을 그대로 넘긴다. */
      var body = {
        sessionId: s.serverSessionId || null,
        name: s.name || (s.birth && s.birth.name) || "고객",
        birth: s.birth,
        answers: s.answers || null,
        answersB: s.answersB || null,
        tenure: s.tenure || null,
        answersLabel: (s.report && s.report.answersLabel) ||
          (g.Bridge ? g.Bridge.labels({ answers: s.answers, answersB: s.answersB, tenure: s.tenure }) : {}),
        report: s.report || null
      };
      if (!(s.consent && s.consent.aiTransfer)) body.noLLM = true;

      return Api.post("/api/narrative", body).then(function (r) {
        if (r) State.save({ narrative: r });
        return r;
      });
    },

    order: function (amount) {
      return Api.post("/api/order", {
        sessionId: State.load().serverSessionId || null,
        amount: amount
      });
    },
    confirmOrder: function (orderId, paymentKey) {
      return Api.post("/api/order/confirm", { orderId: orderId, paymentKey: paymentKey });
    },
    saveEmail: function (email) {
      return Api.post("/api/email", {
        email: email,
        sessionId: State.load().serverSessionId || null
      });
    }
  };

  g.App = {
    State: State, Track: Track, Nav: Nav, UI: UI, Api: Api,
    runDiagnosis: runDiagnosis,
    PRICE: (g.SITE && g.SITE.price) || 9900,
    /* 체험판 여부 — 결제·유료 열람을 막고 안내로 대체한다 */
    DEMO: !!(g.SITE && g.SITE.demo)
  };
})(window);
