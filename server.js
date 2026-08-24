/* =========================================================
   퇴사해말아? · 로컬 서버
   ---------------------------------------------------------
   - 정적 파일 서빙
   - SQLite 영속화 (기획안 §30 스키마)
   - LLM 서술 프록시 (API 키는 서버에만 존재)

   외부 의존성 없음. Node 22+ 내장 모듈만 사용합니다.

   실행:
     node server.js
     ANTHROPIC_API_KEY=sk-... node server.js   ← LLM 리포트까지
   ========================================================= */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

/* 사주 엔진 — 브라우저용으로 쓴 모듈들이라 global 에 붙는다.
   서버가 직접 계산해야 유료 본문이 클라이언트로 새지 않는다. */
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
require("./solar-terms.js");
require("./lunar-table.js");
require("./saju.js");
require("./diagnosis.js");
require("./saju-deep.js");
require("./saju-analyze.js");
require("./saju-read.js");
require("./questions.js");
require("./bridge.js");
require("./tension.js");
require("./narrative.js");
const Saju = globalThis.Saju;
const Diagnosis = globalThis.Diagnosis;
const SajuAnalyze = globalThis.SajuAnalyze;
const SajuRead = globalThis.SajuRead;
const Bridge = globalThis.Bridge;
const Tension = globalThis.Tension;
const Narrative = globalThis.Narrative;

const GAN_KO = ["갑","을","병","정","무","기","경","신","임","계"];
const JI_KO  = ["자","축","인","묘","진","사","오","미","신","유","술","해"];

/* 생년월일 → 심화 판정 + 통변 */
function deepRead(birth, now) {
  let solar = { year: birth.year, month: birth.month, day: birth.day };
  if (birth.calendar === "lunar" && globalThis.Lunar) {
    const conv = globalThis.Lunar.toSolar(birth.year, birth.month, birth.day, !!birth.isLeapMonth);
    if (conv) solar = conv;
  }
  const input = {
    year: solar.year, month: solar.month, day: solar.day,
    hour: birth.hourKnown ? birth.hour : 12, minute: birth.minute || 0,
    hourKnown: !!birth.hourKnown
  };
  const c = Saju.computeChart(input);
  /* 태어난 시간을 모르면 시주(時柱)가 없다.
     억지로 채우면 없는 근거로 해석하게 되므로, 시주 자리는
     일주를 대신 넣어 계산은 돌리되 hourKnown=false 를 함께 넘겨
     해석 단계에서 시주 근거를 쓰지 않도록 한다. */
  const hourPillar = c.pillars.hour || c.pillars.day;
  const p = {
    년간: GAN_KO[c.pillars.year.gan],  년지: JI_KO[c.pillars.year.ji],
    월간: GAN_KO[c.pillars.month.gan], 월지: JI_KO[c.pillars.month.ji],
    일간: GAN_KO[c.pillars.day.gan],   일지: JI_KO[c.pillars.day.ji],
    시간: GAN_KO[hourPillar.gan],      시지: JI_KO[hourPillar.ji]
  };
  /* daewoonAt(dw, age) 는 나이를 받는다. 예전에는 Date 를 넘겨서
     어떤 구간에도 안 걸렸고, 그래서 나이와 상관없이 항상 첫 대운(어린 시절)이
     선택됐다. 나이는 진단 화면과 같은 방식(한국식)으로 센다. */
  const _now = now || new Date();
  const _age = _now.getFullYear() - solar.year + 1;
  const dwAll = Saju.computeDaewoon ? Saju.computeDaewoon(c, birth.gender, 9) : null;
  const dw = (dwAll && dwAll.list && dwAll.list.length)
    ? Saju.daewoonAt(dwAll, _age)
    : null;
  const yr = Saju.computeYearly ? Saju.computeYearly(c, _now.getFullYear(), 1) : null;

  const analyze = SajuAnalyze.analyze({
    pillars: p, birth: input,
    hourKnown: !!birth.hourKnown,
    termIdx: c.termIdx, termYear: c.termYear,
    daeunJi: dw && dw.ji != null ? JI_KO[dw.ji] : null,
    seunJi: yr && yr[0] && yr[0].ji != null ? JI_KO[yr[0].ji] : null
  });
  return { chart: c, analyze, read: SajuRead.read(analyze) };
}

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "data", "app.db");

