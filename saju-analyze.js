/* =========================================================
   사주 심화 판정 — saju-deep.js 의 표를 써서 명식을 읽어낸다
   ---------------------------------------------------------
   사령 → 점수화 → 신강신약 → 형충회합 → 십이운성 → 신살
        → 격국 → 용신 순서로 판정한다.

   유파가 갈리는 지점은 결론을 하나로 밀지 않고 confidence 를
   낮춰 내보낸다. 서술 단계에서 단정하지 않기 위해서다.
   ========================================================= */
(function (global) {
  "use strict";

  var D = global.SajuDeep;
  if (!D) throw new Error("saju-deep.js 가 먼저 로드되어야 합니다.");

  var GAN = D.GAN, JI = D.JI;
  var OH = ["목", "화", "토", "금", "수"];
  var GROUPS = ["비겁", "식상", "재성", "관성", "인성"];

  /* 자리 배점 — 합 110 (일간 포함) */
  var POS_SCORE = { 년간:10, 월간:10, 일간:10, 시간:10, 년지:10, 월지:30, 일지:15, 시지:15 };
  var SLOTS_GAN = ["년간", "월간", "일간", "시간"];
  var SLOTS_JI  = ["년지", "월지", "일지", "시지"];

  function emptyOh() { return { 목:0, 화:0, 토:0, 금:0, 수:0 }; }
  function emptyGroup() { return { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 }; }
  function sum(o) { var t = 0, k; for (k in o) t += o[k]; return t; }
  function maxKey(o) {
    var best = null, k;
    for (k in o) if (best === null || o[k] > o[best]) best = k;
    return best;
  }
  function minKey(o) {
    var best = null, k;
    for (k in o) if (best === null || o[k] < o[best]) best = k;
    return best;
  }
  function round1(x) { return Math.round(x * 10) / 10; }

  /* =========================================================
     1. 사령(司令) 판정
     절입일로부터 며칠 지났느냐로 월지 안의 어떤 기운이
     주도권을 쥐는지가 갈린다. 같은 달에 태어나도 여기서 나뉜다.
     ========================================================= */
  function saryeong(monthJi, birth, termIdx, termYear) {
    var ST = global.SolarTerms;
    var layers = D.JIJANGGAN[monthJi];
    if (!layers) return null;

    var fallback = layers[layers.length - 1];
    if (!ST || termIdx == null || termIdx < 0) {
      return { gan: fallback.g, layer: fallback.layer, days: null, scaled: null, exact: false };
    }

    var cur = ST.terms(termYear);
    if (!cur) return { gan: fallback.g, layer: fallback.layer, days: null, scaled: null, exact: false };

    var t0 = cur[termIdx];
    var t1 = termIdx < 11 ? cur[termIdx + 1] : (ST.terms(termYear + 1) || [null])[0];

    var d0 = new Date(termYear, t0.mo - 1, t0.d, t0.h, t0.mi);
    var born = new Date(birth.year, birth.month - 1, birth.day,
                        birth.hourKnown ? birth.hour : 12, birth.minute || 0);

    var elapsed = Math.floor((born - d0) / 86400000) + 1;  // 절입 당일 = 1일차
    if (elapsed < 1) elapsed = 1;

    var scaled = elapsed;
    if (t1) {
      var d1 = new Date(termIdx < 11 ? termYear : termYear + 1, t1.mo - 1, t1.d, t1.h, t1.mi);
      var len = (d1 - d0) / 86400000;
      if (len > 25 && len < 35) scaled = elapsed * 30 / len;
    }

    var cum = 0;
    for (var i = 0; i < layers.length; i++) {
      cum += layers[i].days;
      if (scaled <= cum) {
        return { gan: layers[i].g, layer: layers[i].layer,
                 days: elapsed, scaled: round1(scaled), exact: true };
      }
    }
    return { gan: fallback.g, layer: fallback.layer,
             days: elapsed, scaled: round1(scaled), exact: true };
  }

  /* =========================================================
     2. 점수화 — 오행·십성 세력
     ========================================================= */
  function scoreChart(p, ilgan, sary, opt) {
    opt = opt || {};
    var oh = emptyOh(), i, slot, g, j, layers, seg, w, k;
    var tuganPool = [p.년간, p.월간, p.시간];   // 일간 제외

    /* 천간 */
    for (i = 0; i < SLOTS_GAN.length; i++) {
      slot = SLOTS_GAN[i];
      g = p[slot];
      if (slot === "일간" && opt.excludeIlgan) continue;
      oh[D.GAN_OH[g]] += POS_SCORE[slot];
    }

    /* 지지 — 월지는 월률분야 전체, 나머지는 인원용사 축약 */
    for (i = 0; i < SLOTS_JI.length; i++) {
      slot = SLOTS_JI[i];
      j = p[slot];
      if (slot === "월지" || opt.hiddenMode === "monthlyFull") {
        layers = D.JIJANGGAN[j];
      } else {
        // 인원용사 축약형 — 원 층위와 일수를 복원해서 비율을 유지한다
        var allow = D.INWON[j];
        layers = D.JIJANGGAN[j].filter(function (s) { return allow.indexOf(s.g) >= 0; });
        var tot = layers.reduce(function (a, s) { return a + s.days; }, 0);
        layers = layers.map(function (s) {
          return { g: s.g, layer: s.layer, days: s.days * 30 / tot };
        });
      }
      for (k = 0; k < layers.length; k++) {
        seg = layers[k];
        w = seg.days / 30;
        if (slot === "월지" && sary && seg.layer === sary.layer) w *= 1.5;  // 사령 보정
        if (tuganPool.indexOf(seg.g) >= 0) w *= 1.3;                        // 투간 보정
        oh[D.GAN_OH[seg.g]] += POS_SCORE[slot] * w;
      }
    }

    /* 십성군 집계 */
    var grp = emptyGroup();
    for (i = 0; i < OH.length; i++) {
      var gg = D.ohToGroup(ilgan, OH[i]);
      if (gg) grp[gg] += oh[OH[i]];
    }

    /* 일간 통근 */
    var root = 0, rootDetail = [];
    for (i = 0; i < SLOTS_JI.length; i++) {
      slot = SLOTS_JI[i];
      j = p[slot];
      var segs = D.JIJANGGAN[j];
      for (k = 0; k < segs.length; k++) {
        if (D.GAN_OH[segs[k].g] === D.GAN_OH[ilgan]) {
          var v = (D.POS_W[slot] || 1) * D.LAYER_W[segs[k].layer];
          root += v;
          rootDetail.push({ slot: slot, ji: j, gan: segs[k].g, layer: segs[k].layer, w: round1(v) });
        }
      }
    }

    for (k in oh) oh[k] = round1(oh[k]);
    for (k in grp) grp[k] = round1(grp[k]);
    return { oh: oh, group: grp, root: round1(root), rootDetail: rootDetail };
  }

  /* =========================================================
     3. 신강신약
     ========================================================= */
  function strength(sc, p, ilgan, sary, damaged) {
    var total = sum(sc.group) || 1;
    var S = (sc.group["비겁"] + sc.group["인성"]) / total * 100;

    /* 득령 — 월지 사령간의 십성군 */
    var deukRyeong = false, ryeongBy = null;
    if (sary) {
      var g = D.SS_GROUP[D.sipsung(ilgan, sary.gan)];
      deukRyeong = (g === "비겁" || g === "인성");
      ryeongBy = sary.gan;
    }
    /* 사령을 안 보는 유파 대비 — 월지 정기 기준도 병기 */
    var mSegs = D.JIJANGGAN[p.월지];
    var mMain = mSegs[mSegs.length - 1].g;
    var deukRyeongMain = ["비겁", "인성"].indexOf(D.SS_GROUP[D.sipsung(ilgan, mMain)]) >= 0;

    /* 득지 — 일지 지장간 중 비겁/인성 */
    var deukJi = D.JIJANGGAN[p.일지].some(function (s) {
      return ["비겁", "인성"].indexOf(D.SS_GROUP[D.sipsung(ilgan, s.g)]) >= 0;
    });

    /* 득세 — 월지·일지 제외 나머지에서 비겁/인성 글자 수 */
    var cnt = 0;
    ["년간", "월간", "시간"].forEach(function (s) {
      if (["비겁", "인성"].indexOf(D.SS_GROUP[D.sipsung(ilgan, p[s])]) >= 0) cnt++;
    });
    ["년지", "시지"].forEach(function (s) {
      var main = D.JIJANGGAN[p[s]];
      var mg = main[main.length - 1].g;
      if (["비겁", "인성"].indexOf(D.SS_GROUP[D.sipsung(ilgan, mg)]) >= 0) cnt++;
    });
    var deukSe = cnt >= 2;

    var bias = Math.max.apply(null, OH.map(function (o) { return sc.oh[o]; })) / (sum(sc.oh) || 1);

    var label;
    if (S >= 80 && bias >= 0.55)        label = "극신강";
    else if (S < 25 && sc.root === 0)   label = "극신약";
    else if (S >= 60)                   label = "신강";
    else if (S >= 50)                   label = "중화신강";
    else if (S >= 40)                   label = "중화신약";
    else                                label = "신약";

    var conf = "MEDIUM";
    if (S >= 45 && S < 55) conf = "LOW";
    if (damaged) conf = "LOW";
    if (conf !== "LOW" && deukRyeong === deukJi && deukJi === deukSe) conf = "HIGH";

    return {
      S: round1(S), label: label, bias: round1(bias * 100),
      deukRyeong: deukRyeong, ryeongBy: ryeongBy, deukRyeongMain: deukRyeongMain,
      deukJi: deukJi, deukSe: deukSe, seCount: cnt,
      root: sc.root, confidence: conf,
      borderline: (S >= 45 && S < 55)
    };
  }

  /* =========================================================
     4. 형충회합
     ========================================================= */
  function pairKey(a, b) { return [a, b].sort().join(""); }

  function relations(p, daeunJi, seunJi) {
    var U = [
      { ji: p.년지, src: "원국", slot: "년지", idx: 0 },
      { ji: p.월지, src: "원국", slot: "월지", idx: 1 },
      { ji: p.일지, src: "원국", slot: "일지", idx: 2 },
      { ji: p.시지, src: "원국", slot: "시지", idx: 3 }
    ];
    if (daeunJi) U.push({ ji: daeunJi, src: "대운", slot: "대운지", idx: 4 });
    if (seunJi)  U.push({ ji: seunJi,  src: "세운", slot: "세운지", idx: 5 });

    var out = [], locked = {}, i, j, k;

    function posW(items) {
      return Math.max.apply(null, items.map(function (x) { return D.POS_W[x.slot] || 1; }));
    }
    function fromRun(items) {
      return items.some(function (x) { return x.src !== "원국"; }) &&
             items.some(function (x) { return x.src === "원국"; });
    }

    /* 3자 결합 */
    for (i = 0; i < U.length; i++)
      for (j = i + 1; j < U.length; j++)
        for (k = j + 1; k < U.length; k++) {
          var trio = [U[i], U[j], U[k]];
          var set = trio.map(function (x) { return x.ji; }).sort().join("");
          var complete = fromRun(trio);

          D.BANGHAP.forEach(function (bh) {
            if (bh.set.slice().sort().join("") === set) {
              out.push(mk("방합", trio, D.REL_BASE["방합"], posW(trio), complete,
                          { hwa: bh.hwa, 계절: bh.계절 }));
              trio.forEach(function (x) { locked[x.slot] = 1; });
            }
          });
          D.SAMHAP.forEach(function (sh) {
            if (sh.set.slice().sort().join("") === set) {
              out.push(mk("삼합", trio, D.REL_BASE["삼합"], posW(trio), complete, { hwa: sh.hwa }));
              trio.forEach(function (x) { locked[x.slot] = 1; });
            }
          });
          D.SAMHYEONG.forEach(function (hy) {
            if (hy.set.slice().sort().join("") === set) {
              out.push(mk("삼형", trio, D.REL_BASE["삼형"], posW(trio), complete,
                          { name: hy.name, mean: hy.mean }));
            }
          });
        }

    /* 2자 관계 */
    var seenSelf = {};
    for (i = 0; i < U.length; i++)
      for (j = i + 1; j < U.length; j++) {
        var a = U[i], b = U[j], pk = pairKey(a.ji, b.ji);
        var dist = Math.min(3, Math.abs(a.idx - b.idx)) || 1;
        var dw = D.DIST_W[dist] || 0.25;
        var pw = posW([a, b]);
        var lockedPair = locked[a.slot] || locked[b.slot];
        var comp = fromRun([a, b]);

        if (D.YUKHAP[a.ji] === b.ji && !lockedPair)
          out.push(mk("육합", [a, b], D.REL_BASE["육합"] * dw, pw, comp,
                      { hwa: D.YUKHAP_HWA[pk], kind: D.YUKHAP_KIND[pk] }));

        if (D.YUKCHUNG[a.ji] === b.ji && !lockedPair)
          out.push(mk("육충", [a, b], D.REL_BASE["육충"] * dw, pw, comp, {}));

        // 형은 거리 감쇠를 받지 않는다
        D.SANGHYEONG.forEach(function (s) {
          if (pairKey(s[0], s[1]) === pk)
            out.push(mk("상형", [a, b], D.REL_BASE["상형"], pw, comp, {}));
        });
        if (pk === pairKey(D.JAMYO[0], D.JAMYO[1]))
          out.push(mk("자묘형", [a, b], D.REL_BASE["자묘형"], pw, comp, {}));

        if (a.ji === b.ji && D.JAHYEONG.indexOf(a.ji) >= 0 && dist === 1 && !seenSelf[a.ji]) {
          seenSelf[a.ji] = 1;
          out.push(mk("자형", [a, b], D.REL_BASE["자형"], pw, comp, {}));
        }

        D.BANHAP.forEach(function (bh) {
          if (pairKey(bh.pair[0], bh.pair[1]) === pk && !lockedPair)
            out.push(mk(bh.king ? "반합" : "공합", [a, b],
                        D.REL_BASE[bh.king ? "반합" : "공합"] * dw, pw, comp, { hwa: bh.hwa }));
        });
        D.BANBANGHAP.forEach(function (bb) {
          if (pairKey(bb.pair[0], bb.pair[1]) === pk && !lockedPair)
            out.push(mk("반방합", [a, b], D.REL_BASE["반방합"] * dw, pw, comp, { hwa: bb.hwa }));
        });

        if (dist === 1) {
          if (D.YUKPA[a.ji] === b.ji)  out.push(mk("파", [a, b], D.REL_BASE["파"], pw, comp, {}));
          if (D.YUKHAE[a.ji] === b.ji) out.push(mk("해", [a, b], D.REL_BASE["해"], pw, comp, {}));
        }
      }

    /* 파·해는 같은 쌍에 충/형/합이 있으면 버린다 */
    var strongPairs = {};
    out.forEach(function (r) {
      if (["육충", "상형", "삼형", "자묘형", "육합", "삼합", "방합"].indexOf(r.type) >= 0)
        strongPairs[r.pairKey] = 1;
    });
    out = out.filter(function (r) {
      return !(["파", "해"].indexOf(r.type) >= 0 && strongPairs[r.pairKey]);
    });

    /* 탐합망충 / 충중봉합 */
    var hapByPair = {}, chungByPair = {};
    out.forEach(function (r) {
      if (r.type === "육합") hapByPair[r.pairKey] = r;
      if (r.type === "육충") chungByPair[r.pairKey] = r;
    });

    var totalHap = 0, totalChung = 0;
    out.forEach(function (r) {
      if (["육합", "삼합", "방합", "반합", "반방합"].indexOf(r.type) >= 0) totalHap += r.strength;
      if (r.type === "육충") totalChung += r.strength;
    });
    var note = null;
    if (totalHap > 0 && totalChung > 0) {
      if (totalHap >= totalChung * 1.2)      note = "탐합망충";
      else if (totalChung >= totalHap * 1.2) note = "충중봉합";
      else                                    note = "합충병존";
    }

    out.sort(function (x, y) { return y.strength - x.strength; });

    /* 이동/정체 점수 */
    var move = 0, stay = 0;
    out.forEach(function (r) {
      if (r.type === "육충") move += r.strength;
      else if (["삼형", "상형", "자묘형", "자형"].indexOf(r.type) >= 0) move += r.strength * 0.8;
      else if (["파", "해"].indexOf(r.type) >= 0) move += r.strength * 0.3;
      else if (["육합", "삼합", "방합", "반합", "반방합"].indexOf(r.type) >= 0) stay += r.strength;
    });

    return {
      list: out, note: note,
      moveScore: round1(move), stayScore: round1(stay),
      hasCompletion: out.some(function (r) { return r.complete; })
    };

    function mk(type, items, base, pw, complete, extra) {
      var s = base * pw * (complete ? 1.3 : 1);
      var o = {
        type: type,
        ji: items.map(function (x) { return x.ji; }),
        slots: items.map(function (x) { return x.slot; }),
        srcs: items.map(function (x) { return x.src; }),
        strength: round1(s),
        complete: !!complete,
        pairKey: items.length === 2 ? pairKey(items[0].ji, items[1].ji) : null
      };
      for (var q in extra) o[q] = extra[q];
      return o;
    }
  }

  /* =========================================================
     5. 십이운성
     ========================================================= */
  var UN_ENERGY = {
    장생:60, 목욕:45, 관대:70, 건록:90, 제왕:100, 쇠:65,
    병:40, 사:25, 묘:20, 절:15, 태:30, 양:45
  };

  function unseongRead(p, ilgan, daeunJi, seunJi, isStrong) {
    var r = {};
    SLOTS_JI.forEach(function (s) { r[s] = D.unseong(ilgan, p[s]); });
    r.대운지 = daeunJi ? D.unseong(ilgan, daeunJi) : null;
    r.세운지 = seunJi ? D.unseong(ilgan, seunJi) : null;

    /* 일주 거법 — 성격 서술용 */
    r.일주 = D.unseong(p.일간, p.일지);

    var w = { 월지:0.40, 일지:0.30, 시지:0.15, 년지:0.15 };
    var energy = 0;
    SLOTS_JI.forEach(function (s) { energy += w[s] * UN_ENERGY[r[s]]; });
    r.personalEnergy = Math.round(energy);
    r.currentEnergy = (r.대운지 || r.세운지)
      ? Math.round(0.6 * UN_ENERGY[r.대운지 || r.세운지] + 0.4 * UN_ENERGY[r.세운지 || r.대운지])
      : null;

    /* 묘/절 라벨은 신강약에 따라 뉘앙스가 뒤집힌다 */
    r.labels = {};
    SLOTS_JI.concat(["대운지", "세운지"]).forEach(function (s) {
      var st = r[s];
      if (!st) return;
      if (st === "묘") r.labels[s] = isStrong ? "庫(축적)" : "墓(정체)";
      else if (st === "절") r.labels[s] = isStrong ? "胞(재출발 직전)" : "絶(단절)";
      else r.labels[s] = st;
    });

    var phases = {};
    SLOTS_JI.forEach(function (s) { phases[D.UN_PHASE[r[s]]] = 1; });
    r.phases = Object.keys(phases);
    r.변동형 = r.phases.length === 4;

    /* 자립 성향 */
    var ilju = p.일간 + p.일지;
    var strongSlots = SLOTS_JI.filter(function (s) {
      return ["건록", "제왕"].indexOf(r[s]) >= 0;
    });
    var weakSlots = SLOTS_JI.filter(function (s) {
      return ["절", "태", "묘"].indexOf(r[s]) >= 0;
    });

    r.자립형 = ["건록", "제왕"].indexOf(r.월지) >= 0 || ["건록", "제왕"].indexOf(r.일지) >= 0;
    r.자립최강 = D.ILJU_GEONROK.indexOf(ilju) >= 0 ? "A"
               : D.ILJU_JEWANG.indexOf(ilju) >= 0 ? "B" : null;
    r.간여지동 = D.GANYEOJIDONG.indexOf(ilju) >= 0;
    r.자립강화 = strongSlots.length >= 2;
    r.소속불안 = weakSlots.length >= 2;

    /* 퇴사운 태그 — 대운 12상태를 빠짐없이 덮는다 */
    var du = r.대운지;
    if (!du) {
      r.tag = "명식기반";
    } else if (r.자립형) {
      if (["건록", "제왕"].indexOf(du) >= 0)                        r.tag = "독립실행적기";
      else if (["쇠", "병", "사", "묘", "절", "태"].indexOf(du) >= 0) r.tag = "독립기질_시기미흡";
      else                                                          r.tag = "독립기질_축적구간";
    } else {
      if (["쇠", "병", "사", "묘"].indexOf(du) >= 0)      r.tag = "정리기";
      else if (["절", "태", "양"].indexOf(du) >= 0)       r.tag = "잠복기";
      else if (["장생", "관대"].indexOf(du) >= 0)         r.tag = "성장기";
      else if (du === "목욕")                             r.tag = "동요기";
      else                                                r.tag = "주도권상승기";
    }
    return r;
  }

  /* =========================================================
     6. 신살
     ========================================================= */
  var SIN_W = {
    역마:1.0, 공망:0.95, 양인:0.9, 괴강:0.9, 백호:0.85,
    천을귀인:0.85, 도화:0.8, 화개:0.8, 문창귀인:0.75, 학당귀인:0.7,
    겁살:0.7, 망신:0.7, 장성:0.65, 반안:0.6, 지살:0.6,
    재살:0.6, 천살:0.55, 월살:0.55, 육해:0.5
  };
  var SIN_POS = { 년지:0.5, 월지:1.0, 일지:0.9, 시지:0.7, 대운지:0.85, 세운지:0.8 };

  function sinsal(p, daeunJi, seunJi, rel) {
    var out = [];
    var ilgan = p.일간;
    var iljuN = D.ganjiIndex(p.일간, p.일지);
    var yearN = D.ganjiIndex(p.년간, p.년지);

    var slots = [{ s: "년지", j: p.년지 }, { s: "월지", j: p.월지 },
                 { s: "일지", j: p.일지 }, { s: "시지", j: p.시지 }];
    if (daeunJi) slots.push({ s: "대운지", j: daeunJi });
    if (seunJi)  slots.push({ s: "세운지", j: seunJi });

    /* 충·형·공망 겹침 → 감쇠 */
    var chungSlots = {}, hyeongSlots = {};
    (rel && rel.list || []).forEach(function (r) {
      if (r.type === "육충") r.slots.forEach(function (s) { chungSlots[s] = 1; });
      if (["삼형", "상형", "자묘형", "자형"].indexOf(r.type) >= 0)
        r.slots.forEach(function (s) { hyeongSlots[s] = 1; });
    });

    var gmDay  = iljuN >= 0 ? D.gongmang(iljuN) : [];
    var gmYear = yearN >= 0 ? D.gongmang(yearN) : [];

    function add(name, slot, ji, extra) {
      var decay = 1;
      if (gmDay.indexOf(ji) >= 0 && name !== "공망") decay *= 0.5;
      if (chungSlots[slot]) decay *= 0.7;
      if (hyeongSlots[slot]) decay *= 0.8;
      var o = {
        name: name, slot: slot, ji: ji,
        score: round1((SIN_POS[slot] || 0.5) * (SIN_W[name] || 0.5) * decay),
        damped: decay < 1
      };
      for (var k in extra) o[k] = extra[k];
      out.push(o);
    }

    slots.forEach(function (x) {
      if (x.s !== "일지" && gmDay.indexOf(x.j) >= 0) add("공망", x.s, x.j, {});
      if (D.CHEONEUL[ilgan].indexOf(x.j) >= 0) add("천을귀인", x.s, x.j, {});
      if (D.MUNCHANG[ilgan] === x.j) add("문창귀인", x.s, x.j, {});
      if (D.HAKDANG[ilgan] === x.j) add("학당귀인", x.s, x.j, {});
      if (D.YANGIN[ilgan] === x.j) add("양인", x.s, x.j, {});
    });

    /* 12신살 — 역마·화개는 일지 기준, 도화는 연지 기준 */
    var byDay = D.sinsal12(p.일지), byYear = D.sinsal12(p.년지);
    slots.forEach(function (x) {
      ["역마", "화개", "겁살", "망신", "장성", "반안", "지살", "재살", "천살", "월살"].forEach(function (n) {
        if (byDay[n] === x.j) {
          var both = byYear[n] === x.j;
          add(n, x.s, x.j, { base: "일지", both: both });
        }
      });
      if (byYear["년살"] === x.j) add("도화", x.s, x.j, { base: "연지" });
    });

    /* 백호·괴강 — 원국 4주 + 운 */
    var pillars = [
      { s: "년지", gj: p.년간 + p.년지 }, { s: "월지", gj: p.월간 + p.월지 },
      { s: "일지", gj: p.일간 + p.일지 }, { s: "시지", gj: p.시간 + p.시지 }
    ];
    pillars.forEach(function (x) {
      if (D.BAEKHO.indexOf(x.gj) >= 0)
        add("백호", x.s, x.gj.slice(1), { ganji: x.gj, kind: D.BAEKHO_KIND[x.gj] });
      else if (D.GWAEGANG_CORE.indexOf(x.gj) >= 0)
        add("괴강", x.s, x.gj.slice(1), { ganji: x.gj });
    });

    /* 연주 기준 공망은 초년 환경 서술로만 */
    var yearVoid = [];
    slots.forEach(function (x) {
      if (gmYear.indexOf(x.j) >= 0) yearVoid.push({ slot: x.s, ji: x.j });
    });

    out.sort(function (a, b) { return b.score - a.score; });

    /* 같은 이름 중복은 최고점만 남긴다 */
    var seen = {}, uniq = [];
    out.forEach(function (o) {
      if (seen[o.name]) return;
      seen[o.name] = 1;
      uniq.push(o);
    });

    return {
      all: out, top: uniq.slice(0, 3), badges: uniq.slice(3),
      gongmangDay: gmDay, gongmangYear: gmYear, yearVoid: yearVoid,
      none: out.length === 0,
      onlyYearPillar: out.length > 0 && out.every(function (o) { return o.slot === "년지"; })
    };
  }

  /* =========================================================
     7. 격국 — 월지에서 무엇이 주도권을 잡는지로 사회적 역할을 본다
     ========================================================= */
  function gyukguk(p, sc, sary, rel) {
    var ilgan = p.일간, monthJi = p.월지;
    var tugan = [p.년간, p.월간, p.시간];          // 일간 제외
    var segs = D.JIJANGGAN[monthJi];
    var main = segs[segs.length - 1].g;
    var type = D.JI_TYPE[monthJi];
    var log = [];

    var damaged = (rel && rel.list || []).some(function (r) {
      return r.slots.indexOf("월지") >= 0 &&
             ["육충", "삼형", "상형", "자묘형"].indexOf(r.type) >= 0;
    });

    function power(g) {
      var v = 0, i, k;
      for (i = 0; i < SLOTS_JI.length; i++) {
        var ss = D.JIJANGGAN[p[SLOTS_JI[i]]];
        for (k = 0; k < ss.length; k++) {
          if (ss[k].g === g) v += ss[k].layer === "정기" ? 3 : 1;
        }
      }
      if (tugan.indexOf(g) >= 0) v += 2;
      if (main === g) v += 3;
      return v;
    }

    var excluded = [], retry = 0;

    function pick() {
      var pool = segs.map(function (x) { return x.g; })
                     .filter(function (g) { return excluded.indexOf(g) < 0; });
      var inTugan = pool.filter(function (g) { return tugan.indexOf(g) >= 0; });
      if (type === "생지") inTugan = inTugan.filter(function (g) { return g !== "무"; });

      if (type === "고지") {
        var mid = segs.filter(function (x) { return x.layer === "중기"; })[0];
        var inFullHap = (rel && rel.list || []).some(function (r) {
          return (r.type === "삼합" || r.type === "방합") && r.slots.indexOf("월지") >= 0;
        });
        if (mid && inFullHap && excluded.indexOf(mid.g) < 0) return mid.g;
      }
      if (inTugan.indexOf(main) >= 0) return main;
      if (inTugan.length) return inTugan.sort(function (a, b) { return power(b) - power(a); })[0];
      return main;
    }

    var cand = pick();
    while (retry < 3) {
      var layer = (segs.filter(function (x) { return x.g === cand; })[0] || {}).layer;
      var hapgeo = tugan.indexOf(D.GAN_HAP[cand]) >= 0;
      if ((layer === "여기" || layer === "중기") && (hapgeo || damaged)) {
        excluded.push(cand); retry++;
        log.push("후보 " + cand + " 제외 (" + (hapgeo ? "합거" : "월령훼손") + ")");
        cand = pick();
      } else break;
    }

    var god = D.sipsung(ilgan, cand);
    var key, display;
    if (god === "비견") {
      key = "녹겁격";
      display = (monthJi === D.GEONROK[ilgan]) ? "건록격" : "월지비견격";
    } else if (god === "겁재") {
      if (D.GAN_YY[ilgan] === 1 && D.YANGIN[ilgan] === monthJi) { key = "양인격"; display = "양인격"; }
      else { key = "녹겁격"; display = "월지겁재격"; }
    } else {
      key = god + "격"; display = key;
    }

    var flaws = [], merits = [], G = sc.group;
    var hasSanggwan = tugan.concat([sary ? sary.gan : null]).some(function (g) {
      return g && D.sipsung(ilgan, g) === "상관";
    });
    var hasJeonggwan = tugan.some(function (g) { return D.sipsung(ilgan, g) === "정관"; });
    var hasPyeongwan = tugan.some(function (g) { return D.sipsung(ilgan, g) === "편관"; });

    if (hasSanggwan && hasJeonggwan) flaws.push("상관견관");
    if (hasJeonggwan && hasPyeongwan) flaws.push("관살혼잡");
    if (G["비겁"] > G["재성"] * 1.5 && G["식상"] < G["재성"] * 0.3) flaws.push("군겁쟁재");
    if (damaged) flaws.push("월령훼손");
    if (sc.root === 0) flaws.push("일간무근");

    if (tugan.indexOf(cand) >= 0) merits.push("투간");
    if (sary && sary.gan === cand) merits.push("당령");
    if (!damaged) merits.push("월령온전");

    var score = Math.max(5, Math.min(95, 50 + merits.length * 12 - flaws.length * 14));

    return {
      key: key, display: display, cand: cand, god: god,
      monthJiType: type, damaged: damaged,
      merits: merits, flaws: flaws, score: score,
      grade: score >= 70 ? "성격" : score >= 45 ? "보통" : "파격",
      confidence: (damaged || retry > 0) ? "LOW" : (tugan.indexOf(cand) >= 0 ? "HIGH" : "MEDIUM"),
      log: log
    };
  }

  /* =========================================================
     8. 용신 — 별격 → 조후 → 억부 순으로 검사
     종격은 보수적으로. 경계는 전부 내격으로 떨어뜨린다.
     ========================================================= */
  function yongsin(p, sc, st) {
    var ilgan = p.일간, G = sc.group, total = sum(G) || 1, log = [];

    function build(yong, hui, method, special, conf, logs, extra) {
      var m = D.YONG_MAP[yong];
      var o = {
        용신군: yong, 희신군: hui,
        기신군: m.기, 구신군: m.구, 한신군: m.한,
        용신오행: D.groupToOh(ilgan, yong),
        희신오행: D.groupToOh(ilgan, hui),
        기신오행: D.groupToOh(ilgan, m.기),
        method: method, special: special || null,
        confidence: conf, log: logs
      };
      if (extra) { o.temp = extra.temp; o.johu = extra.johu; }
      return o;
    }

    if (st.label === "극신강" || st.label === "극신약") {
      var dom = maxKey(G), ratio = G[dom] / total;
      if (ratio >= 0.6) {
        var found = null, k;
        for (k in D.BYEOLGYEOK) if (D.BYEOLGYEOK[k].g === dom) found = k;
        if (found) {
          log.push("별격 " + found + " (" + dom + " 비중 " + Math.round(ratio * 100) + "%)");
          return build(D.BYEOLGYEOK[found].용, D.BYEOLGYEOK[found].희,
                       "별격", found, "MEDIUM", log);
        }
      }
    }

    var temp = 0;
    SLOTS_GAN.concat(SLOTS_JI).forEach(function (s) { temp += D.TEMP[p[s]] || 0; });
    var johuStr = D.JOHU[ilgan] && D.JOHU[ilgan][p.월지];
    var johuOh = johuStr ? D.GAN_OH[johuStr[0]] : null;

    var weak = ["신약", "극신약", "중화신약"].indexOf(st.label) >= 0;
    var yongGroup;
    if (weak) {
      yongGroup = G["인성"] >= G["비겁"] ? "인성" : "비겁";
      log.push("신약 — 도와주는 " + yongGroup + "을 용신으로");
    } else {
      yongGroup = maxKey({ 식상: G["식상"], 재성: G["재성"], 관성: G["관성"] });
      log.push("신강 — 덜어내는 " + yongGroup + "을 용신으로");
    }

    var method = "억부";
    if (Math.abs(temp) >= 7 && johuOh) {
      var johuGroup = D.ohToGroup(ilgan, johuOh);
      if (johuGroup && johuGroup !== yongGroup) {
        log.push("한난 " + (temp > 0 ? "과열" : "과냉") + " (" + temp + ") — 조후 우선");
        yongGroup = johuGroup;
        method = "조후";
      }
    }

    return build(yongGroup, D.YONG_MAP[yongGroup].희, method, null, st.confidence, log,
                 { temp: temp, johu: johuStr || null });
  }

  /* =========================================================
     통합 — 이것 하나만 부르면 된다
     ========================================================= */
  function analyze(input) {
    var p = input.pillars;
    var ilgan = p.일간;
    /* 태어난 시간을 모르면 시주는 실제 근거가 아니다.
       계산에는 들어가지만, 시주만으로 성립한 판정은 신뢰할 수 없다. */
    var hourKnown = input.hourKnown !== false;

    var sary = saryeong(p.월지, input.birth, input.termIdx, input.termYear);
    var sc = scoreChart(p, ilgan, sary, input.opt);
    var rel0 = relations(p, null, null);
    var damaged = (rel0.list || []).some(function (r) {
      return r.slots.indexOf("월지") >= 0 &&
             ["육충", "삼형", "상형", "자묘형"].indexOf(r.type) >= 0;
    });
    var st = strength(sc, p, ilgan, sary, damaged);
    var gg = gyukguk(p, sc, sary, rel0);
    var ys = yongsin(p, sc, st);
    var isStrong = ["신강", "극신강", "중화신강"].indexOf(st.label) >= 0;
    var rel = relations(p, input.daeunJi || null, input.seunJi || null);
    var un = unseongRead(p, ilgan, input.daeunJi || null, input.seunJi || null, isStrong);
    var ss = sinsal(p, input.daeunJi || null, input.seunJi || null, rel);

    /* 시간 미상이면 시주 근거만으로 잡힌 것들을 걷어낸다 */
    if (!hourKnown) {
      rel.list = rel.list.filter(function (r) { return r.slots.indexOf("시지") < 0; });
      rel0.list = rel0.list.filter(function (r) { return r.slots.indexOf("시지") < 0; });
      ss.all = ss.all.filter(function (x) { return x.slot !== "시지"; });
      ss.top = ss.top.filter(function (x) { return x.slot !== "시지"; });
      ss.badges = ss.badges.filter(function (x) { return x.slot !== "시지"; });
      ss.none = ss.all.length === 0;
      un.시지 = null;
      if (st.confidence === "HIGH") st.confidence = "MEDIUM";
    }

    return {
      pillars: p, ilgan: ilgan, hourKnown: hourKnown,
      saryeong: sary, score: sc, strength: st,
      relations: rel, natalRelations: rel0,
      unseong: un, sinsal: ss, gyukguk: gg, yongsin: ys,
      dominant: maxKey(sc.group), weakest: minKey(sc.group)
    };
  }

  global.SajuAnalyze = {
    analyze: analyze,
    gyukguk: gyukguk,
    yongsin: yongsin,
    saryeong: saryeong,
    scoreChart: scoreChart,
    strength: strength,
    relations: relations,
    unseongRead: unseongRead,
    sinsal: sinsal,
    UN_ENERGY: UN_ENERGY,
    POS_SCORE: POS_SCORE,
    _util: { emptyOh: emptyOh, emptyGroup: emptyGroup, sum: sum,
             maxKey: maxKey, minKey: minKey, round1: round1, OH: OH, GROUPS: GROUPS }
  };
})(typeof window !== "undefined" ? window : global);
