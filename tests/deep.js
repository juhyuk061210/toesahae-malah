/* 심화 엔진 표 자가검증 — 명세가 제시한 불변식으로 표를 검사한다 */
"use strict";
global.window = global;
require("../saju-deep.js");
var D = global.SajuDeep, GAN = D.GAN, JI = D.JI;

var fail = 0, pass = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  실패: " + msg); } }
function setEq(a, b) {
  if (a.length !== b.length) return false;
  var s = a.slice().sort().join(","), t = b.slice().sort().join(",");
  return s === t;
}

/* ---- 지장간 ---- */
JI.forEach(function (j) {
  var arr = D.JIJANGGAN[j];
  ok(!!arr, "지장간 누락: " + j);
  var sum = arr.reduce(function (a, x) { return a + x.days; }, 0);
  ok(sum === 30, "지장간 일수합 30 아님: " + j + " = " + sum);
  ok(arr[arr.length - 1].layer === "정기", "마지막이 정기 아님: " + j);
  // 정기 오행은 그 지지의 오행과 일치해야 한다 (고지 제외)
  var 정기 = arr[arr.length - 1].g;
  if (D.JI_TYPE[j] !== "고지") {
    ok(D.GAN_OH[정기] === D.JI_OH[j], "정기 오행 불일치: " + j + " 정기=" + 정기);
  }
});
ok(Object.keys(D.JIJANGGAN).length === 12, "지장간 12지 아님");
ok(Object.keys(D.INWON).length === 12, "인원용사 12지 아님");
ok(D.LAYER_W["정기"] > D.LAYER_W["여기"] && D.LAYER_W["여기"] > D.LAYER_W["중기"],
   "층위 서열이 정기>여기>중기 가 아님");

/* ---- 십이운성: 양간 5개의 (장생,제왕,묘)는 삼합국을 이룬다 ---- */
var 삼합기대 = { 갑:["해","묘","미"], 병:["인","오","술"], 무:["인","오","술"],
                 경:["사","유","축"], 임:["신","자","진"] };
Object.keys(삼합기대).forEach(function (g) {
  var got = ["장생", "제왕", "묘"].map(function (st) {
    return JI.filter(function (j) { return D.unseong(g, j) === st; })[0];
  });
  ok(setEq(got, 삼합기대[g]), "십이운성 삼합 불일치 " + g + ": " + got.join(",") +
     " ≠ " + 삼합기대[g].join(","));
});
// 120칸 전부 채워지는지
GAN.forEach(function (g) {
  var seen = {};
  JI.forEach(function (j) {
    var st = D.unseong(g, j);
    ok(!!st, "운성 null: " + g + j);
    seen[st] = 1;
  });
  ok(Object.keys(seen).length === 12, "운성 12단계 전부 안 나옴: " + g);
});
// 건록 = 십이운성 건록지와 일치해야 한다
GAN.forEach(function (g) {
  var r = JI.filter(function (j) { return D.unseong(g, j) === "건록"; })[0];
  ok(r === D.GEONROK[g], "건록 불일치 " + g + ": 운성=" + r + " 표=" + D.GEONROK[g]);
});

/* ---- 형충회합 ---- */
JI.forEach(function (j) {
  ok(D.YUKHAP[D.YUKHAP[j]] === j, "육합 대칭 아님: " + j);
  ok(D.YUKCHUNG[D.YUKCHUNG[j]] === j, "육충 대칭 아님: " + j);
  ok(D.YUKPA[D.YUKPA[j]] === j, "육파 대칭 아님: " + j);
  ok(D.YUKHAE[D.YUKHAE[j]] === j, "육해 대칭 아님: " + j);
  // 육합: 인덱스 합 1 또는 13
  var s = JI.indexOf(j) + JI.indexOf(D.YUKHAP[j]);
  ok(s === 1 || s === 13, "육합 인덱스합 규칙 위배: " + j);
  // 육충: 인덱스 차 6
  ok(Math.abs(JI.indexOf(j) - JI.indexOf(D.YUKCHUNG[j])) === 6, "육충 차6 위배: " + j);
  // 육해: 인덱스 합 7 또는 19
  var h = JI.indexOf(j) + JI.indexOf(D.YUKHAE[j]);
  ok(h === 7 || h === 19, "육해 인덱스합 규칙 위배: " + j);
});
ok(Object.keys(D.YUKHAP).length === 12 && Object.keys(D.YUKCHUNG).length === 12 &&
   Object.keys(D.YUKPA).length === 12 && Object.keys(D.YUKHAE).length === 12,
   "육합/충/파/해 12칸 아님");
// 삼합 4조가 12지를 정확히 덮는다
var 삼합전체 = [];
D.SAMHAP.forEach(function (x) { 삼합전체 = 삼합전체.concat(x.set); });
ok(setEq(삼합전체, JI), "삼합 4조가 12지를 덮지 않음");
var 방합전체 = [];
D.BANGHAP.forEach(function (x) { 방합전체 = 방합전체.concat(x.set); });
ok(setEq(방합전체, JI), "방합 4조가 12지를 덮지 않음");
// 삼합 왕지는 사왕지여야 한다
D.SAMHAP.forEach(function (x) {
  ok(D.JI_TYPE[x.왕지] === "왕지", "삼합 왕지가 왕지 아님: " + x.왕지);
  ok(D.JI_TYPE[x.생지] === "생지", "삼합 생지가 생지 아님: " + x.생지);
  ok(D.JI_TYPE[x.고지] === "고지", "삼합 고지가 고지 아님: " + x.고지);
});

