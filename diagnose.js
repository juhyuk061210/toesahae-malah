/* =========================================================
   질문 화면 — 한 화면에 한 질문
   ---------------------------------------------------------
   questions.js 의 PHASE_A / PHASE_B 를 읽어 화면을 만든다.

   화면에서 지켜야 하는 것:
   - 복수선택(actions)의 층 구분선은 절대 보이지 않게 한다.
     사용자가 "아래쪽이 진짜"라고 눈치채면 응답이 왜곡된다.
   - 단일선택은 고르면 바로 넘어간다. 나머지는 '다음' 버튼.
   - 결제 후(Phase B)는 전 문항 건너뛰기를 허용한다.
   ========================================================= */
(function () {
  "use strict";
  var T = App.Track, S = App.State, UI = App.UI;

  /* 어느 단계인가 — 페이지가 data-phase 로 알려준다 */
  var PHASE = (document.body.dataset.phase === "B") ? "B" : "A";
  var Q = (PHASE === "B") ? Questions.PHASE_B : Questions.PHASE_A;

  /* 부속 질문(sceneWhen)은 앞 질문과 한 화면에 붙인다 */
  var STEPS = [];
  Q.forEach(function (q) {
    if (q.sub && STEPS.length) STEPS[STEPS.length - 1].extra = q;
    else STEPS.push({ main: q, extra: null });
  });

  var stage = document.getElementById("stage");
  var prog = document.getElementById("prog");
  var qNow = document.getElementById("qNow");
  document.getElementById("qAll").textContent = STEPS.length;

  /* ?q=3 으로 특정 질문에서 시작할 수 있다.
     화면 확인용이기도 하고, 나중에 '이어하기'에도 쓴다. */
  var i = 0;
  try {
    var want = Number(new URLSearchParams(location.search).get("q"));
    if (want >= 1 && want <= STEPS.length) i = want - 1;
  } catch (e) { i = 0; }

  var KEY = (PHASE === "B") ? "answersB" : "answers";

  T(PHASE === "B" ? "phaseB_start" : "diagnosis_start");

  function saved(id) {
    var bag = S.load()[KEY] || {};
    return bag[id];
  }
  function store(id, v) {
    var st = S.load();
    var bag = st[KEY] || {};
    bag[id] = v;
    var patch = {}; patch[KEY] = bag;
    S.save(patch);
  }

  /* ---------- 그리기 ---------- */
  function paint() {
    var step = STEPS[i], q = step.main;
    qNow.textContent = i + 1;
    prog.style.width = ((i + 1) / STEPS.length) * 100 + "%";

    var h = '<div class="qstep" key="' + q.id + '">';
    h += '<p class="qstep__no">질문 ' + (i + 1) + '</p>';
    h += '<h2 class="qstep__title">' + q.title + "</h2>";
    if (q.desc) h += '<p class="qstep__desc">' + q.desc + "</p>";

    h += render(q, saved(q.id));

    if (step.extra) {
      h += '<div class="qsub">';
      h += '<p class="qsub__t">' + step.extra.title + "</p>";
      h += render(step.extra, saved(step.extra.id));
      h += "</div>";
    }

    /* 넘어가는 버튼 — 단일선택은 자동으로 넘어가므로 필요 없다 */
    var needsBtn = (q.type !== "single") || step.extra;
    if (needsBtn) {
      h += '<button class="btn btn--pri btn--full" id="next" type="button">' +
           (i === STEPS.length - 1 ? lastLabel() : "다음") + "</button>";
    }
    if (PHASE === "B" || q.type === "text") {
      h += '<button class="btn btn--ghost btn--full qstep__skip" id="skip" type="button">건너뛰기</button>';
    }

    h += "</div>";
    stage.innerHTML = h;
    window.scrollTo(0, 0);
    bind(step);
  }

  function lastLabel() {
    return PHASE === "B" ? "리포트 만들기" : "다음";
  }

  function render(q, cur) {
    if (q.type === "single") return renderSingle(q, cur);
    if (q.type === "multi") return renderMulti(q, cur);
    if (q.type === "bestworst") return renderBestWorst(q, cur);
    if (q.type === "scale") return renderScale(q, cur);
    if (q.type === "text") return renderText(q, cur);
    return "";
  }

  function renderSingle(q, cur) {
    var h = '<div class="opts" data-q="' + q.id + '" data-type="single">';
    q.options.forEach(function (o) {
      h += '<button class="opt' + (cur === o.v ? " is-on" : "") +
           '" type="button" data-v="' + o.v + '">' +
           '<span class="opt__t">' + o.label + "</span>" +
           '<span class="opt__c" aria-hidden="true"></span>' +
           "</button>";
    });
    return h + "</div>";
  }

  function renderMulti(q, cur) {
    var on = cur || [];
    /* 층(tier)은 표시하지 않는다 — 순서만 유지한다 */
    var h = '<div class="opts opts--multi" data-q="' + q.id + '" data-type="multi">';
    q.options.forEach(function (o) {
      h += '<button class="opt opt--chk' + (on.indexOf(o.v) >= 0 ? " is-on" : "") +
           '" type="button" data-v="' + o.v + '"' +
           (o.exclusive ? ' data-excl="1"' : "") + ">" +
           '<span class="opt__t">' + o.label + "</span>" +
           '<span class="opt__c" aria-hidden="true"></span>' +
           "</button>";
    });
    return h + "</div>";
  }

  function renderBestWorst(q, cur) {
    var v = cur || {};
    var opts = q.options.slice();
    if (q.shuffle) opts = shuffleStable(opts, q.id);
    var h = "";
    [["top", "가장 지치게 하는 것"], ["bottom", "가장 상관없는 것"]].forEach(function (side) {
      h += '<p class="bw__lb">' + side[1] +
           (side[0] === "bottom" ? ' <span class="bw__opt">선택 안 해도 됩니다</span>' : "") + "</p>";
      h += '<div class="opts opts--bw" data-q="' + q.id + '" data-side="' + side[0] + '">';
      opts.forEach(function (o) {
        h += '<button class="opt opt--sm' + (v[side[0]] === o.v ? " is-on" : "") +
             '" type="button" data-v="' + o.v + '">' +
             '<span class="opt__t">' + o.label + "</span></button>";
      });
      h += "</div>";
    });
    return h;
  }

  function renderScale(q, cur) {
    var val = (typeof cur === "number") ? cur : null;
    var h = '<div class="scale" data-q="' + q.id + '">';
    h += '<div class="scale__row">';
    for (var n = q.min; n <= q.max; n++) {
      h += '<button class="scale__n' + (val === n ? " is-on" : "") +
           '" type="button" data-v="' + n + '">' + n + "</button>";
    }
    h += "</div>";
    h += '<div class="scale__ends"><span>' + q.minLabel + "</span><span>" + q.maxLabel + "</span></div>";
    h += "</div>";

    if (q.followUp) {
      h += '<div class="qfollow" id="follow" hidden>';
      h += '<p class="qfollow__t" id="followT"></p>';
      h += '<textarea class="ta" id="followTa" rows="3" maxlength="200"></textarea>';
      h += "</div>";
    }
    return h;
  }

  function renderText(q, cur) {
    var h = '<textarea class="ta" id="ta" rows="5" maxlength="' + (q.max || 300) +
            '" placeholder="' + (q.placeholder || "") + '">' + UI.esc(cur || "") + "</textarea>";
    h += '<p class="ta__count"><span id="taN">0</span>/' + (q.max || 300) + "</p>";
    return h;
  }

  /* 같은 질문은 항상 같은 순서로 섞는다 — 뒤로 갔다 와도 순서가 안 바뀐다 */
  function shuffleStable(arr, seed) {
    var s = 0, i2;
    for (i2 = 0; i2 < seed.length; i2++) s = (s * 31 + seed.charCodeAt(i2)) & 0x7fffffff;
    var out = arr.slice();
    for (i2 = out.length - 1; i2 > 0; i2--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      var j = s % (i2 + 1);
      var t = out[i2]; out[i2] = out[j]; out[j] = t;
    }
    return out;
  }

  /* ---------- 동작 ---------- */
  function bind(step) {
    var q = step.main;

    /* 단일선택 — 고르면 바로 넘어간다 (부속 질문이 없을 때만) */
    stage.querySelectorAll('.opts[data-type="single"]').forEach(function (box) {
      var qid = box.dataset.q;
      box.querySelectorAll(".opt").forEach(function (btn) {
        btn.addEventListener("click", function () {
          box.querySelectorAll(".opt").forEach(function (b) { b.classList.remove("is-on"); });
          btn.classList.add("is-on");
          store(qid, btn.dataset.v);
          T("q_" + qid, { value: btn.dataset.v });
          if (qid === q.id && !step.extra) setTimeout(next, 190);
        });
      });
    });

    /* 복수선택 */
    stage.querySelectorAll('.opts[data-type="multi"]').forEach(function (box) {
      var qid = box.dataset.q;
      box.querySelectorAll(".opt").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var excl = btn.dataset.excl === "1";
          if (excl) {
            /* '아무것도 안 함' 을 고르면 나머지를 전부 끈다 */
            box.querySelectorAll(".opt").forEach(function (b) { b.classList.remove("is-on"); });
            btn.classList.add("is-on");
          } else {
            box.querySelectorAll(".opt[data-excl]").forEach(function (b) { b.classList.remove("is-on"); });
            btn.classList.toggle("is-on");
          }
          var picked = [];
          box.querySelectorAll(".opt.is-on").forEach(function (b) { picked.push(b.dataset.v); });
          store(qid, picked);
        });
      });
    });

    /* 양극 선택 */
    stage.querySelectorAll('.opts--bw').forEach(function (box) {
      var qid = box.dataset.q, side = box.dataset.side;
      box.querySelectorAll(".opt").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var already = btn.classList.contains("is-on");
          box.querySelectorAll(".opt").forEach(function (b) { b.classList.remove("is-on"); });
          var cur = saved(qid) || {};
          if (already) { delete cur[side]; }
          else { btn.classList.add("is-on"); cur[side] = btn.dataset.v; }
          store(qid, cur);
        });
      });
    });

    /* 척도 */
    stage.querySelectorAll(".scale").forEach(function (box) {
      var qid = box.dataset.q;
      box.querySelectorAll(".scale__n").forEach(function (btn) {
        btn.addEventListener("click", function () {
          box.querySelectorAll(".scale__n").forEach(function (b) { b.classList.remove("is-on"); });
          btn.classList.add("is-on");
          var v = Number(btn.dataset.v);
          store(qid, v);
          showFollow(q, v);
        });
      });
    });

    /* 서술 */
    var ta = document.getElementById("ta");
    if (ta) {
      var n = document.getElementById("taN");
      var sync = function () { if (n) n.textContent = ta.value.length; };
      ta.addEventListener("input", sync); sync();
    }

    var nextBtn = document.getElementById("next");
    if (nextBtn) nextBtn.addEventListener("click", commit);

    var skipBtn = document.getElementById("skip");
    if (skipBtn) skipBtn.addEventListener("click", function () {
      T("q_skip", { id: q.id });
      next();
    });
  }

  function showFollow(q, v) {
    if (!q.followUp) return;
    var box = document.getElementById("follow");
    var t = document.getElementById("followT");
    if (!box || !t) return;
    var f = (v <= q.followUp.low.upTo) ? q.followUp.low : q.followUp.high;
    t.textContent = f.title;
    box.hidden = false;
    var prev = saved(q.id + "Note");
    var ta2 = document.getElementById("followTa");
    if (ta2 && prev) ta2.value = prev;
  }

  /* '다음' 을 누를 때 화면의 값을 저장한다 */
  function commit() {
    var q = STEPS[i].main;
    var ta = document.getElementById("ta");
    if (ta) store(q.id, ta.value.trim());
    var ta2 = document.getElementById("followTa");
    if (ta2 && !document.getElementById("follow").hidden) {
      store(q.id + "Note", ta2.value.trim());
    }
    next();
  }

  function next() {
    if (i < STEPS.length - 1) { i++; paint(); return; }
    done();
  }

  function done() {
    if (PHASE === "B") {
      T("phaseB_complete");
      App.Nav.go("report.html");
    } else {
      T("diagnosis_answers_complete");
      App.Nav.go("birth.html");
    }
  }

  document.getElementById("back").addEventListener("click", function () {
    if (i > 0) { i--; paint(); return; }
    location.href = (PHASE === "B") ? "result.html" : "index.html";
  });

  paint();
})();