/* 결제 검증 게이트.
   기본값은 "검증 필요"(안전). 개발 중 결제 없이 리포트를 보려면
   PAYMENT_VERIFY=off 로 실행하세요. 운영에서는 절대 off 로 두지 마세요. */
const PAYMENT_VERIFY_REQUIRED = process.env.PAYMENT_VERIFY !== "off";

/* =========================================================
   DB
   ========================================================= */
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'started',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS birth_profiles (
  session_id     TEXT PRIMARY KEY REFERENCES reading_sessions(id) ON DELETE CASCADE,
  name           TEXT,
  calendar_type  TEXT NOT NULL,
  is_leap_month  INTEGER NOT NULL DEFAULT 0,
  birth_date     TEXT NOT NULL,
  birth_time     INTEGER,
  time_unknown   INTEGER NOT NULL DEFAULT 0,
  gender         TEXT NOT NULL,
  solar_date     TEXT
);

CREATE TABLE IF NOT EXISTS career_answers (
  session_id        TEXT PRIMARY KEY REFERENCES reading_sessions(id) ON DELETE CASCADE,
  quit_frequency    TEXT,
  quit_reason       TEXT,
  tenure            TEXT,
  next_plan         TEXT,
  preparation_level TEXT,
  main_question     TEXT,
  free_text         TEXT
);