/* ---- 공망 ---- */
var 공망순 = {};
for (var n = 0; n < 60; n++) {
  var gm = D.gongmang(n);
  ok(gm.length === 2, "공망 2개 아님: " + n);
  // 공망 지지는 해당 간지의 지지와 달라야 한다
  ok(gm.indexOf(JI[n % 12]) < 0, "공망이 자기 지지 포함: " + D.ganjiOf(n));
  공망순[gm.join("")] = (공망순[gm.join("")] || 0) + 1;
}
ok(Object.keys(공망순).length === 6, "공망 순이 6종 아님: " + Object.keys(공망순).length);
Object.keys(공망순).forEach(function (k) {
  ok(공망순[k] === 10, "공망 " + k + " 이 10개 아님: " + 공망순[k]);
});

/* ---- 신살 ---- */
ok(D.BAEKHO.length === 7, "백호 7개 아님");
D.BAEKHO.forEach(function (gj) {
  var idx = D.ganjiIndex(gj[0], gj[1]);
  ok(idx >= 0, "백호 간지가 60갑자에 없음: " + gj);
  ok(idx % 9 === 4, "백호 n%9===4 위배: " + gj + " idx=" + idx);
});
GAN.forEach(function (g) {
  ok(D.CHEONEUL[g] && D.CHEONEUL[g].length === 2, "천을귀인 2개 아님: " + g);
  ok(!!D.MUNCHANG[g], "문창 누락: " + g);
  ok(!!D.HAKDANG[g], "학당 누락: " + g);
  ok(!!D.GEONROK[g], "건록 누락: " + g);
});
// 학당귀인 = 장생지
GAN.forEach(function (g) {
  var js = JI.filter(function (j) { return D.unseong(g, j) === "장생"; })[0];
  ok(js === D.HAKDANG[g], "학당≠장생지 " + g + ": " + js + " vs " + D.HAKDANG[g]);
});
// 양인은 양간 5개만
ok(Object.keys(D.YANGIN).length === 5, "양인 5개 아님");
Object.keys(D.YANGIN).forEach(function (g) { ok(D.GAN_YY[g] === 1, "양인이 음간에: " + g); });
// 12신살 — 기준지마다 12개가 12지를 정확히 덮는다
JI.forEach(function (j) {
  var s = D.sinsal12(j), vals = Object.keys(s).map(function (k) { return s[k]; });
  ok(vals.length === 12, "12신살 12개 아님: " + j);
  ok(setEq(vals, JI), "12신살이 12지를 덮지 않음: " + j);
  // 역마는 항상 생지, 화개는 항상 고지
  ok(D.JI_TYPE[s["역마"]] === "생지", "역마가 생지 아님: " + j + "→" + s["역마"]);
  ok(D.JI_TYPE[s["화개"]] === "고지", "화개가 고지 아님: " + j + "→" + s["화개"]);
  ok(D.JI_TYPE[s["년살"]] === "왕지", "년살(도화)이 왕지 아님: " + j + "→" + s["년살"]);
});

/* ---- 조후용신 120칸 ---- */
GAN.forEach(function (g) {
  ok(!!D.JOHU[g], "조후 일간 누락: " + g);
  JI.forEach(function (j) {
    var v = D.JOHU[g] && D.JOHU[g][j];
    ok(!!v, "조후 칸 누락: " + g + "/" + j);
    if (v) {
      for (var i = 0; i < v.length; i++) {
        ok(GAN.indexOf(v[i]) >= 0, "조후에 천간 아닌 글자: " + g + "/" + j + " = " + v);
      }
    }
  });
});

/* ---- 십성 ---- */
GAN.forEach(function (il) {
  var cnt = {};
  GAN.forEach(function (t) {
    var s = D.sipsung(il, t);
    ok(!!s, "십성 null: " + il + "→" + t);
    cnt[s] = (cnt[s] || 0) + 1;
  });
  ok(Object.keys(cnt).length === 10, "십성 10종 안 나옴: " + il);
  // 일간 자신은 비견
  ok(D.sipsung(il, il) === "비견", "자기 자신이 비견 아님: " + il);
});
// 오행↔십성군 왕복
GAN.forEach(function (il) {
  ["비겁","식상","재성","관성","인성"].forEach(function (grp) {
    var oh = D.groupToOh(il, grp);
    ok(!!oh, "groupToOh null: " + il + "/" + grp);
    ok(D.ohToGroup(il, oh) === grp, "오행↔십성군 왕복 실패: " + il + "/" + grp);
  });
});

/* ---- 천간합충 ---- */
GAN.forEach(function (g) {
  ok(D.GAN_HAP[D.GAN_HAP[g]] === g, "천간합 대칭 아님: " + g);
  ok(Math.abs(GAN.indexOf(g) - GAN.indexOf(D.GAN_HAP[g])) === 5, "천간합 차5 위배: " + g);
});
ok(Object.keys(D.GAN_CHUNG).length === 8, "천간충 8개 아님 (무기는 충 없음)");

console.log("심화 엔진 표 검증: " + pass + "건 통과" + (fail ? ", " + fail + "건 실패" : ""));
process.exitCode = fail ? 1 : 0;
