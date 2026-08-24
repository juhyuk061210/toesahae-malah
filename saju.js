/* =========================================================
   사주 계산 엔진 (만세력 기반 간지 산출 + 커리어 해석)
   - 년/월/일/시주 사주팔자 산출
   - 오행 분포, 십성 분포, 신강신약
   - 퇴사운 점수 및 향후 3년 타이밍
   ========================================================= */
(function (global) {
  "use strict";

  /* ---------------- 기본 상수 ---------------- */
  var GAN = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
  var GAN_H = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var JI = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
  var JI_H = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

  // 천간 오행: 목목화화토토금금수수
  var GAN_OH = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
  // 지지 오행: 자수 축토 인목 묘목 진토 사화 오화 미토 신금 유금 술토 해수
  var JI_OH = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];

  var OH = ["목", "화", "토", "금", "수"];
  var OH_COLOR = ["#4c9a6a", "#d0553f", "#c99a4a", "#8d93a3", "#3f6fa8"];
  var ZODIAC = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];

  /* ---------------- 절기 (월지 경계 근사) ---------------- */
  // 각 절기의 대략적 양력 날짜와 해당 월지 index
  /* 절기 경계는 solar-terms.js 의 실제 절입 시각 테이블을 사용합니다.
     (고정 날짜 근사는 경계일 명식이 틀리기 때문에 폐기했습니다) */

  /* ---------------- 유틸 ---------------- */
  function toJDN(y, m, d) {
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    return (
      d +
      Math.floor((153 * mm + 2) / 5) +
      365 * yy +
      Math.floor(yy / 4) -
      Math.floor(yy / 100) +
      Math.floor(yy / 400) -
      32045
    );
  }

  function isYang(idx) {
    return idx % 2 === 0;
  }

  /* ---------------- 사주 산출 ---------------- */

  /* 야자시(23:00~) 처리 규칙.
     false = 조자시(당일 유지) — manseryeok 기준과 일치
     true  = 야자시(익일로 넘김) — 일부 유파
     교차검증 기준을 바꾸려면 이 값만 변경하세요. */
  var LATE_ZI_ROLLS_DAY = false;

  /* 분 단위 비교용 키 */
  function stamp(mo, d, h, mi) {
    return ((mo * 100 + d) * 100 + h) * 100 + mi;
  }

  /* 해당 시각이 속한 절기월(월지)과, 절기 기준 사주년도 반환.
     실제 절입 시각(solar-terms.js)을 사용합니다. */
  function getTermContext(y, m, d, h, mi) {
    var ST = global.SolarTerms;
    if (!ST) throw new Error("solar-terms.js 가 로드되지 않았습니다.");

    var now = stamp(m, d, h, mi);
    var list = ST.terms(y);
    if (!list) {
      // 테이블 범위 밖 — 근사 폴백
      var approx = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1];
      return { monthJi: approx[(m + 10) % 12], sajuYear: m < 2 ? y - 1 : y, idx: -1, year: y };
    }

    // 올해 절기 중 이미 지난 마지막 절기
    var passedIdx = -1;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (now >= stamp(t.mo, t.d, t.h, t.mi)) passedIdx = i;
      else break;
    }

    if (passedIdx === -1) {
      // 올해 소한 이전 → 작년 대설(자월)
      return { monthJi: 0, sajuYear: y - 1, idx: 11, year: y - 1 };
    }

    // 입춘(index 1) 이후여야 해당 년도 간지
    var sajuYear = passedIdx >= 1 ? y : y - 1;
    return { monthJi: list[passedIdx].ji, sajuYear: sajuYear, idx: passedIdx, year: y };
  }

  function computeChart(input) {
    var y = input.year,
      m = input.month,
      d = input.day;
    var hour = input.hourKnown ? input.hour : 12;
    var minute = input.hourKnown ? input.minute || 0 : 0;

    /* --- 일주 --- */
    var dayJDN = toJDN(y, m, d);
    if (LATE_ZI_ROLLS_DAY && input.hourKnown && hour >= 23) dayJDN += 1;
    var dayIdx = (((dayJDN + 49) % 60) + 60) % 60;
    var dayGan = dayIdx % 10;
    var dayJi = dayIdx % 12;

    /* --- 월지 / 년주 (실제 절입 시각 기준) --- */
    var ctx = getTermContext(y, m, d, hour, minute);
    var monthJi = ctx.monthJi;
    var sajuYear = ctx.sajuYear;

    var yearIdx = (((sajuYear - 4) % 60) + 60) % 60;
    var yearGan = yearIdx % 10;
    var yearJi = yearIdx % 12;

    /* --- 월간 (五虎遁): 년간에 따라 인월 천간 결정 --- */
    // 갑기→병인, 을경→무인, 병신→경인, 정임→임인, 무계→갑인
    var inWolGan = [2, 4, 6, 8, 0][yearGan % 5];
    // 인월(ji=2)로부터 몇 달 지났는지
    var monthOffset = (monthJi - 2 + 12) % 12;
    var monthGan = (inWolGan + monthOffset) % 10;

    /* --- 시주 (五鼠遁): 일간에 따라 자시 천간 결정 --- */
    var hourGan = null,
      hourJi = null;
    if (input.hourKnown) {
      var jaGan = [0, 2, 4, 6, 8][dayGan % 5];
      // 23~01시 자시, 이후 2시간 단위
      hourJi = Math.floor(((hour * 60 + minute + 60) % 1440) / 120);
      hourGan = (jaGan + hourJi) % 10;
    }

    var pillars = {
      year: { gan: yearGan, ji: yearJi },
      month: { gan: monthGan, ji: monthJi },
      day: { gan: dayGan, ji: dayJi },
      hour: input.hourKnown ? { gan: hourGan, ji: hourJi } : null
    };

    /* --- 오행 분포 --- */
    var oh = [0, 0, 0, 0, 0];
    var list = [pillars.year, pillars.month, pillars.day];
    if (pillars.hour) list.push(pillars.hour);
    list.forEach(function (p) {
      oh[GAN_OH[p.gan]] += 1;
      oh[JI_OH[p.ji]] += 1;
    });

    /* --- 십성 분포 (일간 기준) --- */
    var ss = {
      비견: 0, 겁재: 0, 식신: 0, 상관: 0, 편재: 0,
      정재: 0, 편관: 0, 정관: 0, 편인: 0, 정인: 0
    };
    var meOh = GAN_OH[dayGan];
    var meYang = isYang(dayGan);

    function relate(targetOh, targetYang) {
      var same = targetYang === meYang;
      if (targetOh === meOh) return same ? "비견" : "겁재";
      if (targetOh === (meOh + 1) % 5) return same ? "식신" : "상관"; // 내가 생함
      if (targetOh === (meOh + 2) % 5) return same ? "편재" : "정재"; // 내가 극함
      if (targetOh === (meOh + 3) % 5) return same ? "편관" : "정관"; // 나를 극함
      return same ? "편인" : "정인"; // 나를 생함
    }

    list.forEach(function (p, i) {
      // 일간 자신은 제외
      if (!(i === 2)) {
        ss[relate(GAN_OH[p.gan], isYang(p.gan))] += 1;
      }
      ss[relate(JI_OH[p.ji], isYang(p.ji))] += 1;
    });

    /* --- 십성 그룹 --- */
    var group = {
      비겁: ss.비견 + ss.겁재,   // 자립/경쟁
      식상: ss.식신 + ss.상관,   // 표현/창조
      재성: ss.편재 + ss.정재,   // 재물/사업
      관성: ss.편관 + ss.정관,   // 조직/직장
      인성: ss.편인 + ss.정인    // 학문/안정
    };

    /* --- 신강/신약 --- */
    var support = group.비겁 + group.인성;
    var drain = group.식상 + group.재성 + group.관성;
    var strength = support / (support + drain); // 0~1
    var strengthLabel = strength >= 0.55 ? "신강" : strength <= 0.38 ? "신약" : "중화";

    return {
      input: input,
      pillars: pillars,
      dayGan: dayGan,
      dayJi: dayJi,
      oh: oh,
      ss: ss,
      group: group,
      strength: strength,
      strengthLabel: strengthLabel,
      sajuYear: sajuYear,
      /* 절입 정보 — 심화 엔진의 사령(司令) 판정에 필요하다.
         같은 달에 태어나도 절입 후 며칠이냐로 주도권이 갈린다. */
      termIdx: ctx.idx,
      termYear: ctx.year
    };
  }

  /* ---------------- 커리어 유형 판정 ---------------- */
  var TYPES = {
    식상: {
      key: "식상",
      name: "창조형 이탈자",
      tag: "판을 새로 짜야 숨이 트이는 사람",
      desc:
        "당신의 사주는 표현하고 만들어내는 기운(식상)이 강합니다. 시키는 일을 정해진 방식으로 반복할 때 가장 빠르게 소모되고, 내 이름으로 결과물이 남을 때 폭발적으로 움직입니다. 조직 안에서의 답답함은 능력 부족이 아니라 구조와의 불일치입니다.",
      strength: ["아이디어를 실물로 만드는 실행력", "새로운 방식을 찾아내는 감각", "자기 언어로 설득하는 힘"],
      caution: "상사와의 마찰, 잦은 이직 충동. 나가는 것 자체보다 '나가서 무엇을 할지'를 먼저 세워야 합니다."
    },
    관성: {
      key: "관성",
      name: "조직형 실무가",
      tag: "구조 안에서 신뢰를 쌓는 사람",
      desc:
        "당신의 사주는 규율과 책임의 기운(관성)이 강합니다. 명확한 역할과 평가 기준이 있을 때 능력이 제대로 발휘되며, 시간이 쌓일수록 신뢰가 자산이 되는 유형입니다. 지금의 답답함은 조직 자체보다 '현재 이 조직'의 문제일 가능성이 큽니다.",
      strength: ["책임을 끝까지 지는 안정감", "체계를 만들고 관리하는 능력", "장기적 신뢰 구축"],
      caution: "충동적 퇴사가 가장 위험한 유형. 나가더라도 다음 자리를 확보한 뒤 움직여야 합니다."
    },
    재성: {
      key: "재성",
      name: "실리형 승부사",
      tag: "숫자로 증명될 때 움직이는 사람",
      desc:
        "당신의 사주는 재물과 실리의 기운(재성)이 강합니다. 명분보다 결과, 과정보다 보상에 정직하게 반응합니다. 지금 마음이 흔들린다면 일이 싫은 게 아니라 '보상이 노력에 못 미친다'는 신호를 몸이 먼저 읽은 것입니다.",
      strength: ["기회를 알아보는 현실 감각", "협상과 영업에서의 강점", "손익을 빠르게 계산하는 판단력"],
      caution: "돈만 보고 옮기면 같은 문제가 반복됩니다. 연봉과 함께 성장 곡선을 봐야 합니다."
    },
    인성: {
      key: "인성",
      name: "전문형 축적가",
      tag: "쌓인 깊이가 무기가 되는 사람",
      desc:
        "당신의 사주는 배움과 축적의 기운(인성)이 강합니다. 즉각적인 성과보다 전문성이 쌓였을 때 가치가 폭발하는 유형으로, 자격·지식·경력이 곧 커리어의 방패가 됩니다. 조급함이 가장 큰 적입니다.",
      strength: ["깊게 파고드는 학습력", "전문 영역에서의 신뢰도", "위기에 흔들리지 않는 내공"],
      caution: "준비만 하다 때를 놓치는 유형. 공부가 도피가 되지 않도록 기한을 정해야 합니다."
    },
    비겁: {
      key: "비겁",
      name: "독립형 개척자",
      tag: "내 이름을 걸어야 힘이 나는 사람",
      desc:
        "당신의 사주는 자립과 경쟁의 기운(비겁)이 강합니다. 누군가의 지시 아래보다 대등한 관계에서 실력을 겨룰 때 진가가 드러납니다. 조직에 있어도 사실상 '1인 사업가'처럼 일할 때 성과가 가장 좋습니다.",
      strength: ["스스로 판단하고 밀어붙이는 추진력", "동료·파트너를 끌어들이는 힘", "위기에서의 승부 근성"],
      caution: "동업과 보증에서 손실이 나기 쉬운 구조. 사람 문제로 인한 이탈을 조심해야 합니다."
    },
    균형: {
      key: "균형",
      name: "균형형 조율가",
      tag: "어디서든 몫을 해내는 사람",
      desc:
        "당신의 사주는 특정 기운에 치우치지 않고 고르게 분포되어 있습니다. 어떤 환경에서도 일정 수준 이상을 해내는 적응력이 강점이지만, 그만큼 '내가 진짜 원하는 것'이 무엇인지 흐려지기 쉽습니다. 방향만 정해지면 가장 멀리 가는 유형입니다.",
      strength: ["환경에 빠르게 적응하는 유연함", "사람 사이를 조율하는 균형 감각", "다방면의 무난한 역량"],
      caution: "선택을 미루다 시기를 놓치기 쉽습니다. 기준을 스스로 정하는 연습이 필요합니다."
    }
  };

  function decideType(chart) {
    var g = chart.group;
    var keys = ["비겁", "식상", "재성", "관성", "인성"];
    var total = keys.reduce(function (a, k) { return a + g[k]; }, 0) || 1;
    var max = keys[0];
    keys.forEach(function (k) { if (g[k] > g[max]) max = k; });
    // 최대 비중이 32% 미만이면 균형형
    if (g[max] / total < 0.32) return TYPES["균형"];
    return TYPES[max];
  }

  /* ---------------- 퇴사운 점수 ---------------- */
  function computeExitScore(chart) {
    var g = chart.group;
    var total = g.비겁 + g.식상 + g.재성 + g.관성 + g.인성 || 1;
    var score = 42;

    // 식상(표현/이탈욕구)이 강할수록 퇴사 압력 ↑
    score += (g.식상 / total) * 100 * 0.55;
    // 비겁(자립)도 이탈 압력 ↑
    score += (g.비겁 / total) * 100 * 0.32;
    // 관성(조직 적응)이 강하면 잔류 압력 ↑
    score -= (g.관성 / total) * 100 * 0.42;
    // 인성(안정/축적)도 잔류 쪽
    score -= (g.인성 / total) * 100 * 0.2;
    // 재성은 기회가 오면 움직임
    score += (g.재성 / total) * 100 * 0.12;

    // 상관견관(상관 + 정관 동시 강) = 조직 갈등 폭발 구조
    if (chart.ss.상관 >= 2 && chart.ss.정관 >= 1) score += 9;
    // 관성 전무 = 조직 매임이 약함
    if (g.관성 === 0) score += 7;
    // 신강이면 밖으로 뻗는 힘이 강함
    if (chart.strengthLabel === "신강") score += 5;
    if (chart.strengthLabel === "신약") score -= 5;

    return Math.max(8, Math.min(96, Math.round(score)));
  }

  function exitVerdict(score) {
    if (score >= 78)
      return {
        label: "지금이 전환의 문턱",
        head: "이미 마음은 나가 있습니다",
        line: "억지로 버티는 시간이 길어질수록 손해가 커지는 구조입니다. 다만 '준비된 퇴사'와 '도망'은 결과가 완전히 다릅니다."
      };
    if (score >= 60)
      return {
        label: "전환 준비 구간",
        head: "나갈 때가 가까워지고 있습니다",
        line: "지금 당장은 아니지만 흐름은 분명히 바뀌고 있습니다. 앞으로 1~2년이 판을 새로 짜기 좋은 시기입니다."
      };
    if (score >= 42)
      return {
        label: "관망이 유리한 구간",
        head: "아직은 안에서 챙길 것이 남았습니다",
        line: "지금의 답답함은 시기적 정체일 가능성이 큽니다. 조건을 만들어 두고 때를 기다리는 편이 유리합니다."
      };
    return {
      label: "잔류가 유리한 구간",
      head: "지금 나가면 손해가 큽니다",
      line: "현재 자리에서 쌓이는 것이 생각보다 많습니다. 이동보다는 안에서의 재배치를 먼저 시도해야 할 때입니다."
    };
  }

  /* ---------------- 향후 3년 세운 타이밍 ---------------- */
  function relateGan(chart, ganIdx) {
    var meOh = GAN_OH[chart.dayGan];
    var meYang = isYang(chart.dayGan);
    var t = GAN_OH[ganIdx];
    var same = isYang(ganIdx) === meYang;
    if (t === meOh) return same ? "비견" : "겁재";
    if (t === (meOh + 1) % 5) return same ? "식신" : "상관";
    if (t === (meOh + 2) % 5) return same ? "편재" : "정재";
    if (t === (meOh + 3) % 5) return same ? "편관" : "정관";
    return same ? "편인" : "정인";
  }

  var YEAR_MEANING = {
    비견: { s: 68, t: "독립·동료", m: "내 힘으로 밀어붙이기 좋은 해. 동료·파트너와의 협업에서 기회가 열립니다." },
    겁재: { s: 62, t: "경쟁·확장", m: "경쟁이 치열해지는 해. 승부를 걸 수 있지만 금전 손실과 사람 문제를 조심해야 합니다." },
    식신: { s: 74, t: "전문성·몰입", m: "실력이 결과로 드러나는 해. 준비해온 것을 세상에 내놓기 좋습니다." },
    상관: { s: 82, t: "이탈·전환", m: "판을 갈아엎고 싶은 마음이 가장 강해지는 해. 이직·독립의 실행 시기로 적합합니다." },
    편재: { s: 78, t: "기회·수익", m: "새로운 수익 루트가 열리는 해. 사업·부업·이직 제안이 들어오기 쉽습니다." },
    정재: { s: 58, t: "안정·급여", m: "꾸준한 수입과 실속을 챙기는 해. 큰 모험보다 내실을 다지기 좋습니다." },
    편관: { s: 46, t: "압박·시험", m: "책임과 부담이 몰리는 해. 견디면 위상이 오르지만 건강과 번아웃을 조심해야 합니다." },
    정관: { s: 40, t: "승진·안정", m: "조직 안에서 인정받기 좋은 해. 지금 나가면 아까운 기회를 놓칠 수 있습니다." },
    편인: { s: 52, t: "재정비·학습", m: "속도를 늦추고 다시 배우는 해. 자격·기술 준비에 시간을 쓰기 좋습니다." },
    정인: { s: 48, t: "충전·자격", m: "쉬어가며 내공을 쌓는 해. 무리한 확장보다 회복과 준비가 어울립니다." }
  };

  function computeTimeline(chart, fromYear, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var yr = fromYear + i;
      var idx = (((yr - 4) % 60) + 60) % 60;
      var g = idx % 10;
      var j = idx % 12;
      var rel = relateGan(chart, g);
      var info = YEAR_MEANING[rel];
      // 사주 원국 성향에 따라 ±보정
      var adj = 0;
      if (chart.group.식상 >= 3 && (rel === "상관" || rel === "식신")) adj += 6;
      if (chart.group.관성 >= 3 && (rel === "정관" || rel === "편관")) adj -= 6;
      out.push({
        year: yr,
        ganji: GAN[g] + JI[j],
        ganjiH: GAN_H[g] + JI_H[j],
        zodiac: ZODIAC[j],
        sipsung: rel,
        theme: info.t,
        score: Math.max(15, Math.min(95, info.s + adj)),
        message: info.m
      });
    }
    return out;
  }

  /* ---------------- 적성 직군 ---------------- */
  var OH_JOBS = [
    { oh: "목", jobs: ["교육·강의", "기획·전략", "인사·조직문화", "출판·콘텐츠", "브랜딩"] },
    { oh: "화", jobs: ["마케팅·광고", "IT·개발", "디자인", "방송·미디어", "영업"] },
    { oh: "토", jobs: ["부동산", "건설·설비", "컨설팅", "중개·플랫폼", "총무·운영"] },
    { oh: "금", jobs: ["금융·투자", "법무·회계", "제조·엔지니어링", "의료", "품질·감사"] },
    { oh: "수", jobs: ["데이터·연구", "유통·물류", "무역", "기획재무", "서비스·CS"] }
  ];

  function pickJobs(chart) {
    // 일간을 생해주는 오행 + 일간이 생하는 오행 중심으로 직군 추천
    var meOh = GAN_OH[chart.dayGan];
    var produce = (meOh + 1) % 5; // 식상 - 표현 영역
    var support = (meOh + 4) % 5; // 인성 - 기반 영역
    var wealth = (meOh + 2) % 5;  // 재성 - 수익 영역
    var primary = OH_JOBS[produce];
    var secondary = OH_JOBS[wealth];
    var base = OH_JOBS[support];
    return {
      primary: { oh: primary.oh, jobs: primary.jobs.slice(0, 3), why: "타고난 재능이 가장 자연스럽게 흘러나오는 영역입니다." },
      secondary: { oh: secondary.oh, jobs: secondary.jobs.slice(0, 3), why: "노력이 수익으로 직결되기 쉬운 영역입니다." },
      base: { oh: base.oh, jobs: base.jobs.slice(0, 2), why: "힘들 때 나를 지탱해주는 안전한 기반 영역입니다." }
    };
  }

  /* ---------------- 십성 상세 해설 ---------------- */
  var SS_DESC = {
    비견: "자립심과 주체성. 남 밑에서보다 대등한 위치에서 힘이 납니다.",
    겁재: "추진력과 승부욕. 확장에 강하지만 손실 관리가 관건입니다.",
    식신: "몰입과 전문성. 꾸준히 파고들어 결과를 만들어냅니다.",
    상관: "표현력과 재능. 틀을 벗어나 새로운 방식을 만들어냅니다.",
    편재: "사업 감각과 기회 포착. 유동적인 수익 구조에 강합니다.",
    정재: "성실함과 관리 능력. 안정적인 수입 구조를 잘 만듭니다.",
    편관: "위기 대응력과 통솔력. 압박 속에서 오히려 강해집니다.",
    정관: "책임감과 규율. 조직에서 신뢰를 쌓아 올라갑니다.",
    편인: "직관과 통찰. 남들이 보지 못하는 각도를 발견합니다.",
    정인: "학습력과 안정감. 지식과 자격이 곧 무기가 됩니다."
  };

  /* ---------------- 실행 전략 ---------------- */
  function buildActions(chart, type, score, timeline) {
    var best = timeline.slice().sort(function (a, b) { return b.score - a.score; })[0];
    var acts = [];

    if (score >= 78) {
      acts.push({
        h: "3개월 안에 '나가는 조건'을 문서로 만드세요",
        p: "감정이 아니라 숫자로 결정해야 합니다. 최소 생활비 × 6개월, 목표 연봉, 포기 못 할 조건 3가지를 적어두면 충동이 전략으로 바뀝니다."
      });
    } else if (score >= 60) {
      acts.push({
        h: "지금은 '이력서를 여는 시기'입니다",
        p: "당장 사표를 내는 대신 시장에서 내 값을 확인하세요. 면접 3번만 봐도 지금 자리의 가치가 객관적으로 보입니다."
      });
    } else {
      acts.push({
        h: "나가기 전에 '안에서 옮기기'를 먼저 시도하세요",
        p: "부서 이동, 직무 전환, 프로젝트 변경만으로도 답답함의 상당 부분이 해소되는 구조입니다. 이동 비용 없이 환경을 바꾸는 방법입니다."
      });
    }

    acts.push({
      h: best.year + "년(" + best.ganji + ")이 가장 유리한 전환점입니다",
      p: best.message + " 이 시기에 맞춰 준비를 끝내두면 같은 노력으로 더 좋은 결과를 얻습니다."
    });

    if (chart.group.인성 >= 3) {
      acts.push({
        h: "공부가 도피가 되지 않게 기한을 거세요",
        p: "배움의 기운이 강한 사주입니다. 자격증·대학원은 분명 무기가 되지만, '준비 중'이라는 상태에 머무는 시간이 길어지면 시장 감각이 무뎌집니다."
      });
    } else if (chart.group.재성 >= 3) {
      acts.push({
        h: "연봉 협상 테이블을 반드시 만드세요",
        p: "돈에 정직하게 반응하는 사주입니다. 보상이 맞춰지지 않으면 어떤 명분도 오래 가지 않습니다. 옮기든 남든 숫자를 먼저 확정하세요."
      });
    } else {
      acts.push({
        h: "혼자 결정하지 말고 3명에게 물어보세요",
        p: "이미 그 길을 지나온 사람, 지금 같은 고민 중인 사람, 나를 오래 본 사람. 세 시선이 겹치는 지점이 대개 정답에 가깝습니다."
      });
    }

    return acts;
  }

  /* ---------------- 최종 리포트 ---------------- */
  function buildReport(input) {
    var chart = computeChart(input);
    var type = decideType(chart);
    var score = computeExitScore(chart);
    var verdict = exitVerdict(score);
    var timeline = computeTimeline(chart, 2026, 3);
    var jobs = pickJobs(chart);
    var actions = buildActions(chart, type, score, timeline);

    // 강한 십성 상위 3개
    var ssTop = Object.keys(chart.ss)
      .map(function (k) { return { name: k, n: chart.ss[k], desc: SS_DESC[k] }; })
      .filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 3);

    return {
      chart: chart,
      type: type,
      score: score,
      verdict: verdict,
      timeline: timeline,
      jobs: jobs,
      actions: actions,
      ssTop: ssTop
    };
  }

  /* ---------------- 표시용 헬퍼 ---------------- */
  function pillarText(p) {
    if (!p) return { ko: "미상", hanja: "－", ohGan: null, ohJi: null };
    return {
      ko: GAN[p.gan] + JI[p.ji],
      hanja: GAN_H[p.gan] + JI_H[p.ji],
      gan: GAN[p.gan],
      ji: JI[p.ji],
      ganH: GAN_H[p.gan],
      jiH: JI_H[p.ji],
      ohGan: OH[GAN_OH[p.gan]],
      ohJi: OH[JI_OH[p.ji]],
      ohGanIdx: GAN_OH[p.gan],
      ohJiIdx: JI_OH[p.ji]
    };
  }

  function ilganName(chart) {
    return GAN[chart.dayGan] + OH[GAN_OH[chart.dayGan]] + " 일간";
  }

  /* =========================================================
     대운 / 세운 / 월운  (직장 변화 흐름 계산의 기반)
     ========================================================= */

  /* 두 날짜 사이 일수 */
  function daysBetween(y1, m1, d1, y2, m2, d2) {
    return toJDN(y2, m2, d2) - toJDN(y1, m1, d1);
  }

  /* 대운: 방향(순행/역행), 대운수, 각 구간 간지
     - 양남·음녀 → 순행 / 음남·양녀 → 역행
     - 대운수 = 순행이면 다음 절입까지, 역행이면 직전 절입부터의 일수 ÷ 3 */
  function computeDaewoon(chart, gender, count) {
    var ST = global.SolarTerms;
    var inp = chart.input;
    var y = inp.year, m = inp.month, d = inp.day;
    var yearGanYang = isYang(chart.pillars.year.gan);
    var male = (gender || "M") === "M";
    var forward = (yearGanYang && male) || (!yearGanYang && !male);

    // 앞뒤 절입 찾기
    var prev = null, next = null;
    var scan = [y - 1, y, y + 1];
    var all = [];
    scan.forEach(function (yy) {
      var t = ST && ST.terms(yy);
      if (t) t.forEach(function (x) { all.push({ y: yy, mo: x.mo, d: x.d, h: x.h, mi: x.mi }); });
    });
    all.sort(function (a, b) {
      return toJDN(a.y, a.mo, a.d) * 1440 + a.h * 60 + a.mi -
             (toJDN(b.y, b.mo, b.d) * 1440 + b.h * 60 + b.mi);
    });
    var nowKey = toJDN(y, m, d) * 1440 + (inp.hourKnown ? inp.hour : 12) * 60;
    for (var i = 0; i < all.length; i++) {
      var k = toJDN(all[i].y, all[i].mo, all[i].d) * 1440 + all[i].h * 60 + all[i].mi;
      if (k <= nowKey) prev = all[i];
      if (k > nowKey) { next = all[i]; break; }
    }

    var days = 3;
    if (forward && next) days = daysBetween(y, m, d, next.y, next.mo, next.d);
    else if (!forward && prev) days = daysBetween(prev.y, prev.mo, prev.d, y, m, d);
    var startAge = Math.max(1, Math.round(days / 3)) || 1;

    // 월주에서 순행/역행으로 진행
    var mIdx = chart.pillars.month.gan * 1; // 간지 조합을 60갑자 index로 환산
    var monthSix = sixtyIndex(chart.pillars.month.gan, chart.pillars.month.ji);
    var out = [];
    var n = count || 8;
    for (var s = 1; s <= n; s++) {
      var idx = (((monthSix + (forward ? s : -s)) % 60) + 60) % 60;
      out.push({
        order: s,
        ageFrom: startAge + (s - 1) * 10,
        ageTo: startAge + s * 10 - 1,
        gan: idx % 10,
        ji: idx % 12,
        ganji: GAN[idx % 10] + JI[idx % 12],
        sipsung: relateGan(chart, idx % 10)
      });
    }
    return { forward: forward, startAge: startAge, list: out };
  }

  /* 천간·지지 → 60갑자 index */
  function sixtyIndex(gan, ji) {
    for (var i = 0; i < 60; i++) if (i % 10 === gan && i % 12 === ji) return i;
    return 0;
  }

  /* 특정 시점의 대운 구간 */
  function daewoonAt(dw, age) {
    for (var i = 0; i < dw.list.length; i++) {
      if (age >= dw.list[i].ageFrom && age <= dw.list[i].ageTo) return dw.list[i];
    }
    return dw.list[0];
  }

  /* 향후 N개월 월운 — 절기월 기준 간지와 십성 */
  function computeMonthlyFlow(chart, fromYear, fromMonth, months) {
    var out = [];
    for (var i = 0; i < months; i++) {
      var mo = fromMonth + i;
      var yr = fromYear + Math.floor((mo - 1) / 12);
      mo = ((mo - 1) % 12) + 1;

      // 그 달 15일 기준의 절기월 간지 (달 대표값)
      var ctx = getTermContext(yr, mo, 15, 12, 0);
      var yIdx = (((ctx.sajuYear - 4) % 60) + 60) % 60;
      var yGan = yIdx % 10;
      var inWolGan = [2, 4, 6, 8, 0][yGan % 5];
      var mGan = (inWolGan + ((ctx.monthJi - 2 + 12) % 12)) % 10;

      out.push({
        year: yr,
        month: mo,
        gan: mGan,
        ji: ctx.monthJi,
        ganji: GAN[mGan] + JI[ctx.monthJi],
        sipsung: relateGan(chart, mGan),
        branchSipsung: relateJi(chart, ctx.monthJi)
      });
    }
    return out;
  }

  /* 지지 기준 십성 */
  function relateJi(chart, jiIdx) {
    var meOh = GAN_OH[chart.dayGan];
    var meYang = isYang(chart.dayGan);
    var t = JI_OH[jiIdx];
    var same = isYang(jiIdx) === meYang;
    if (t === meOh) return same ? "비견" : "겁재";
    if (t === (meOh + 1) % 5) return same ? "식신" : "상관";
    if (t === (meOh + 2) % 5) return same ? "편재" : "정재";
    if (t === (meOh + 3) % 5) return same ? "편관" : "정관";
    return same ? "편인" : "정인";
  }

  /* 세운 (연 단위) */
  function computeYearly(chart, fromYear, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var yr = fromYear + i;
      var idx = (((yr - 4) % 60) + 60) % 60;
      out.push({
        year: yr,
        gan: idx % 10,
        ji: idx % 12,
        ganji: GAN[idx % 10] + JI[idx % 12],
        sipsung: relateGan(chart, idx % 10),
        branchSipsung: relateJi(chart, idx % 12)
      });
    }
    return out;
  }

  global.Saju = {
    GAN: GAN, GAN_H: GAN_H, JI: JI, JI_H: JI_H,
    OH: OH, OH_COLOR: OH_COLOR,
    GAN_OH: GAN_OH, JI_OH: JI_OH,
    buildReport: buildReport,
    computeChart: computeChart,
    pillarText: pillarText,
    ilganName: ilganName,
    computeDaewoon: computeDaewoon,
    daewoonAt: daewoonAt,
    computeMonthlyFlow: computeMonthlyFlow,
    computeYearly: computeYearly,
    relateGan: relateGan,
    relateJi: relateJi,
    sixtyIndex: sixtyIndex
  };
})(window);