CREATE TABLE IF NOT EXISTS saju_charts (
  session_id    TEXT PRIMARY KEY REFERENCES reading_sessions(id) ON DELETE CASCADE,
  year_pillar   TEXT, month_pillar TEXT, day_pillar TEXT, hour_pillar TEXT,
  ilgan         TEXT,
  strength      TEXT,
  elements_json TEXT,
  ten_gods_json TEXT,
  daewoon_json  TEXT,
  sewoon_json   TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  session_id            TEXT PRIMARY KEY REFERENCES reading_sessions(id) ON DELETE CASCADE,
  free_report_json      TEXT,
  paid_report_json      TEXT,
  narrative_json        TEXT,
  narrative_source      TEXT,
  result_type           TEXT,
  career_pressure_score INTEGER,
  change_flow_score     INTEGER,
  preparation_score     INTEGER,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  session_id  TEXT REFERENCES reading_sessions(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL,
  payment_key TEXT,
  created_at  TEXT NOT NULL,
  paid_at     TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT,
  name        TEXT NOT NULL,
  props_json  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
  session_id   TEXT PRIMARY KEY REFERENCES reading_sessions(id) ON DELETE CASCADE,
  required     INTEGER NOT NULL DEFAULT 0,
  ai_transfer  INTEGER NOT NULL DEFAULT 0,
  marketing    INTEGER NOT NULL DEFAULT 0,
  agreed_at    TEXT,
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_name    ON events(name);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
`);

/* =========================================================
   레이트리밋 (메모리 기반 토큰버킷)
   비용이 직결되는 /api/narrative 를 특히 좁게 제한한다.
   다중 인스턴스로 확장하면 Redis 등 공유 저장소로 옮겨야 합니다.
   ========================================================= */
const LIMITS = {
  "/api/narrative": { max: 5,   windowMs: 60_000 },   // LLM 비용 직결
  "/api/session":   { max: 30,  windowMs: 60_000 },
  "/api/order":     { max: 20,  windowMs: 60_000 },
  "/api/email":     { max: 10,  windowMs: 60_000 },
  _default:         { max: 120, windowMs: 60_000 }
};
const buckets = new Map();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function rateLimited(req, urlPath) {
  const rule = LIMITS[urlPath] || LIMITS._default;
  const key = clientIp(req) + "|" + urlPath;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + rule.windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return b.count > rule.max ? Math.ceil((b.reset - now) / 1000) : 0;
}

// 오래된 버킷 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 60_000).unref();

/* 모든 응답에 붙일 보안 헤더 */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
};

const nowISO = () => new Date().toISOString();
const newId = (p) => p + "_" + crypto.randomBytes(9).toString("base64url");

/* =========================================================
   HTTP 유틸
   ========================================================= */
function send(res, code, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(code, Object.assign({
    "Content-Type": type || "text/plain; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store"
  }, SECURITY_HEADERS));
  res.end(buf);
}
const json = (res, code, obj) =>
  send(res, code, JSON.stringify(obj), "application/json; charset=utf-8");

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
      catch (e) { reject(new Error("invalid json")); }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8"
};

/* =========================================================
   정적 파일
   ========================================================= */
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === "/" || rel === "") rel = "/index.html";

  // 경로 탈출 차단
  const abs = path.resolve(ROOT, "." + rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    return send(res, 403, "forbidden");
  }
  // 서버 전용 자산은 노출하지 않는다
  const base = path.basename(abs);
  if (base === "server.js" || abs.startsWith(path.join(ROOT, "data"))) {
    return send(res, 404, "not found");
  }
  // "_" / "." 로 시작하는 경로는 전부 비공개.
  // 백업본(_backup_*), 작업용 시드 페이지, tests/ 가 외부로 새는 것을 막는다.
  const relParts = path.relative(ROOT, abs).split(path.sep);
  for (const seg of relParts) {
    if (seg.startsWith("_") || seg.startsWith(".")) return send(res, 404, "not found");
  }
  if (relParts[0] === "tests") return send(res, 404, "not found");

  fs.readFile(abs, (err, buf) => {
    if (err) return send(res, 404, "not found");
    send(res, 200, buf, MIME[path.extname(abs).toLowerCase()] || "application/octet-stream");
  });
}

/* =========================================================
   API
   ========================================================= */
async function handleApi(req, res, urlPath) {
  /* ---- 진단 세션 저장 ---- */
  if (req.method === "POST" && urlPath === "/api/session") {
    const b = await readBody(req);
    const birth = b.birth || {};
    const answers = b.answers || {};
    const report = b.report || null;
    const sid = b.sessionId || newId("sesn");
    const t = nowISO();

    db.prepare(
      `INSERT INTO reading_sessions (id, status, created_at, updated_at)
       VALUES (?, 'diagnosed', ?, ?)
       ON CONFLICT(id) DO UPDATE SET status='diagnosed', updated_at=excluded.updated_at`
    ).run(sid, t, t);

    const pad = (n) => String(n).padStart(2, "0");
    const dstr = (o) => o && o.year ? `${o.year}-${pad(o.month)}-${pad(o.day)}` : null;

    db.prepare(
      `INSERT INTO birth_profiles
         (session_id,name,calendar_type,is_leap_month,birth_date,birth_time,time_unknown,gender,solar_date)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         name=excluded.name, calendar_type=excluded.calendar_type,
         is_leap_month=excluded.is_leap_month, birth_date=excluded.birth_date,
         birth_time=excluded.birth_time, time_unknown=excluded.time_unknown,
         gender=excluded.gender, solar_date=excluded.solar_date`
    ).run(
      sid, b.name || null, birth.calendar || "solar", birth.isLeapMonth ? 1 : 0,
      dstr(birth), birth.hourKnown ? birth.hour : null, birth.hourKnown ? 0 : 1,
      birth.gender || "", report ? dstr(report.solarBirth) : null
    );

    /* 동의 기록 — 광고성 정보 수신동의는 증빙 보관 의무가 있다.
       언제·어디서 받았는지 함께 남긴다. */
    const cs = b.consent || {};
    db.prepare(
      `INSERT INTO consents (session_id,required,ai_transfer,marketing,agreed_at,ip,user_agent)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         required=excluded.required, ai_transfer=excluded.ai_transfer,
         marketing=excluded.marketing, agreed_at=excluded.agreed_at,
         ip=excluded.ip, user_agent=excluded.user_agent`
    ).run(
      sid, cs.required ? 1 : 0, cs.aiTransfer ? 1 : 0, cs.marketing ? 1 : 0,
      cs.at || t, clientIp(req), String(req.headers["user-agent"] || "").slice(0, 300)
    );

    db.prepare(
      `INSERT INTO career_answers
         (session_id,quit_frequency,quit_reason,tenure,next_plan,preparation_level,main_question,free_text)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         quit_frequency=excluded.quit_frequency, quit_reason=excluded.quit_reason,
         tenure=excluded.tenure, next_plan=excluded.next_plan,
         preparation_level=excluded.preparation_level,
         main_question=excluded.main_question, free_text=excluded.free_text`
    ).run(
      sid, answers.quitFrequency || null, answers.quitReason || null,
      answers.tenure || null, answers.nextPlan || null,
      answers.preparation || null, answers.mainQuestion || null,
      answers.freeText || null
    );

    if (report) {
      const f = report.facts || {};
      const p = f.pillars || {};
      db.prepare(
        `INSERT INTO saju_charts
           (session_id,year_pillar,month_pillar,day_pillar,hour_pillar,ilgan,strength,
            elements_json,ten_gods_json,daewoon_json,sewoon_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(session_id) DO UPDATE SET
           year_pillar=excluded.year_pillar, month_pillar=excluded.month_pillar,
           day_pillar=excluded.day_pillar, hour_pillar=excluded.hour_pillar,
           ilgan=excluded.ilgan, strength=excluded.strength,
           elements_json=excluded.elements_json, ten_gods_json=excluded.ten_gods_json,
           daewoon_json=excluded.daewoon_json, sewoon_json=excluded.sewoon_json`
      ).run(
        sid, p.year || null, p.month || null, p.day || null, p.hour || null,
        f.ilgan || null, f.strength || null,
        JSON.stringify(f.elements || []), JSON.stringify(f.tenGods || {}),
        JSON.stringify(f.daewoon || {}), JSON.stringify(f.yearly || [])
      );

      db.prepare(
        `INSERT INTO reports
           (session_id,free_report_json,paid_report_json,result_type,
            career_pressure_score,change_flow_score,preparation_score,created_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(session_id) DO UPDATE SET
           free_report_json=excluded.free_report_json,
           paid_report_json=excluded.paid_report_json,
           result_type=excluded.result_type,
           career_pressure_score=excluded.career_pressure_score,
           change_flow_score=excluded.change_flow_score,
           preparation_score=excluded.preparation_score`
      ).run(
        sid,
        JSON.stringify(report.freeSections || []),
        JSON.stringify(report.paidSections || []),
        report.type ? report.type.key : null,
        report.scores ? report.scores.careerPressure : null,
        report.scores ? report.scores.changeFlow : null,
        report.scores ? report.scores.preparation : null,
        t
      );
    }
    return json(res, 200, { sessionId: sid });
  }

  /* ---- 이벤트 수집 (§49) ---- */
  if (req.method === "POST" && urlPath === "/api/events") {
    const b = await readBody(req);
    const list = Array.isArray(b.events) ? b.events.slice(0, 100) : [];
    const stmt = db.prepare(
      "INSERT INTO events (session_id,name,props_json,created_at) VALUES (?,?,?,?)"
    );
    for (const e of list) {
      if (!e || !e.name) continue;
      stmt.run(b.sessionId || null, String(e.name), JSON.stringify(e.props || {}), nowISO());
    }
    return json(res, 200, { ok: true, stored: list.length });
  }

  /* ---- 주문 (결제는 별도 연동 예정) ---- */
  if (req.method === "POST" && urlPath === "/api/order") {
    const b = await readBody(req);
    if (!b.sessionId) return json(res, 400, { error: "sessionId required" });
    const id = newId("ord");
    db.prepare(
      "INSERT INTO orders (id,session_id,amount,status,created_at) VALUES (?,?,?,?,?)"
    ).run(id, b.sessionId, Number(b.amount) || 9900, "pending", nowISO());
    return json(res, 200, { orderId: id, status: "pending" });
  }

  /* 결제 완료 처리
     ⚠️ 실서비스 필수: 아래 VERIFY 블록에 PG 서버 조회를 반드시 넣으세요.
        지금은 클라이언트 요청을 그대로 신뢰하므로, 이 상태로 배포하면
        누구나 결제 없이 유료 리포트를 열 수 있습니다. */
  if (req.method === "POST" && urlPath === "/api/order/confirm") {
    const b = await readBody(req);
    if (!b.orderId) return json(res, 400, { error: "orderId required" });

    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(b.orderId);
    if (!order) return json(res, 404, { error: "order not found" });
    if (order.status !== "pending") return json(res, 409, { error: "order not pending" });

    // ---- VERIFY: PG 서버에 결제 조회 후 금액·상태 대조 ----
    if (PAYMENT_VERIFY_REQUIRED) {
      // 예) const paid = await fetchPgPayment(b.paymentKey);
      //     if (!paid || paid.status !== "DONE" || paid.amount !== order.amount) {
      //       return json(res, 402, { error: "payment verification failed" });
      //     }
      return json(res, 501, {
        error: "payment verification not implemented",
        hint: "server.js 의 VERIFY 블록에 PG 조회를 구현하거나, 개발 중에는 PAYMENT_VERIFY=off 로 실행하세요."
      });
    }
    // -------------------------------------------------------

    db.prepare(
      "UPDATE orders SET status='paid', paid_at=?, payment_key=? WHERE id=? AND status='pending'"
    ).run(nowISO(), b.paymentKey || null, b.orderId);
    return json(res, 200, { ok: true });
  }

  /* ---- 이메일 저장 ---- */
  if (req.method === "POST" && urlPath === "/api/email") {
    const b = await readBody(req);
    const email = String(b.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: "invalid email" });
    }
    const uid = newId("user");
    db.prepare(
      "INSERT INTO users (id,email,created_at) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING"
    ).run(uid, email, nowISO());
    const row = db.prepare("SELECT id FROM users WHERE email=?").get(email);
    if (b.sessionId && row) {
      db.prepare("UPDATE reading_sessions SET user_id=?, updated_at=? WHERE id=?")
        .run(row.id, nowISO(), b.sessionId);
    }
    return json(res, 200, { ok: true });
  }

  /* ---- LLM 서술 생성 ---- */
  if (req.method === "POST" && urlPath === "/api/narrative") {
    const b = await readBody(req);
    if (!b.birth) return json(res, 400, { error: "birth required" });

    /* 사주 판정은 서버가 직접 한다. 클라이언트가 보낸 것을 믿지 않는다. */
    let deep;
    try {
      deep = deepRead(b.birth, new Date());
    } catch (e) {
      return json(res, 400, { error: "birth invalid: " + e.message });
    }

    /* 답변끼리 부딪혀 나온 것 — 리포트 개인화의 실제 근거.
       클라이언트가 보낸 판정을 믿지 않고 서버가 다시 계산한다. */
    let tension = null;
    if (b.answers) {
      try {
        tension = Tension.detect(
          Bridge.flatten({ answers: b.answers, answersB: b.answersB, tenure: b.tenure }),
          { tenureYears: Bridge.tenureYears(b.tenure) }
        );
      } catch (e) { tension = null; }
    }

    const ctx = {
      name: b.name || "고객",
      read: deep.read,
      analyze: deep.analyze,
      /* 클라이언트가 라벨을 안 보냈으면 서버가 직접 만든다.
         답변 원본만 있으면 언제든 복원할 수 있다. */
      answersLabel: b.answersLabel ||
        (b.answers && globalThis.Bridge
          ? globalThis.Bridge.labels({ answers: b.answers, answersB: b.answersB, tenure: b.tenure })
          : {}),
      report: b.report || null,
      tension: tension
    };

    /* 국외 이전에 동의하지 않은 이용자는 LLM 을 호출하지 않는다 */
    const out = b.noLLM
      ? { source: "rules", reason: "no_consent",
          result: Narrative.ruleChapters(ctx.read, ctx.analyze, ctx.answersLabel, ctx.report, ctx.tension) }
      : await buildNarrative(ctx);

    out.inspect = Narrative.inspect(out.result);

    if (b.sessionId) {
      db.prepare(
        `UPDATE reports SET narrative_json=?, narrative_source=? WHERE session_id=?`
      ).run(JSON.stringify(out.result), out.source, b.sessionId);
    }
    return json(res, 200, out);
  }

  /* ---- 운영 지표 (퍼널 §50) ---- */
  if (req.method === "GET" && urlPath === "/api/stats") {
    const funnel = [
      "landing_view", "diagnosis_start", "birth_input_complete",
      "analysis_completed", "free_result_view", "paywall_view",
      "checkout_start", "purchase_complete"
    ];
    const counts = {};
    for (const n of funnel) {
      counts[n] = db.prepare("SELECT COUNT(*) c FROM events WHERE name=?").get(n).c;
    }
    return json(res, 200, {
      funnel: counts,
      sessions: db.prepare("SELECT COUNT(*) c FROM reading_sessions").get().c,
      paidOrders: db.prepare("SELECT COUNT(*) c FROM orders WHERE status='paid'").get().c,
      types: db.prepare(
        "SELECT result_type t, COUNT(*) c FROM reports WHERE result_type IS NOT NULL GROUP BY result_type"
      ).all(),
      llm: { enabled: !!process.env.ANTHROPIC_API_KEY, model: MODEL }
    });
  }

  return json(res, 404, { error: "not found" });
}

/* =========================================================
   LLM 서술 (기획안 §26 3단계 · §32 제약)
   ---------------------------------------------------------
   사주 계산은 이미 끝난 상태다. 여기서는 계산된 사실(facts)과
   사용자의 실제 직장 상황을 받아 "읽히는 문장"으로만 바꾼다.
   ========================================================= */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

/* max_tokens 는 사고 과정과 응답 텍스트를 함께 제한한다.
   4000 으로 두면 사고가 예산을 먹고 JSON 이 중간에 잘려
   JSON.parse 가 터지고, 그 예외가 규칙 기반 폴백으로 조용히 삼켜진다.
   → 잘림을 명시적으로 잡아내고(callClaude), 예산은 넉넉히 준다.
   16000 초과가 필요해지면 스트리밍으로 전환해야 한다. */
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS) || 16000;
const EFFORT = process.env.ANTHROPIC_EFFORT || "high";

/* 프롬프트·스키마·폴백은 narrative.js 가 갖고 있다.
   여기서는 호출과 실패 처리만 한다. */

async function callClaude(prompt, schema) {
  const key = process.env.ANTHROPIC_API_KEY;
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: Narrative.SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema }
    }
  });

  const base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const res = await fetch(base + "/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body,
    signal: AbortSignal.timeout(180_000)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();

  // 안전 분류기가 거절한 경우 — content 를 읽기 전에 반드시 확인
  if (data.stop_reason === "refusal") {
    throw new Error("refusal: " + (data.stop_details ? data.stop_details.category : "unknown"));
  }
  // 응답이 잘렸는데 그대로 파싱하면 원인을 알 수 없는 실패가 된다
  if (data.stop_reason === "max_tokens") {
    throw new Error(
      "truncated: max_tokens(" + MAX_TOKENS + ") 안에서 끝나지 않았습니다. " +
      "ANTHROPIC_MAX_TOKENS 를 올리세요."
    );
  }

  const textBlock = (data.content || []).find((x) => x.type === "text");
  if (!textBlock) throw new Error("no text block in response");
  try {
    return JSON.parse(textBlock.text);
  } catch (e) {
    throw new Error("JSON 파싱 실패 (" + textBlock.text.length + "자): " + textBlock.text.slice(-120));
  }
}

/* LLM 이 없거나 실패해도 서비스는 계속 동작해야 한다 */
async function buildNarrative(ctx) {
  const fallback = (reason) => ({
    source: "rules", reason,
    result: Narrative.ruleChapters(ctx.read, ctx.analyze, ctx.answersLabel, ctx.report, ctx.tension)
  });

  if (!process.env.ANTHROPIC_API_KEY) return fallback("no_api_key");
  try {
    /* 10챕터를 한 번에 쓰면 2분이 걸린다. 세 덩어리로 나눠 동시에 돌리면
       실측 68초. 첫 덩어리가 headline·closing 도 함께 쓴다.

       예전에는 Promise.all 이라 세 덩어리 중 하나만 터져도 열 장 전부가
       규칙 기반(3,418자)으로 떨어졌다. LLM 본문은 6,939자다.
       돈을 낸 손님이 한 덩어리 실패 때문에 절반짜리를 받는 건 과하다.
       그래서 성공한 덩어리는 살리고, 빠진 장만 규칙으로 메운다. */
    const settled = await Promise.allSettled(
      Narrative.GROUPS.map((ids, i) =>
        callClaude(
          Narrative.groupPrompt(ctx, ids, i === 0),
          Narrative.groupSchema(ids, i === 0)
        )
      )
    );
    const parts = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
    const failed = settled
      .map((r, i) => (r.status === "rejected" ? i : -1))
      .filter((i) => i >= 0);
    if (failed.length) {
      console.error("[narrative] 덩어리 실패:", failed.join(","),
        settled.filter((r) => r.status === "rejected")
               .map((r) => String(r.reason && r.reason.message).slice(0, 120)).join(" | "));
    }

    const result = Narrative.mergeGroups(parts);
    if (!result.chapters.length) throw new Error("전 덩어리 실패");

    /* 빠진 장을 규칙 기반에서 가져와 자리에 끼운다.
       두 문체가 섞이지만, 장이 통째로 비는 것보다는 낫다.
       어느 장이 규칙 기반인지는 응답에 실어 로그로 남긴다. */
    let patched = [];
    if (result.chapters.length < Narrative.CHAPTERS.length) {
      const have = {};
      result.chapters.forEach((c) => { have[c.id] = c; });
      const rule = Narrative.ruleChapters(
        ctx.read, ctx.analyze, ctx.answersLabel, ctx.report, ctx.tension);
      const ruleById = {};
      (rule.chapters || []).forEach((c) => { ruleById[c.id] = c; });
      result.chapters = Narrative.CHAPTERS
        .map((c) => {
          if (have[c.id]) return have[c.id];
          if (ruleById[c.id]) { patched.push(c.id); return ruleById[c.id]; }
          return null;
        })
        .filter(Boolean);
      if (!result.headline) result.headline = rule.headline || "";
      if (!result.closing) result.closing = rule.closing || "";
    }

    return {
      source: patched.length ? "llm+rules" : "llm",
      model: MODEL, result,
      patched: patched.length ? patched : undefined
    };
  } catch (e) {
    console.error("[narrative] LLM 실패, 규칙 기반으로 대체:", e.message);
    return fallback(String(e.message).slice(0, 200));
  }
}

/* =========================================================
   서버
   ========================================================= */
const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];

  if (urlPath.startsWith("/api/")) {
    const retry = rateLimited(req, urlPath);
    if (retry) {
      res.setHeader("Retry-After", String(retry));
      return json(res, 429, { error: "too many requests", retryAfter: retry });
    }
    handleApi(req, res, urlPath).catch((e) => {
      console.error("[api]", urlPath, e.message);
      json(res, 500, { error: e.message });
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
  serveStatic(req, res, urlPath);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`퇴사해말아?  http://127.0.0.1:${PORT}`);
  console.log(`  DB   ${DB_PATH}`);
  console.log(`  LLM  ${process.env.ANTHROPIC_API_KEY
    ? "활성 (" + MODEL + ")"
    : "비활성 — ANTHROPIC_API_KEY 를 설정하면 AI 서술이 켜집니다 (지금은 규칙 기반)"}`);
});
