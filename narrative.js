/* =========================================================
   서술 — 판정 결과를 읽히는 글로 바꾼다
   ---------------------------------------------------------
   여기서 사주를 계산하지 않는다. 계산은 이미 끝났다.
   이 모듈이 하는 일은 두 가지뿐이다.

     1) LLM 에게 넘길 프롬프트를 만든다 (근거 슬롯을 강제 주입)
     2) LLM 을 못 쓸 때(미동의·키 없음·실패) 쓸 규칙 기반 문장을 만든다

   설계 원칙:
   - 모든 단정에는 명식 근거가 붙어야 한다. 근거 없는 단정은 바넘 문장이다.
   - 신뢰도 LOW 인 판정은 단정하지 않는다.
   - 미래는 확정하지 않는다. "~하는 흐름이 나타납니다".
   - 결론을 한쪽으로 몰지 않는다. 나가라/남아라 어느 쪽도 강요하지 않는다.
   ========================================================= */
(function (global) {
  "use strict";

  /* 받침 유무로 조사를 고른다. "직무적합이(가)" 같은 표기가 남아 있으면
     읽는 사람이 바로 기계 티를 느낀다. */
  function josa(w, withB, without) {
    var t = String(w || "");
    var c = t.charCodeAt(t.length - 1);
    if (isNaN(c) || c < 0xac00 || c > 0xd7a3) return without;
    return ((c - 0xac00) % 28) ? withB : without;
  }
  function iga(w) { return w + josa(w, "이", "가"); }
  function eun(w) { return w + josa(w, "은", "는"); }
  function eul(w) { return w + josa(w, "을", "를"); }

  /* ── 문장 고르기 ────────────────────────────────────
     같은 뜻을 여러 벌 써두고 사람마다 다른 것을 고른다.
     무작위로 하면 같은 사람이 새로고침할 때마다 글이 바뀌므로,
     답변에서 뽑은 지문(fingerprint)으로 고정한다.
     한 사람에게는 언제나 같은 문장이 나온다. */
  function fingerprint(ctx) {
    var src = JSON.stringify([
      ctx && ctx.answersLabel,
      ctx && ctx.analyze && ctx.analyze.pillars,
      ctx && ctx.report && ctx.report.scores
    ]);
    var h = 5381, i;
    for (i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) & 0x7fffffff;
    return h;
  }

  /* seed 를 조금씩 밀어 같은 리포트 안에서도 자리마다 다른 선택이 나오게 한다 */
  function makePicker(seed) {
    var n = 0;
    return function (variants) {
      if (!variants || !variants.length) return "";
      n++;
      return variants[(seed + n * 2654435761) % variants.length];
    };
  }

  /* 챕터 정의 — 순서·제목·목표 분량·집필 지침 */
  var CHAPTERS = [
    { no: 1,  id: "why",     title: "나는 왜 지금 흔들리고 있을까?",
      chars: 750, paras: 4,
      guide: "지금 흔들리는 이유를 명식 구조와 본인이 답한 상황을 겹쳐서 설명한다. " +
             "여기서 신뢰가 결정되므로 가장 구체적으로 쓴다. 본인이 쓴 고민 문장이 있으면 반드시 인용해 연결한다." },
    { no: 2,  id: "env",     title: "나는 어떤 환경에서 오래 일하는 사람인가?",
      chars: 450, paras: 3,
      guide: "격국과 용신이 가리키는 환경을 쓴다. 직무 이름이 아니라 조직의 성질로 쓴다. 8장과 겹치지 않게 '성향' 쪽에 무게를 둔다." },
    { no: 3,  id: "hard",    title: "지금 회사에서 힘든 진짜 이유",
      chars: 650, paras: 4,
      guide: "본인이 지목한 이유와 명식이 가리키는 이유가 같은지 다른지를 밝힌다. 다르면 그 차이가 핵심이다." },
    { no: 4,  id: "which",   title: "회사가 안 맞는 걸까, 직무가 안 맞는 걸까?",
      chars: 500, paras: 3,
      guide: "환경 문제인지 일 자체 문제인지를 가른다. 근거를 들어 한쪽으로 판정하되, 반대 가능성도 한 줄 남긴다." },
    { no: 5,  id: "repeat",  title: "퇴사해도 반복될 수 있는 내 패턴",
      chars: 800, paras: 4,
      guide: "가장 가치가 높은 장이다. 회사를 옮겨도 따라올 것을 구체적으로 쓴다. " +
             "비난이 아니라 '이 자리에서 반복해서 부딪힌다'는 관찰로 쓴다. 불편하되 상처가 되지 않게." },
    { no: 6,  id: "flow",    title: "앞으로 12개월 직장 흐름",
      chars: 500, paras: 3,
      guide: "월별 점수 곡선을 말로 풀어준다. 높고 낮은 구간이 각각 무슨 뜻인지. 숫자를 나열하지 말 것." },
    { no: 7,  id: "windows", title: "변화가 강해지는 구간",
      chars: 550, paras: 3,
      guide: "시기를 말하되 확정하지 않는다. '그때 반드시'가 아니라 '그 구간에 흐름이 달라진다'. " +
             "시점이 결과를 정하지 않는다는 것을 분명히 한다." },
    { no: 8,  id: "next",    title: "다음 직장에서 찾아야 하는 환경",
      chars: 430, paras: 3,
      guide: "체크리스트처럼 실용적으로. 2장과 달리 '고를 때 볼 것' 쪽에 무게를 둔다." },
    { no: 9,  id: "path",    title: "직장 · 프리랜서 · 사업 적합 성향",
      chars: 400, paras: 3,
      guide: "세 갈래를 비교한다. 하나를 강권하지 않는다. 각각에서 이 사람이 어떤 모습일지." },
    { no: 10, id: "first",   title: "그래서 지금 무엇부터 정리해야 할까?",
      chars: 620, paras: 4,
      guide: "오늘 할 수 있는 구체적 행동 하나로 끝낸다. 퇴사하라/말라를 말하지 않는다. " +
             "결정을 대신하지 않되, 다음 한 걸음은 분명히 준다." }
  ];

  var SYSTEM = [
    "당신은 직장인 대상 사주 리포트를 쓰는 작가입니다.",
    "사주 계산과 명리 판정은 이미 끝나 '판정 결과'로 주어집니다. 당신의 역할은 계산이 아니라 서술입니다.",
    "",
    "■ 반드시 지킬 것",
    "1. 주어진 판정 결과에 없는 사실을 만들지 마세요. 새로 계산하거나 추정하지 마세요.",
    "2. 단정하는 문장에는 반드시 명식 근거를 함께 두세요. 근거 없는 단정은 누구에게나 맞는 빈 말이 됩니다.",
    "   근거는 괄호나 짧은 구절로 자연스럽게 녹이세요. 예: \"관성이 네 자리인데 받아줄 인성이 하나뿐입니다. 그래서 ~\"",
    "3. 신뢰도가 LOW 로 표시된 판정은 단정하지 마세요. \"~로 보이지만 해석이 갈리는 자리입니다\" 식으로 여지를 남기세요.",
    "4. 미래를 확정하지 마세요. \"~할 것입니다\"가 아니라 \"~하는 흐름이 나타납니다\".",
    "5. 퇴사하라 / 하지 마라를 말하지 마세요. 판단 재료를 주되 결정은 본인 몫입니다.",
    "6. 건강·금융·법률 판단을 하지 마세요. 이혼·질병·사고를 예언하지 마세요.",
    "7. 사용자가 실제로 답한 내용(근속, 준비 상태, 본인이 쓴 고민)을 문장에 녹이세요.",
    "   같은 사주라도 상황이 다르면 글이 달라야 합니다.",
    "8. 명리 용어는 쓰되 처음 나올 때 괄호로 짧게 풀어주세요. 예: 관성(조직·책임을 뜻하는 기운)",
    "",
    "■ 쓰지 말 것",
    "- \"당신은 때로 ~하고 때로 ~합니다\" 류의 양쪽에 걸치는 문장",
    "- \"반드시\", \"100%\", \"적중\", \"틀림없이\"",
    "- \"~하는 경향이 있습니다\"의 남발 (구체적 상황으로 바꾸세요)",
    "- 위로만 하고 끝나는 문단",
    "- 이모지, 느낌표 남발, 과장된 수사",
    "",
    "■ 문체",
    "존댓말. 담백하고 단정한 문장. 한 문단은 3~5문장.",
    "점집 말투가 아니라, 잘 아는 사람이 차분히 설명해주는 톤.",
    "",
    "출력은 JSON 객체 하나만. 설명이나 코드펜스 없이."
  ].join("\n");

  /* 판정 결과를 프롬프트에 넣을 텍스트로 */
  function factsBlock(read, analyze) {
    var L = [];
    var a = analyze;

    L.push("## 명식");
    L.push("사주팔자: " + a.pillars.년간 + a.pillars.년지 + " " + a.pillars.월간 + a.pillars.월지 +
           " " + a.pillars.일간 + a.pillars.일지 + " " + a.pillars.시간 + a.pillars.시지);
    L.push("일간: " + a.ilgan + " / " + a.strength.label + " (신강도 " + a.strength.S + "점, 신뢰도 " +
           a.strength.confidence + ")");
    L.push("득령 " + (a.strength.deukRyeong ? "O" : "X") + " · 득지 " + (a.strength.deukJi ? "O" : "X") +
           " · 득세 " + (a.strength.deukSe ? "O" : "X"));
    if (a.saryeong) {
      L.push("월령 사령: " + a.saryeong.gan + "(" + a.saryeong.layer + ")" +
             (a.saryeong.days ? " — 절입 후 " + a.saryeong.days + "일" : ""));
    }
    if (a.hourKnown === false) {
      L.push("※ 태어난 시간을 모르는 분입니다. 시주(時柱)는 근거로 쓰지 마세요.");
      L.push("   시간을 알면 더 정밀해진다는 점을 1장이나 10장에서 한 번만 짧게 언급하세요.");
    }
    L.push("십성 세력: " + JSON.stringify(a.score.group));
    L.push("격국: " + a.gyukguk.display + " (" + a.gyukguk.grade + " " + a.gyukguk.score + "점, 신뢰도 " +
           a.gyukguk.confidence + ")" +
           (a.gyukguk.flaws.length ? " / 흠: " + a.gyukguk.flaws.join("·") : ""));
    L.push("용신: " + a.yongsin.용신군 + "(" + a.yongsin.용신오행 + ") · 희신 " + a.yongsin.희신군 +
           " · 기신 " + a.yongsin.기신군 + " [" + a.yongsin.method + "]");
    L.push("십이운성: 월 " + a.unseong.월지 + " / 일 " + a.unseong.일지 +
           (a.unseong.대운지 ? " / 대운 " + a.unseong.대운지 : "") + " — 국면 " + a.unseong.tag);
    if (a.relations.list.length) {
      L.push("형충회합: " + a.relations.list.slice(0, 4).map(function (r) {
        return r.ji.join("") + " " + r.type + (r.complete ? "(운에서 완성)" : "");
      }).join(", ") + (a.relations.note ? " — " + a.relations.note : ""));
    }
    if (a.sinsal.top.length) {
      L.push("신살: " + a.sinsal.top.map(function (s) {
        return s.name + "(" + s.slot + ")";
      }).join(", "));
    }

    L.push("");
    L.push("## 읽어낸 것 — 이 근거들만 사용하세요");
    read.readings.forEach(function (r, i) {
      L.push((i + 1) + ") [" + r.strength + "] " + r.claim);
      L.push("   설명: " + r.detail);
      L.push("   근거: " + r.evidence + (r.confidence === "LOW" ? "  ※신뢰도 LOW — 단정 금지" : ""));
    });
    return L.join("\n");
  }

  function chapterBlock(read) {
    var L = ["## 챕터별로 쓸 재료"];
    CHAPTERS.forEach(function (c) {
      var rs = (read.byChapter[c.id] || []);
      L.push("");
      L.push("### " + c.no + ". " + c.title);
      L.push("목표 분량 " + c.chars + "자 내외, " + c.paras + "문단");
      L.push("지침: " + c.guide);
      if (rs.length) {
        L.push("재료:");
        rs.forEach(function (r) { L.push("  - " + r.claim + "  [근거: " + r.evidence + "]"); });
      } else {
        L.push("재료: 이 챕터에 직접 배정된 판정이 없습니다. 위 '읽어낸 것' 중 관련된 것을 골라 쓰세요.");
      }
    });
    return L.join("\n");
  }

  function answersBlock(answersLabel, report) {
    var a = answersLabel || {};
    var L = ["## 이 사람이 실제로 답한 것"];

    /* 예전에는 quitReason / nextPlan / mainQuestion 세 키를 찍었는데
       bridge.labels() 는 그런 키를 만들지 않는다. 질문지에 그런 문항이 없다.
       그래서 프롬프트에 늘 "가장 큰 이유: -" 가 실렸고,
       정작 실제로 받아둔 답변 열 몇 개는 한 줄도 안 실렸다.
       없는 키는 지우고, 값이 있는 것만 싣는다.
       빈 항목을 "-" 로 채우지 않는 이유는, 그걸 본 모델이
       "답하지 않으셨습니다" 같은 없는 사실을 쓰기 때문이다. */
    var FIELDS = [
      ["quitFrequency", "퇴사 생각 빈도"],
      ["tenure",        "현재 근속"],
      ["drainTop",      "가장 지치게 하는 것"],
      ["drainBottom",   "가장 상관없다고 놓은 것"],
      ["actions",       "실제로 한 행동"],
      ["preparation",   "준비 단계 요약"],
      ["lastAction",    "마지막으로 움직인 시점"],
      ["selfLabel",     "지금 상태를 스스로 표현한 말"],
      ["miracle",       "하나만 바뀐다면 바꾸고 싶은 것"],
      ["runway",        "버틸 수 있는 기간"],
      ["deadline",      "스스로 정한 기한"],
      ["pastQuit",      "이전 퇴사 사유"],
      ["endured",       "지난 1년 잘 버텼다고 꼽은 것"],
      ["constraint",    "발목을 잡는 조건"],
      ["exception",     "예외적으로 괜찮았던 때"],
      ["sceneWhen",     "그 장면이 있었던 시점"],
      ["depth",         "원하는 이야기의 수위"],
      ["regretStay",    "남을 때의 후회 예상"],
      ["regretLeave",   "나갈 때의 후회 예상"],
      ["importance",    "이 결정의 중요도"],
      ["confidence",    "지금 판단에 대한 확신"]
    ];
    FIELDS.forEach(function (f) {
      if (a[f[0]]) L.push(f[1] + ": " + a[f[0]]);
    });
    if (a.freeText) L.push("본인이 쓴 고민: \"" + a.freeText + "\"");
    if (report && report.scores) {
      L.push("");
      L.push("진단 점수 — 직장 압박도 " + report.scores.careerPressure +
             " / 사주상 변화 흐름 " + report.scores.changeFlow +
             " / 전환 준비도 " + report.scores.preparation);
    }
    if (report && report.changeWindows && report.changeWindows.length) {
      L.push("");
      L.push("## 변화가 강해지는 구간 (계산 완료 — 그대로 사용)");
      report.changeWindows.forEach(function (w) {
        L.push("- " + w.label + " (" + w.ganji + ", " + w.sipsung + "): " + w.note);
      });
    }
    if (report && report.monthlyFlow && report.monthlyFlow.length) {
      L.push("");
      L.push("## 12개월 흐름 점수 (계산 완료)");
      L.push(report.monthlyFlow.map(function (m) {
        return (m.label || m.month) + " " + m.score;
      }).join(" / "));
    }
    return L.join("\n");
  }

  /* 답변에서 찾아낸 긴장 — 개인화의 실제 근거다.
     사주보다 이쪽이 훨씬 강하므로 프롬프트에서도 먼저 놓는다. */
  function tensionBlock(t) {
    if (!t) return "";
    var L = ["## 이 사람의 답변에서 찾아낸 것 — 리포트의 중심은 여기입니다"];
    if (t.mode === "safety") {
      L.push("※ 안전 분기입니다. 나갈지 남을지 판정하지 마세요.");
      L.push("   회복이 먼저라는 것만 전하고, 결정을 재촉하는 문장을 쓰지 마세요.");
    }
    if (t.noPush) {
      L.push("※ 지금 실행이 물리적으로 어려운 분입니다. 행동을 촉구하지 마세요. 시간표만 제시하세요.");
    }
    (t.picked || []).forEach(function (x, i) {
      L.push("");
      L.push((i + 1) + ") [" + x.grade + "] " + x.claim);
      L.push("   근거: " + x.body);
      if (x.cushion) L.push("   완충(반드시 함께 쓰세요): " + x.cushion);
    });
    if (t.echo) {
      L.push("");
      L.push("※ 이 분은 답변끼리 어긋나는 지점이 거의 없습니다.");
      L.push("   새로운 통찰을 지어내지 마세요. 대신 아래를 되짚어 정리해주세요:");
      (t.echo.lines || []).forEach(function (x) { L.push("   · " + x); });
      L.push("   그리고 이렇게 말해주세요: " + t.echo.note);
    }
    L.push("");
    L.push("[이 블록을 다루는 규칙]");
    L.push("- 위 문장들이 리포트의 중심입니다. 사주보다 먼저, 더 크게 다루세요.");
    L.push("- 판단하지 말고 관찰만 하세요. \"당신은 ~다\"가 아니라 \"답변 두 개가 이렇게 붙는다\".");
    L.push("- 비꼬는 뉘앙스가 조금이라도 들어가면 안 됩니다. 완충 문장을 빠뜨리지 마세요.");
    L.push("- 사용자가 답한 것에서 딱 한 걸음만 나가세요. 이유를 대신 단정하지 마세요.");
    return L.join("\n");
  }

  function buildPrompt(ctx) {
    var name = ctx.name || "고객";
    return [
      "아래는 한 직장인의 답변 분석과 사주 판정 결과입니다.",
      "",
      tensionBlock(ctx.tension),
      "",
      factsBlock(ctx.read, ctx.analyze),
      "",
      answersBlock(ctx.answersLabel, ctx.report),
      "",
      chapterBlock(ctx.read),
      "",
      "## 출력 형식",
      "아래 JSON 스키마에 맞춰 10개 챕터를 모두 작성하세요.",
      "각 챕터의 body 는 문단 배열입니다. 한 문단은 3~5문장.",
      "lead 는 그 챕터를 한 줄로 요약하는 40~60자 문장입니다.",
      "",
      "호칭은 \"" + name + "님\"을 자연스럽게 섞어 쓰되, 매 문단마다 반복하지 마세요.",
      "",
      "{",
      "  \"headline\": \"이 사람의 상황을 한 문장으로 (40자 이내)\",",
      "  \"chapters\": [",
      "    { \"id\": \"why\", \"lead\": \"...\", \"body\": [\"문단1\", \"문단2\", ...] },",
      "    ... 10개 전부 (id 순서: why, env, hard, which, repeat, flow, windows, next, path, first)",
      "  ],",
      "  \"closing\": \"마무리 2문장. 결정을 대신하지 말 것\"",
      "}"
    ].join("\n");
  }

  /* ── 분할 생성 ──────────────────────────────────
     10챕터를 한 번에 쓰면 2분이 걸린다. 세 덩어리로 나눠 동시에
     돌리면 68초로 줄고 분량도 오히려 늘어난다(각자 자기 몫에 집중).
     실측: 124초/6,002자 → 68초/6,939자 */
  var GROUPS = [
    ["why", "env", "hard"],
    ["which", "repeat", "flow"],
    ["windows", "next", "path", "first"]
  ];

  function groupPrompt(ctx, ids, withMeta) {
    var L = [buildPrompt(ctx), "", "## 이번에 쓸 챕터"];
    L.push("위 목록 중 다음 " + ids.length + "개만 작성하세요: " + ids.join(", "));
    L.push("나머지 챕터는 출력하지 마세요.");
    if (withMeta) {
      L.push("headline 과 closing 도 함께 채워주세요. 이 둘은 리포트 전체를 감싸는 문장입니다.");
    } else {
      L.push("headline 과 closing 은 이번에는 비워두세요(빈 문자열).");
    }
    return L.join("\n");
  }

  function groupSchema(ids, withMeta) {
    var props = {
      chapters: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["id", "lead", "body"],
          properties: {
            id: { type: "string", enum: ids },
            lead: { type: "string" },
            body: { type: "array", items: { type: "string" } }
          }
        }
      }
    };
    var req = ["chapters"];
    if (withMeta) {
      props.headline = { type: "string" };
      props.closing = { type: "string" };
      req = ["headline", "chapters", "closing"];
    }
    return { type: "object", additionalProperties: false, required: req, properties: props };
  }

  /* 분할 결과를 하나로 합치고 챕터 순서를 원래대로 되돌린다 */
  function mergeGroups(parts) {
    var order = CHAPTERS.map(function (c) { return c.id; });
    var byId = {}, headline = "", closing = "";
    parts.forEach(function (p) {
      if (!p) return;
      if (p.headline) headline = p.headline;
      if (p.closing) closing = p.closing;
      (p.chapters || []).forEach(function (c) { byId[c.id] = c; });
    });
    return {
      headline: headline,
      chapters: order.map(function (id) { return byId[id]; }).filter(Boolean),
      closing: closing
    };
  }

  /* 출력 스키마 — 구조화 출력으로 형식을 강제한다 */
  function outputSchema() {
    return {
      type: "object",
      additionalProperties: false,
      required: ["headline", "chapters", "closing"],
      properties: {
        headline: { type: "string" },
        chapters: {
          /* minItems/maxItems 는 구조화 출력에서 0·1 외의 값을 못 쓴다.
             개수는 프롬프트로 지시하고 inspect() 가 실제로 검사한다. */
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "lead", "body"],
            properties: {
              id: { type: "string", enum: CHAPTERS.map(function (c) { return c.id; }) },
              lead: { type: "string" },
              body: { type: "array", items: { type: "string" } }
            }
          }
        },
        closing: { type: "string" }
      }
    };
  }

  /* =========================================================
     규칙 기반 폴백
     국외이전 미동의 · API 키 없음 · LLM 실패 시에도
     최소한의 개인화는 유지해야 한다.
     판정 결과를 그대로 문장으로 조립한다.
     ========================================================= */
  function ruleChapters(read, analyze, answersLabel, report, tension) {
    var A = answersLabel || {}, R = report || {};

    /* 같은 사람은 항상 같은 문장, 다른 사람은 다른 문장.
       고정 문구를 그대로 두면 모든 리포트에 100% 등장한다. */
    var pick = makePicker(fingerprint({
      answersLabel: answersLabel, analyze: analyze, report: report
    }));

    /* 근거 문자열 안에 이미 괄호가 들어 있는 경우가 있다.
       ("백호 (일지 진) 무진", "기신 관성(목)")
       그대로 괄호로 한 번 더 감싸면 "(백호 (일지 진) 무진)" 이 되어
       자료를 복사해 붙인 것처럼 읽힌다. 안쪽 괄호는 가운뎃점으로 편다. */
    function flatEv(t) {
      return String(t)
        .replace(/\s*\(([^()]*)\)/g, " $1")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    /* 근거를 괄호로 다는 건 한 리포트에 3번까지만.
       그 이상은 문장 뒤에 자료가 계속 따라붙는 모양이 되어
       읽는 글이 아니라 출력물처럼 보인다. */
    var evShown = 0;

    /* 판정이 경계에 걸렸을 때 붙이는 꼬리표.
       예전에는 한 문장을 그대로 반복해서 리포트당 여러 번 똑같이 나갔다.
       문단 앞으로 옮기고 여러 벌 중에 고른다. 리포트당 2번까지만.
       "저도 확신이 없습니다" 처럼 없던 화자를 만들거나
       "반쯤만 들으세요" 처럼 값을 깎는 표현은 쓰지 않는다. */
    var lowShown = 0;
    var LOW_SAY = [
      "이 판정은 경계에 걸렸습니다. 참고로만 두시면 됩니다.",
      "여기는 보는 사람에 따라 갈리는 자리입니다.",
      "이 항목은 딱 떨어지지 않습니다. 그대로 옮겨 적었습니다."
    ];

    /* 판정 하나를 한 문단으로 */
    function para(r, connective) {
      var head = /[다요]$/.test(r.claim) ? r.claim + "." : r.claim + "입니다.";
      var lead = "";
      if (r.confidence === "LOW" && lowShown < 2) { lead = pick(LOW_SAY) + " "; lowShown++; }
      var s = lead + (connective ? connective + " " : "") + head + " " + r.detail;
      if (r.evidence && evShown < 3) { s += " (" + flatEv(r.evidence) + ")"; evShown++; }
      return s;
    }

    /* 예전에는 접속어를 배열에 넣고 out.length 로 돌려썼다.
       그러면 모든 손님의 같은 장이 (없음)→그리고→여기에 더해→한편
       똑같은 순서로 열린다. 기계가 쓴 티가 가장 선명하게 나는 자리였다.
       한국어는 접속어 없이 시작해도 문단이 끊기지 않는다.
       그래서 기본값을 "없음" 으로 두고, 명식 지문으로 가끔만 고른다.
       연속으로는 절대 붙이지 않고, 한 장에 최대 2번까지만 쓴다. */
    var LINKS = ["그리고", "여기에 더해", "한편", "또 하나 눈에 띄는 것은"];
    var linkUsed = 0, linkPrev = false;
    function nextLink() {
      if (linkPrev || linkUsed >= 2) { linkPrev = false; return null; }
      if (pick([0, 0, 1]) !== 1) { linkPrev = false; return null; }
      linkUsed++; linkPrev = true;
      return pick(LINKS);
    }

    /* 판정 하나는 한 리포트 안에서 한 번만 쓴다.
       saju-read 는 같은 판정을 2~3개 챕터에 배정하는데,
       그대로 찍으면 같은 문단이 리포트에 세 번 나온다.

       배정 기준은 "먼저 오는 챕터가 가져간다"가 아니라
       판정 자신이 지정한 첫 챕터(= 가장 관련 깊은 곳)다. */
    var homeOf = {};
    read.readings.forEach(function (r) {
      var home = (r.chapters && r.chapters[0]) || null;
      if (home) homeOf[r.tag] = home;
    });

    function fill(id, targetChars) {
      var rs = (read.byChapter[id] || []).filter(function (r) {
        return homeOf[r.tag] === id;
      });
      var out = [], n = 0;
      for (var i = 0; i < rs.length; i++) {
        if (n >= targetChars && out.length >= 2) break;
        var t = para(rs[i], out.length ? nextLink() : null);
        out.push(t); n += t.length;
      }
      return out;
    }

    /* ---- 챕터별 전용 조립 ---- */
    var EXTRA = {};

    /* 답변에서 찾은 긴장을 문단으로. 사주보다 이게 먼저다. */
    function tensionParas(limit) {
      if (!tension) return [];
      var out = [];
      (tension.picked || []).slice(0, limit || 2).forEach(function (x) {
        var s = x.body;
        if (x.cushion) s += " " + x.cushion;
        out.push(s);
      });
      if (tension.echo && !out.length) {
        out.push(tension.echo.claim + ". " +
                 (tension.echo.lines || []).join(" / ") + ". " + tension.echo.note);
      }
      return out;
    }

    /* 1장 — 본인이 쓴 고민과 연결한다 */
    EXTRA.why = function () {
      var out = tensionParas(2);
      if (A.freeText) {
        out.push("직접 적어주신 고민은 이랬습니다. “" + A.freeText + "” " +
                 "이 문장이 지금 상태를 가장 정확하게 요약합니다. 아래 구조가 그 배경입니다.");
      }
      if (A.quitFrequency && A.preparation) {
        out.push(pick([
          "퇴사 생각은 " + A.quitFrequency + " 정도이고, 준비 상태는 " + A.preparation + "입니다. " +
          "이 두 가지의 간격이 지금 가장 크게 흔들리는 지점입니다. " +
          "마음은 이미 나가 있는데 몸은 아직 자리에 있는 상태가 오래 가면, " +
          "결정 자체보다 결정을 못 하는 상황이 더 지치게 만듭니다.",

          "답을 보면 생각은 " + A.quitFrequency + ", 실제 준비는 " + A.preparation + "입니다. " +
          "생각의 속도와 손의 속도가 다릅니다. 그 차이가 벌어져 있는 동안에는 " +
          "무엇을 해도 개운하지 않습니다.",

          "머리로는 " + A.quitFrequency + " 퇴사를 떠올리시는데, 손은 " + A.preparation +
          " 단계에 있습니다. 이 간격이 지금 피로의 큰 몫을 차지합니다. " +
          "떠나는 게 힘든 게 아니라, 떠나지도 남지도 않은 상태가 힘든 것입니다.",

          "생각은 " + A.quitFrequency + " 나는데 준비는 " + A.preparation + "에 머물러 있습니다. " +
          "이 어긋남 자체가 에너지를 씁니다. 결정을 내리는 것보다 " +
          "결정하지 않은 채로 버티는 쪽이 대개 더 비쌉니다."
        ]));
      }
      return out;
    };

    /* 4장 — 회사냐 직무냐. 점수로 가른다 */
    EXTRA.which = function () {
      var out = [], cs = R.causeSplit;
      if (cs) {
        var rows = Object.keys(cs).map(function (k) { return { label: k, value: cs[k] }; })
                         .sort(function (x, y) { return y.value - x.value; });
        if (rows.length) {
          /* 2점 차이에도 "차이가 분명합니다" 가 나가던 자리다.
             격차를 실제로 보고 말을 고른다. 붙어 있으면 붙어 있다고 쓴다. */
          var gapW = rows[0].value - rows[rows.length - 1].value;
          var rest = rows.slice(1).map(function (x) { return x.label + " " + x.value + "점"; }).join(", ");
          if (gapW < 5) {
            out.push("항목별로 나눠 보면 " + iga(rows[0].label) + " " + rows[0].value + "점, " +
                     rest + "입니다. 어느 쪽도 혼자 튀지 않습니다. " +
                     pick([
                       "원인이 하나로 좁혀지지 않는다는 뜻입니다.",
                       "한 곳만 손봐서는 체감이 잘 안 바뀌는 배치입니다.",
                       "특정 항목이 아니라 전체가 같이 무거워진 상태에 가깝습니다."
                     ]));
          } else {
            out.push("항목별로 나눠 보면 " + iga(rows[0].label) + " " + rows[0].value + "점으로 가장 높습니다. " +
                     rest + (gapW >= 15 ? "과 비교하면 차이가 분명합니다. " : "과는 조금 벌어져 있습니다. ") +
                     pick([
                       "지금 힘든 이유의 무게중심이 여기에 있다는 뜻입니다.",
                       "지금 소모의 대부분이 이 항목에서 나온다는 뜻입니다.",
                       "다른 곳을 손봐도 체감이 잘 안 달라지는 이유가 여기 있습니다.",
                       "우선순위를 하나만 꼽으면 이쪽이라는 뜻입니다."
                     ]));
          }
        }
      }
      var g = analyze.gyukguk;
      out.push(pick([
        "타고난 쪽에서 보면 " + g.display + " 구조입니다. 이 구조는 일 자체보다 " +
        "그 일이 놓인 판(조직의 성질, 평가 방식, 사람 배치)에 더 민감하게 반응합니다. " +
        "같은 직무라도 회사가 바뀌면 체감이 달라질 여지가 그만큼 있습니다.",

        g.display + " 구조는 직무 이름보다 그 일이 어디에 놓여 있느냐에 더 크게 흔들립니다. " +
        "그래서 같은 일을 해도 조직이 달라지면 다른 일처럼 느껴질 수 있습니다.",

        "명식 쪽은 " + g.display + "으로 잡힙니다. 이런 구조는 무슨 일을 하느냐보다 " +
        "누구와 어떤 기준으로 하느냐에서 만족이 갈립니다. 직무를 바꾸기 전에 " +
        "환경을 먼저 점검할 여지가 있다는 뜻입니다.",

        "구조로는 " + g.display + "입니다. 일의 종류보다 판의 성질에 반응하는 쪽이라, " +
        "회사만 바꿔도 체감이 크게 달라지는 경우가 있습니다."
      ]));
      /* 예전에는 A.quitReason 을 봤는데 그런 라벨이 만들어지지 않아
         이 문단이 한 번도 나가지 않았다. 실제로 고르신 항목을 쓴다. */
      if (A.drainTop) {
        out.push(pick([
          "가장 지치게 하는 것으로는 " + eul(A.drainTop) + " 고르셨습니다. " +
          "이게 위 판정과 같은 쪽을 가리키면 원인이 분명한 것이고, " +
          "다르면 겉으로 보이는 이유 아래에 하나가 더 있다는 신호입니다.",

          "직접 꼽으신 건 " + A.drainTop + "이었습니다. " +
          "명식이 가리키는 쪽과 겹치는지가 중요합니다. 겹치면 손댈 곳이 하나고, " +
          "어긋나면 지금 보이는 게 원인이 아닐 수 있습니다.",

          "본인이 지목한 것은 " + A.drainTop + "입니다. " +
          "위에서 본 구조와 같은 방향인지 한 번 대보시면 됩니다. " +
          "어긋난다면 그 간격 자체가 단서입니다."
        ]));
      }
      return out;
    };

    /* 6장 — 12개월 곡선을 말로 푼다 */
    EXTRA.flow = function () {
      var out = [], mf = R.monthlyFlow;
      if (mf && mf.length) {
        var sorted = mf.slice().sort(function (x, y) { return (y.score || 0) - (x.score || 0); });
        var hi = sorted.slice(0, 2), lo = sorted.slice(-2);
        out.push(pick([
          "앞으로 열두 달의 흐름은 고르지 않습니다. ",
          "다음 열두 달은 평평하지 않습니다. ",
          "앞으로 1년은 구간마다 온도가 다릅니다. ",
          "열두 달을 한 줄로 놓고 보면 높낮이가 뚜렷합니다. "
        ]) +
                 hi.map(function (m) { return m.label; }).join("과 ") +
                 " 무렵이 상대적으로 높게 나타나고, " +
                 lo.map(function (m) { return m.label; }).join("과 ") +
                 " 무렵이 낮게 나타납니다. " + pick([
                   "높다고 좋은 일만 있고 낮다고 나쁜 일만 있는 것은 아닙니다. " +
                   "높은 구간은 움직임이 커지는 때이고, 낮은 구간은 안으로 정리가 되는 때입니다.",
                   "높은 쪽이 좋고 낮은 쪽이 나쁘다는 뜻은 아닙니다. " +
                   "높으면 밖으로 움직이는 때고, 낮으면 안을 정리하는 때입니다.",
                   "이건 길흉이 아니라 방향입니다. 높은 달은 밖으로 나가는 힘이, " +
                   "낮은 달은 안으로 모으는 힘이 셉니다.",
                   "숫자가 높다고 잘 풀리는 건 아닙니다. 다만 그 무렵에 움직임이 커지고, " +
                   "낮은 무렵에는 정리가 붙습니다."
                 ]));
        out.push(pick([
          "높은 구간에는 결정과 실행이 빨라집니다. 다만 속도가 붙는 만큼 충분히 따져보지 않고 " +
          "움직일 위험도 함께 커집니다. 낮은 구간은 답답하게 느껴지지만, 이때 정리해둔 것이 " +
          "다음 높은 구간에서 쓰입니다.",
          "올라가는 구간에서는 일이 빨리 굴러갑니다. 대신 덜 따져보고 결정하기 쉽습니다. " +
          "내려가는 구간은 지루하지만, 거기서 쌓아둔 게 다음 올라갈 때 실력이 됩니다.",
          "높은 때는 추진력이 붙고, 낮은 때는 정리가 붙습니다. 문제는 높은 때의 성급함과 " +
          "낮은 때의 조급함인데, 둘 다 같은 실수를 만듭니다.",
          "흐름이 센 구간에는 결정이 빨라지고, 약한 구간에는 답답해집니다. " +
          "다만 약한 구간에 준비해둔 것이 센 구간의 결과를 정합니다."
        ]));
      }
      return out;
    };

    /* 9장 — 세 갈래 비교 */
    EXTRA.path = function () {
      var out = [], pf = R.pathFit;
      if (pf) {
        var rows = Object.keys(pf).map(function (k) { return { label: k, value: pf[k] }; })
                         .sort(function (x, y) { return y.value - x.value; });
        if (rows.length) {
          out.push("세 갈래를 점수로 비교하면 " +
                   rows.map(function (x) { return x.label + " " + x.value + "점"; }).join(", ") + "입니다. " +
                   iga(rows[0].label) + " 가장 높지만, 이것은 그쪽을 택하라는 뜻이 아니라 " +
                   "그 형태에서 타고난 기질이 가장 덜 억눌린다는 뜻입니다.");
        }
      }
      out.push(pick([
        "어느 쪽을 고르든 조건은 따라옵니다. 직장은 안정 대신 재량을 내주고, " +
        "프리랜서는 재량 대신 안정을 내줍니다. 사업은 둘 다 걸고 규모를 얻습니다. " +
        "지금 무엇이 가장 부족하게 느껴지는지가 사실상의 답에 가깝습니다.",

        "세 갈래 다 값을 치릅니다. 직장은 재량을, 프리랜서는 안정을 내놓아야 하고, " +
        "사업은 둘 다 건 뒤에 규모를 가져갑니다. 지금 가장 아쉬운 게 무엇인지가 " +
        "사실 답에 가깝습니다.",

        "공짜인 선택지는 없습니다. 안정을 가지면 재량이 줄고, 재량을 가지면 안정이 줄고, " +
        "둘 다 놓으면 규모가 열립니다. 무엇이 지금 제일 아쉬운지를 보세요.",

        "무엇을 고르든 대가는 있습니다. 문제는 어느 쪽이 좋으냐가 아니라 " +
        "지금 무엇이 가장 부족한가입니다. 그 답이 사실상 방향입니다."
      ]));
      return out;
    };

    /* 10장 — 오늘 할 수 있는 한 가지로 끝낸다 */
    EXTRA.first = function () {
      var out = [], y = analyze.yongsin;

      /* 결제 직전 마지막 문항이 "지난 1년 잘 버틴 것" 이었다.
         거기서 감정을 올려두고 결제 뒤에 그 답을 한 번도 안 쓰면
         "돈 내니까 딴소리한다" 로 읽힌다. 그대로 돌려드린다.
         해석을 덧붙이지 않고 본인이 고른 것을 인용만 한다. */
      if (A.endured) {
        out.push(pick([
          "지난 1년 스스로 잘 버텼다고 꼽으신 것은 " + A.endured + "이었습니다. " +
          "이 답을 고르신 분께 필요한 건 더 버티는 법이 아니라, " +
          "그게 기록으로 남는 자리를 찾는 쪽에 가깝습니다.",

          "마지막 문항에서 " + eul(A.endured) + " 고르셨습니다. " +
          "그건 아무도 안 세어준 항목입니다. 다음 자리를 고를 때 " +
          "그게 세어지는 곳인지를 기준 하나로 넣어두셔도 됩니다.",

          A.endured + ". 지난 1년 잘 버틴 것으로 이걸 꼽으셨습니다. " +
          "여기까지 온 힘이 어디서 나왔는지를 본인이 이미 알고 계신 셈입니다."
        ]));
      }

      /* 이전 퇴사가 소진 때문이었는데 지금도 준비가 비어 있으면,
         같은 조건이 다시 갖춰졌는지가 이 장의 질문이 된다.
         예언이 아니라 본인이 낸 답 두 개를 나란히 놓는 것뿐이다. */
      if (A.pastQuit && A.preparation &&
          /못 버텨서|버티다|소진/.test(A.pastQuit) &&
          /아무 준비도|생각만/.test(A.preparation)) {
        out.push("이전 퇴사는 " + A.pastQuit + " 쪽이었다고 하셨습니다. " +
                 "그리고 지금 준비 상태는 " + A.preparation + "입니다. " +
                 "같은 조건이 다시 갖춰져 있는지, 그것만 확인하고 넘어가시면 됩니다.");
      }
      var STEP = {
        "아무 준비도 하지 않았다": "이력서 파일을 하나 만들어 제목만 적어두는 것",
        "생각만 하고 있다": "지금 회사에서 배운 것 세 가지를 문장으로 적어보는 것",
        "가끔 채용공고만 본다": "저장해둔 공고 중 하나를 골라 지원 요건과 내 경력을 나란히 적어보는 것",
        "이력서·포트폴리오를 준비했다": "신뢰하는 사람 한 명에게 이력서를 보여주고 피드백을 받는 것",
        "이미 지원하고 있다": "지금까지의 결과를 표로 정리해 어디서 걸리는지 확인하는 것"
      };
      var step = STEP[A.preparation] || "오늘 할 수 있는 가장 작은 것 하나를 정해두는 것";
      /* 라벨을 따옴표로 인용하면 "…했다”이라면" 처럼 조사가 깨진다.
         라벨은 종결형 문장이라 조사를 붙일 자리가 아니다.
         그래서 인용 대신 서술문으로 받는다. */
      var PREP_SAY = {
        "아무 준비도 하지 않았다": "아직 손에 잡히는 준비는 없다고 하셨습니다",
        "생각만 하고 있다": "생각은 계속하시는데 아직 움직이지는 않으셨습니다",
        "가끔 채용공고만 본다": "가끔 공고를 들여다보는 정도까지 오셨습니다",
        "이력서·포트폴리오를 준비했다": "이력서와 포트폴리오까지는 만들어두셨습니다",
        "이미 지원하고 있다": "이미 지원까지 하고 계십니다"
      };
      var prepSay = PREP_SAY[A.preparation] || "지금 준비 상태를 기준으로 말씀드립니다";
      out.push(pick([
        prepSay + ". 그러면 다음 한 칸은 " + step + "입니다. " +
        "큰 결정을 내리는 것보다 이 한 칸을 채우는 쪽이 지금은 훨씬 도움이 됩니다.",

        prepSay + ". 바로 다음에 놓을 것은 " + step + "입니다. " +
        "결론을 먼저 내려고 하면 오히려 오래 걸립니다. 한 칸씩이 빠릅니다.",

        "다음 한 걸음만 말씀드리면 " + step + "입니다. " + prepSay + ". " +
        "그다음 칸이 바로 이것이고, 여기까지는 결정을 미룬 채로도 할 수 있습니다.",

        "오늘 할 수 있는 건 하나입니다. " + step + ". " +
        prepSay + ". 다음 칸으로 넘어가는 데 필요한 건 결심이 아니라 이 한 번입니다."
      ]));
      if (y && y.용신오행) {
        var hint = OH_HINT[y.용신오행] || "지금 부족한 쪽을 채우는 것";
        out.push(pick([
          "정리할 방향은 " + y.용신오행 + " 쪽입니다. 구체적으로는 " + hint + "입니다. " +
          "환경을 고를 때도 같은 기준을 쓰면 판단이 단순해집니다.",

          "방향을 하나로 줄이면 " + y.용신오행 + "입니다. " + hint + " 쪽으로 기울이시면 됩니다. " +
          "고를 게 많을 때 이 기준 하나만 대봐도 절반은 걸러집니다.",

          "무엇부터 손댈지 헷갈릴 때는 " + y.용신오행 + " 쪽을 먼저 보세요. " +
          hint + "이 지금 가장 값이 큽니다.",

          y.용신오행 + " 쪽이 지금 부족합니다. " + hint + "부터 채우시면 나머지가 따라옵니다. " +
          "다음 자리를 고를 때도 같은 눈으로 보시면 됩니다."
        ]));
      }
      if (analyze.hourKnown === false) {
        out.push("한 가지 덧붙이면, 태어난 시간을 모르는 상태로 본 결과입니다. " +
                 "네 기둥 중 세 기둥으로 읽었기 때문에 큰 흐름은 그대로지만 " +
                 "하루 단위의 세밀한 부분은 빠져 있습니다. 나중에 시간을 알게 되시면 " +
                 "다시 보시면 더 또렷해집니다.");
      }
      out.push(pick([
        "이 리포트는 결정을 대신하지 않습니다. 재정 상황, 채용 시장, 가족 사정처럼 " +
        "사주에 나오지 않는 것들이 실제로는 더 크게 작용합니다. 여기서 본 것은 그 판단에 얹는 한 겹입니다.",

        "마지막으로 하나만 분명히 해두겠습니다. 여기서 본 것은 참고 자료지 답이 아닙니다. " +
        "통장 잔고, 지금 채용 시장, 가족 상황 같은 것들이 실제 결정에서는 훨씬 무겁게 작용합니다.",

        "이 글이 결정을 대신할 수는 없습니다. 다만 머릿속에서만 굴리던 것을 " +
        "한 번 밖에 꺼내놓은 셈은 됩니다. 실제 판단에는 여기 없는 것들 — 돈, 시장, 가족 — 을 " +
        "반드시 함께 올려두세요.",

        "여기까지가 답변과 명식으로 말할 수 있는 전부입니다. 나머지는 숫자와 현실의 영역이고, " +
        "그쪽이 사실 더 큽니다. 이 리포트는 그 위에 얹는 한 겹으로만 써주세요."
      ]));
      return out;
    };

    /* 3장 — 압박 항목을 점수로 갈라 보여준다 */
    EXTRA.hard = function () {
      var out = [], pb = R.pressureBreakdown;

      /* 배제 진술 — 본인이 "가장 상관없다"고 직접 내려놓은 항목.
         맞으면 알아보고 틀리면 바로 틀린 게 드러나므로,
         아무한테나 맞는 말이 될 수 없다.
         Q5 하위 선택은 건너뛸 수 있으므로 값이 있을 때만 말한다.
         이 한 항목이 리포트 전체를 좌우한다는 식으로 부풀리지 않는다. */
      if (A.drainBottom) {
        out.push(pick([
          "먼저 하나는 분명히 아닙니다. " + eul(A.drainBottom) + " 가장 상관없는 쪽에 놓으셨습니다. " +
          "그쪽이 해결되는 방향으로 풀릴 고민이 아니라는 뜻이고, " +
          "이 리포트에서 그 이야기를 길게 하지 않는 이유이기도 합니다.",

          "빼고 시작하겠습니다. " + eun(A.drainBottom) + " 본인이 가장 덜 걸리는 쪽으로 고르셨습니다. " +
          "여기를 건드려도 지금 상태는 잘 안 바뀝니다. 아니라면 알려주세요.",

          eun(A.drainBottom) + " 지금 문제의 축이 아닙니다. 본인이 그렇게 놓으셨습니다. " +
          "그래서 아래 이야기는 그쪽을 빼고 갑니다."
        ]));
      }
      if (pb) {
        var rows = Object.keys(pb).map(function (k) { return { label: k, value: pb[k] }; })
                         .sort(function (x, y) { return y.value - x.value; });
        out.push("압박의 출처를 네 갈래로 나눠 보면 " +
                 rows.map(function (x) { return x.label + " " + x.value; }).join(", ") + "입니다. " +
                 iga(rows[0].label) + " 가장 무겁고 " + iga(rows[rows.length - 1].label) + " 가장 가볍습니다. " +
                 pick([
                   "힘들다는 감각은 하나로 뭉쳐 오지만, 실제로는 이렇게 나뉘어 있습니다.",
                   "지칠 때는 전부 한 덩어리로 느껴지지만, 뜯어보면 무게가 이렇게 다릅니다.",
                   "\"그냥 다 힘들다\"로 뭉쳐 있던 것을 네 갈래로 갈라 놓은 것입니다.",
                   "한 가지 감각처럼 느껴져도 안에서는 이렇게 비중이 갈립니다."
                 ]));
        if (rows[0].value - rows[rows.length - 1].value < 15) {
          out.push(pick([
            "네 항목의 차이가 크지 않습니다. 하나를 고쳐도 체감이 잘 안 바뀌는 배치라, " +
            "항목이 아니라 환경 자체를 놓고 보게 되는 경우입니다.",
            "무게가 한쪽으로 쏠려 있지 않습니다. 원인을 하나로 지목하기 어려운 상태고, " +
            "이럴 때는 부분 조정보다 자리 자체를 다시 보는 편이 빠릅니다.",
            "네 갈래가 비슷하게 무겁습니다. 특정 하나를 원인이라고 부르기 어렵습니다. " +
            "한 군데만 손봐서는 달라지는 게 적습니다.",
            "차이가 크지 않다는 건 여러 곳에서 조금씩 새고 있다는 뜻입니다. " +
            "한 항목을 고치는 것으로는 잘 메워지지 않습니다."
          ]));
        } else {
          out.push(pick([
            "차이가 뚜렷하면 손댈 지점도 분명해집니다. " + rows[0].label +
            " 하나가 풀리면 나머지 체감도 같이 내려갈 수 있습니다.",
            rows[0].label + " 쪽이 확실히 무겁습니다. 여기만 따로 떼어 조정할 여지가 있는지, " +
            "그만두기 전에 한 번은 확인해볼 만합니다.",
            "무게가 " + rows[0].label + "에 몰려 있습니다. 나머지는 그 뒤를 따라온 것일 수 있어서, " +
            "여기가 움직이면 전체가 같이 움직입니다.",
            "손댈 곳이 하나로 보인다는 건 나쁜 소식이 아닙니다. " + eul(rows[0].label) +
            " 두고 바꿀 수 있는 게 정말 없는지가 다음 질문입니다."
          ]));
        }
      }
      return out;
    };

    /* 5장 — 옮겨도 따라오는 것 */
    EXTRA.repeat = function () {
      var out = [], g = analyze.gyukguk, rel = analyze.relations;
      /* 반복 그룹에서 나온 긴장이 있으면 그게 사주보다 정확한 근거다 */
      if (tension) {
        (tension.picked || []).forEach(function (x) {
          if (x.group !== "repeat") return;
          out.push(x.body + (x.cushion ? " " + x.cushion : ""));
        });
      }
      if (g.flaws && g.flaws.length) {
        out.push("타고난 구조에서 반복적으로 걸리는 자리가 있습니다. " +
                 g.display + " 구조에 " + iga(g.flaws.join("·")) + " 겹쳐 있습니다. " +
                 "이것은 결함이 아니라, 같은 상황이 오면 같은 방식으로 반응하신다는 뜻입니다. " +
                 "회사를 옮겨도 비슷한 자리에서 비슷한 감정이 올라옵니다.");
      }
      if (rel && rel.note) {
        out.push("지금 붙잡는 힘과 밀어내는 힘의 관계는 " + rel.note + " 상태입니다. " +
                 "이동 쪽 " + rel.moveScore + ", 정체 쪽 " + rel.stayScore + "로 나타납니다. " +
                 "이 구도가 바뀌지 않으면 다음 직장에서도 같은 시점에 같은 고민이 돌아옵니다.");
      }
      if (A.tenure) {
        out.push(pick([
          "현재 근속이 " + A.tenure + "입니다. 이전 직장에서도 비슷한 시기에 같은 생각이 들었는지 " +
          "떠올려보세요. 만약 그렇다면 원인은 회사가 아니라 이 주기 자체에 있을 가능성이 큽니다.",

          "지금 " + A.tenure + " 차입니다. 예전에도 이쯤에서 같은 마음이 들었다면, " +
          "회사가 바뀐다고 이 시점이 사라지지는 않습니다.",

          A.tenure + "이라는 시점 자체를 한번 보세요. 이전에도 같은 구간에서 흔들렸다면 " +
          "그건 이 회사의 문제가 아니라 당신의 주기입니다.",

          "근속 " + A.tenure + " 지점입니다. 같은 자리에서 두 번째로 이 생각이 든 거라면 " +
          "옮기는 것만으로는 같은 지점이 또 옵니다."
        ]));
      }
      return out;
    };

    /* 8장 — 고를 때 볼 것 */
    EXTRA.next = function () {
      var out = [], y = analyze.yongsin;
      if (y && y.용신오행) {
        var CHECK = {
          목: ["새로 만드는 일이 계속 생기는가", "배우고 넓힐 여지가 있는가", "결정이 위에서만 내려오지 않는가"],
          화: ["내가 한 일이 드러나는 구조인가", "사람을 만나는 접점이 있는가", "평가가 결과로 확인되는가"],
          토: ["조직이 흔들리지 않고 버텨온 곳인가", "역할 경계가 분명한가", "쌓아온 것이 인정되는가"],
          금: ["기준과 원칙이 문서로 있는가", "선을 넘는 요구가 통하지 않는가", "품질을 지킬 시간이 주어지는가"],
          수: ["정보가 막히지 않고 도는가", "방식을 바꿀 재량이 있는가", "결정 전에 검토할 시간이 있는가"]
        };
        var list = CHECK[y.용신오행];
        if (list) {
          var checks = list.map(function (x, i) { return "(" + (i + 1) + ") " + x; }).join(" ");
          out.push(pick([
            "면접이나 제안을 받았을 때 확인할 것은 세 가지입니다. " + checks + ". " +
            "연봉과 직함보다 이 세 가지가 오래 다닐 수 있느냐를 더 크게 좌우합니다.",
            "다음 자리를 볼 때 이 세 개만 확인해보세요. " + checks + ". " +
            "조건표에는 안 나오지만 실제로 오래 다니느냐를 가르는 것들입니다.",
            "면접에서 물어볼 것을 셋으로 줄이면 이렇습니다. " + checks + ". " +
            "연봉은 협상이 되지만 이건 들어가 봐야 아는 것이라, 미리 물어야 합니다.",
            "제안을 받으면 이 세 가지를 확인하세요. " + checks + ". " +
            "직함보다 이쪽이 1년 뒤 만족을 더 크게 좌우합니다."
          ]));
        }
        out.push(pick([
          "반대로 " + y.기신오행 + " 성질이 강한 조직은 피하는 편이 낫습니다. " +
          "능력이 부족해서가 아니라 같은 일을 해도 더 많이 소모되기 때문입니다.",
          y.기신오행 + " 색이 짙은 조직은 걸러도 됩니다. 못 버텨서가 아니라 " +
          "같은 성과를 내는 데 힘이 더 들기 때문입니다.",
          "피할 것 하나를 꼽으면 " + y.기신오행 + " 성질이 강한 곳입니다. " +
          "일이 어려운 게 아니라 회복이 안 되는 쪽입니다.",
          "반대쪽은 " + y.기신오행 + "입니다. 그런 조직에서는 같은 일이 더 무겁게 느껴집니다. " +
          "조건이 좋아도 이 항목이 겹치면 오래 못 갑니다."
        ]));
      }
      return out;
    };

    /* 2장 — 성향 쪽에 무게 */
    EXTRA.env = function () {
      var out = [], st = analyze.strength;
      out.push("한 가지 기준을 덧붙이면, " +
               (st.borderline
                 ? "이 명식은 어느 한쪽으로 기울지 않은 편이라 환경이 성향을 만드는 폭이 큽니다. " +
                   "좋은 환경에서는 빠르게 자리 잡고, 맞지 않는 환경에서는 유난히 오래 헤맵니다."
                 : (["신약","극신약","중화신약"].indexOf(st.label) >= 0
                    ? "혼자 떠안는 구조에서 특히 빨리 소모됩니다. 사람이 아니라 시스템이 받쳐주는 곳이 맞습니다."
                    : "맡겨두면 알아서 하는 쪽이라 지시가 촘촘한 곳에서 답답해집니다.")) +
               " " + pick([
                 "이건 능력의 문제가 아니라 어디에 두느냐의 문제입니다.",
                 "잘하고 못하고가 아니라 놓이는 자리의 문제입니다.",
                 "실력이 아니라 배치의 문제에 가깝습니다.",
                 "부족해서가 아니라 결이 맞고 안 맞고의 차이입니다."
               ]));
      return out;
    };

    var OH_HINT = {
      목: "새로 배우거나 시작하는 쪽으로 한 발 내딛는 것",
      화: "혼자 쌓아둔 것을 밖으로 드러내 보이는 것",
      토: "벌여놓은 것을 줄이고 기반을 다지는 것",
      금: "기준을 정하고 그에 맞지 않는 것을 정리하는 것",
      수: "정보를 더 모으고 결정을 한 박자 늦추는 것"
    };

    var picked = {};
    CHAPTERS.forEach(function (c) { picked[c.id] = fill(c.id, c.chars); });

    /* 긴장 문장은 관련 장의 맨 앞에 놓고, 그 장의 한 줄 요약도 그것으로 바꾼다.
       사주에서 나온 요약을 남겨두면 제목과 본문이 서로 다른 얘기를 한다. */
    var leadOf = {};
    if (tension && tension.picked && tension.picked.length) {
      var TARGET = { readiness:"why", attribution:"which", repeat:"repeat",
                     regret:"windows", selfimage:"why", expectation:"first",
                     balance:"path", tone:"why", honesty:"repeat",
                     safety:"first", affirm:"first", quote:"why" };
      /* 한 장에 몰아넣으면 문단이 열 개가 넘고 같은 말이 두 번 나온다.
         장마다 긴장 문장은 최대 2개까지만, 그리고 이미 들어간 문단은 걸러낸다. */
      var perChapter = {};
      tension.picked.forEach(function (x) {
        var id = TARGET[x.group] || "why";
        perChapter[id] = (perChapter[id] || 0) + 1;
        if (perChapter[id] > 2) return;

        var t = x.body + (x.cushion ? " " + x.cushion : "");
        var base = (picked[id] || []).filter(function (p2) {
          /* 같은 근거로 만들어진 문단은 버린다 — 긴장 쪽이 더 구체적이다 */
          return p2.indexOf(x.body.slice(0, 24)) < 0;
        });
        picked[id] = [t].concat(base);
        if (!leadOf[id]) leadOf[id] = x.claim;
      });


    }

    var out = [];
    CHAPTERS.forEach(function (c) {
      var paras = picked[c.id];
      if (EXTRA[c.id]) {
        var add = EXTRA[c.id]() || [];
        /* 1장·4장은 도입이 먼저, 나머지는 뒤에 붙인다 */
        paras = (c.id === "why" || c.id === "which") ? add.concat(paras) : paras.concat(add);
      }

      if (c.id === "windows" && R.changeWindows) {
        R.changeWindows.forEach(function (w) {
          paras.push(w.label + " 전후가 흐름이 달라지는 구간으로 나타납니다. " + w.note + " " +
                     pick([
                       "다만 시점이 결과를 정하지는 않습니다. 그 구간에 무엇을 준비해두었느냐가 실제 차이를 만듭니다.",
                       "그때가 되면 저절로 풀린다는 뜻은 아닙니다. 그 무렵에 손에 쥔 게 있느냐가 결과를 가릅니다.",
                       "날짜가 결정을 대신해주지는 않습니다. 그 구간에 들어설 때 준비가 어디까지 되어 있느냐가 관건입니다.",
                       "이 시기 자체가 답은 아닙니다. 다만 같은 노력이 더 잘 먹히는 구간이라는 뜻은 됩니다."
                     ]));
        });
      }

      /* 같은 문단이 두 번 들어가는 것을 막는다.
         긴장 문장과 사주 읽기가 같은 근거를 쓰면 문장이 겹칠 수 있다.
         앞머리 30자로 판단한다 — 뒤가 조금 달라도 읽는 사람에겐 같은 말이다. */
      var seenPara = {};
      paras = paras.filter(function (t) {
        var key = String(t).replace(/\s+/g, "").slice(0, 30);
        if (seenPara[key]) return false;
        seenPara[key] = 1;
        return true;
      });

      /* 문단이 너무 많으면 읽다가 지친다. 앞쪽이 더 구체적이므로 뒤에서 자른다.
         (긴장 문장 → 본인 답변 → 사주 일반론 순으로 놓여 있다) */
      var maxParas = Math.max(3, c.paras + 1);
      if (paras.length > maxParas) paras = paras.slice(0, maxParas);

      if (!paras.length) {
        paras.push("이 항목은 명식에서 뚜렷하게 드러나는 신호가 적습니다. " +
                   "특징이 없다는 뜻이 아니라, 환경에 따라 달라지는 폭이 크다는 뜻입니다. " +
                   "그래서 어떤 조직에 있느냐가 남보다 더 크게 작용합니다.");
      }

      var rs = read.byChapter[c.id] || [];
      /* 한 줄 요약은 그 장의 첫 문단과 같은 것을 가리켜야 한다.
         긴장 문장이 앞에 오는 장이면 그것이 그 장의 주제다. */
      var lead = c.title;
      if (leadOf[c.id]) lead = leadOf[c.id];
      else if (rs.length) lead = rs[0].claim;
      out.push({ id: c.id, lead: lead, body: paras });
    });

    return {
      headline: read.readings.length ? read.readings[0].claim : "지금의 흐름을 정리해드립니다",
      chapters: out,
      closing: "이 결과는 결정을 대신하지 않습니다. 재정 상황과 채용 시장을 함께 놓고 판단해주세요."
    };
  }

  /* 생성물 자체 검사 — 규격을 못 지키면 알 수 있어야 한다 */
  function inspect(result) {
    var issues = [], totalChars = 0;
    var byId = {};
    (result.chapters || []).forEach(function (c) { byId[c.id] = c; });

    CHAPTERS.forEach(function (spec) {
      var c = byId[spec.id];
      if (!c) { issues.push(spec.id + " 챕터 누락"); return; }
      var n = (c.body || []).join("").length;
      totalChars += n;
      if (n < spec.chars * 0.5) issues.push(spec.id + " 분량 미달 (" + n + "/" + spec.chars + "자)");
      if (!c.lead) issues.push(spec.id + " lead 없음");
    });

    /* 금지 표현 검사.
       "반드시"·"확실히" 자체는 문제가 아니다. 조언("반드시 물어보세요")이나
       단정을 부정하는 문장("반드시 떠난다는 뜻이 아닙니다")에도 쓰인다.
       실제로 막아야 하는 것은 미래를 확정하는 용법뿐이다. */
    var HARD = ["100%", "적중", "틀림없이", "장담", "보장합니다",
                "이혼", "암에 걸", "사고가 납니다", "사망"];
    var all = JSON.stringify(result);
    HARD.forEach(function (w) {
      if (all.indexOf(w) >= 0) issues.push("금지 표현: " + w);
    });

    /* 미래 확정 용법만 골라낸다 */
    var PREDICT = /(반드시|확실히|무조건)\s*[^.!?]{0,24}?(합니다|됩니다|옵니다|납니다|집니다|입니다)/g;
    var NEGATE = /(아닙니다|않습니다|아니라|아니고|뜻이 아)/;
    (result.chapters || []).forEach(function (c) {
      (c.body || []).forEach(function (t) {
        var m;
        PREDICT.lastIndex = 0;
        while ((m = PREDICT.exec(t)) !== null) {
          var around = t.slice(m.index, m.index + m[0].length + 30);
          if (NEGATE.test(around)) continue;          // 단정을 부정하는 문장
          if (/(물어|확인|권|해보|정리|챙기|남기)/.test(m[0])) continue;  // 조언
          issues.push("미래 단정 의심: " + m[0].slice(0, 30));
        }
      });
    });

    return { ok: issues.length === 0, issues: issues, totalChars: totalChars };
  }

  global.Narrative = {
    CHAPTERS: CHAPTERS,
    tensionBlock: tensionBlock,
    GROUPS: GROUPS,
    groupPrompt: groupPrompt,
    groupSchema: groupSchema,
    mergeGroups: mergeGroups,
    SYSTEM: SYSTEM,
    buildPrompt: buildPrompt,
    outputSchema: outputSchema,
    ruleChapters: ruleChapters,
    inspect: inspect
  };
})(typeof window !== "undefined" ? window : global);
