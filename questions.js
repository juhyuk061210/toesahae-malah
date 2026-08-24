/* =========================================================
   질문지 — 결제 전 10문항 + 결제 후 8문항
   ---------------------------------------------------------
   설계 원칙 (조사·검증에서 확정된 것):

   1) 결론을 정하는 것은 답변 조합이다. 사주는 어휘와 시기만 준다.
   2) 결제 전에는 자유 서술을 두지 않는다 — 이탈의 가장 큰 원인이다.
      서술은 결제 후로 옮긴다. 돈을 낸 뒤에는 성의가 붙는다.
   3) "잘 버틴 것"을 묻는 확언 문항(A10)은 아픈 질문들 *뒤*,
      결제 버튼 *앞*에 둔다. 확언은 위협 이후에 오면 효과가 없다.
   4) 이직 의도(A8)는 뺄 수 없다 — 메타분석에서 단일 최강 예측변수.
   5) "계산해본 적 없다" 류의 선택지가 이 질문지의 금맥이다.
      없다는 답 자체가 강한 정보다.
   ========================================================= */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------
     Phase A — 결제 전. 전부 탭 선택, 목표 2분.
     --------------------------------------------------------- */
  var PHASE_A = [
    {
      id: "quitFrequency",
      no: 1,
      title: "요즘 '퇴사'라는 단어가<br />머릿속에 떠오르는 빈도는?",
      type: "single",
      options: [
        { v: "daily",    label: "거의 매일" },
        { v: "w3",       label: "주 3회 이상" },
        { v: "w1",       label: "주 1회쯤" },
        { v: "m_few",    label: "한 달에 몇 번" },
        { v: "event",    label: "특별한 일이 있을 때만" }
      ]
    },
    {
      id: "actions",
      no: 2,
      title: "지난 3개월 동안<br />실제로 한 것을 모두 골라주세요",
      desc: "해당하는 것을 여러 개 고르셔도 됩니다.",
      type: "multi",
      /* tier 는 화면에 표시하지 않는다. 사용자가 '아래쪽이 진짜'라고
         눈치채면 응답이 왜곡된다. */
      options: [
        { v: "browse",   label: "채용 공고를 들여다봤다",                    tier: "prep" },
        { v: "ask",      label: "지인·전 동료에게 \"요즘 거기 어때\" 물어봤다", tier: "prep" },
        { v: "openCv",   label: "이력서 파일을 열어봤다 (수정은 안 함)",       tier: "prep" },
        { v: "calcRough",label: "퇴사 후 생활비를 대충 계산해봤다",           tier: "prep" },
        { v: "editCv",   label: "이력서·경력기술서를 실제로 고쳤다",          tier: "active" },
        { v: "profile",  label: "채용 플랫폼 프로필을 업데이트했다",          tier: "active" },
        { v: "headhunt", label: "헤드헌터 연락에 답장했다",                   tier: "active" },
        { v: "apply",    label: "한 곳 이상 실제로 지원했다",                 tier: "active" },
        { v: "interview",label: "면접을 봤다",                               tier: "active" },
        { v: "study",    label: "자격증·강의·공부를 등록했다",                tier: "active" },
        { v: "family",   label: "가족·배우자와 진지하게 상의했다",            tier: "etc" },
        { v: "none",     label: "아무것도 하지 않았다",                       tier: "none", exclusive: true }
      ]
    },
    {
      id: "lastAction",
      no: 3,
      title: "그중 가장 최근에 한 것은<br />언제였나요?",
      type: "single",
      /* actions 가 '아무것도 안 함'이면 건너뛴다 */
      skipIf: function (a) {
        return a.actions && a.actions.length === 1 && a.actions[0] === "none";
      },
      skipValue: "never",
      options: [
        { v: "thisWeek", label: "이번 주" },
        { v: "m1",       label: "한 달 안" },
        { v: "m3",       label: "3개월 안" },
        { v: "m6_12",    label: "6개월~1년 전" },
        { v: "y1over",   label: "1년 넘었다" }
      ]
    },
    {
      id: "selfLabel",
      no: 4,
      title: "지금의 당신을 가장 가깝게<br />설명하는 문장 하나를 고른다면?",
      type: "single",
      options: [
        { v: "enough",    label: "참을 만큼 참았다" },
        { v: "tired",     label: "아직 참을 수는 있는데, 지쳤다" },
        { v: "noLearn",   label: "여기서 더 배울 게 없다" },
        { v: "nowhere",   label: "여기 말고 갈 데가 없을까 봐 무섭다" },
        { v: "myFault",   label: "회사보다 내가 문제인 것 같다" },
        { v: "unknown",   label: "내가 뭘 원하는지 모르겠다는 게 제일 답답하다" }
      ]
    },
    {
      id: "drain",
      no: 5,
      title: "가장 지치게 하는 것과<br />가장 상관없는 것을 골라주세요",
      desc: "같은 목록에서 하나씩 고릅니다. 아래쪽은 넘기셔도 됩니다.",
      type: "bestworst",
      shuffle: true,
      options: [
        { v: "person",  label: "특정한 사람 한 명" },
        { v: "culture", label: "팀·조직의 분위기와 일하는 방식" },
        { v: "load",    label: "일의 양과 시간" },
        { v: "meaning", label: "일에서 의미를 못 느낌" },
        { v: "fair",    label: "평가·승진이 공정하지 않음" },
        { v: "money",   label: "돈" },
        { v: "growth",  label: "성장이 멈춘 느낌" },
        { v: "future",  label: "여기 있으면 나중에 갈 곳이 없어질 것 같은 불안" }
      ]
    },
    {
      id: "miracle",
      no: 6,
      title: "딱 한 가지가 달라져서<br />\"어? 그만둘 생각이 사라졌네\" 한다면?",
      desc: "내일 출근했는데 그 한 가지가 바뀌어 있다면요.",
      type: "single",
      options: [
        { v: "person",  label: "그 사람이 없다" },
        { v: "job",     label: "내가 하는 일이 바뀐다" },
        { v: "pay",     label: "연봉이 확 오른다" },
        { v: "fair",    label: "평가와 승진이 납득 가게 굴러간다" },
        { v: "time",    label: "출퇴근·근무시간·재택이 바뀐다" },
        { v: "meaning", label: "내 일이 의미 있게 느껴진다" },
        { v: "nothing", label: "무엇이 바뀌어도 소용없을 것 같다" }
      ]
    },
    {
      id: "runway",
      no: 7,
      title: "지금 소득이 0원이 되면<br />생활이 유지되는 기간은?",
      desc: "정확한 금액은 묻지 않습니다. 감으로 골라주세요.",
      type: "single",
      options: [
        { v: "under1",  label: "1개월도 못 버틴다" },
        { v: "m1_3",    label: "1~3개월" },
        { v: "m3_6",    label: "3~6개월" },
        { v: "m6_12",   label: "6개월~1년" },
        { v: "y1over",  label: "1년 이상" },
        { v: "never",   label: "계산해본 적 없다" }
      ]
    },
    {
      id: "deadline",
      no: 8,
      title: "아무것도 달라지지 않는다면<br />언제까지 버틸 생각인가요?",
      type: "single",
      options: [
        { v: "thisMonth", label: "이번 달 안에 나간다" },
        { v: "m3",        label: "3개월" },
        { v: "m6",        label: "6개월" },
        { v: "y1",        label: "1년" },
        { v: "more",      label: "그 이상도 버틸 것 같다" },
        { v: "never",     label: "그런 기한을 생각해본 적이 없다" }
      ]
    },
    {
      id: "pastQuit",
      no: 9,
      title: "이전에 회사를 그만둔 적이 있나요?<br />가장 최근 퇴사의 결정적 계기는?",
      type: "single",
      options: [
        { v: "first",     label: "없다 (지금이 첫 직장)" },
        { v: "hadNext",   label: "다음이 정해져서 나왔다" },
        { v: "burnout",   label: "더는 못 버텨서, 다음 없이 나왔다" },
        { v: "person",    label: "특정한 사람 때문에 나왔다" },
        { v: "career",    label: "커리어를 바꾸려고 나왔다" },
        { v: "company",   label: "회사 사정으로 어쩔 수 없었다" }
      ]
    },
    {
      id: "endured",
      no: 10,
      title: "지난 1년, 남들은 잘 모르지만<br />스스로는 \"이건 잘 버텼다\" 싶은 게 있다면?",
      /* 앞의 9문항이 전부 아픈 질문이라 여기가 회복 지점이 된다.
         그리고 결제 버튼 직전에 감정 곡선을 올려둔다. */
      type: "single",
      options: [
        { v: "quiet",   label: "티 안 나는 일을 계속 처리했다" },
        { v: "temper",  label: "감정을 폭발시키지 않았다" },
        { v: "team",    label: "팀·후배를 지켰다" },
        { v: "unsung",  label: "성과를 냈는데 인정은 못 받았다" },
        { v: "health",  label: "건강·가정을 지켰다" },
        { v: "money",   label: "돈을 모았다" },
        { v: "none",    label: "솔직히 없다" }
      ]
    }
  ];

  /* ---------------------------------------------------------
     Phase B — 결제 후. 전 문항 건너뛰기 허용.
     --------------------------------------------------------- */
  var PHASE_B = [
    {
      id: "scene",
      no: 1,
      title: "가장 최근에 \"아 진짜 그만둬야겠다\"고<br />생각한 순간이 언제였나요?",
      desc: "그때 무슨 일이 있었는지 편하게 적어주세요.",
      type: "text",
      placeholder: "언제 / 어디서 / 누가 있었고 / 무슨 말이 오갔는지",
      max: 400
    },
    {
      id: "sceneWhen",
      no: 1,
      sub: true,
      title: "그게 언제였나요?",
      type: "single",
      options: [
        { v: "today",   label: "오늘" },
        { v: "week",    label: "이번 주" },
        { v: "month",   label: "이번 달" },
        { v: "over3m",  label: "3개월 이상 전" },
        { v: "forget",  label: "기억이 안 난다" }
      ]
    },
    {
      id: "regretStay",
      no: 2,
      title: "1년 뒤에도 지금 이 자리에<br />그대로 있다면 얼마나 후회할까요?",
      type: "scale",
      min: 0, max: 10,
      minLabel: "전혀 후회 없음", maxLabel: "많이 후회함"
    },
    {
      id: "regretLeave",
      no: 3,
      title: "반대로, 나갔는데 다음 자리가<br />지금보다 못하다면 얼마나 후회할까요?",
      type: "scale",
      min: 0, max: 10,
      minLabel: "전혀 후회 없음", maxLabel: "많이 후회함"
    },
    {
      id: "importance",
      no: 4,
      title: "회사를 옮기는 게 지금 당신에게<br />얼마나 중요한 일인가요?",
      type: "scale",
      min: 0, max: 10,
      minLabel: "전혀 안 중요", maxLabel: "매우 중요",
      /* 숫자는 위치일 뿐이고 정보는 후속에 있다 */
      followUp: {
        low:  { upTo: 6, title: "0이 아니라 그 숫자를 고른 이유는?", max: 200 },
        high: { from: 7, title: "10이 되려면 무엇이 더 필요할까요?", max: 200 }
      }
    },
    {
      id: "confidence",
      no: 5,
      title: "지금 마음먹으면 6개월 안에<br />실제로 옮길 수 있다고 생각하나요?",
      type: "scale",
      min: 0, max: 10,
      minLabel: "전혀 자신 없음", maxLabel: "충분히 가능"
    },
    {
      id: "constraint",
      no: 6,
      title: "다음이 정해지지 않아도<br />나갈 수 있나요?",
      type: "single",
      options: [
        { v: "ready",    label: "이미 그럴 각오는 되어 있다" },
        { v: "buffer3",  label: "3개월치 생활비까지는 버틸 수 있다" },
        { v: "needNext", label: "다음이 정해져야만 가능하다" },
        { v: "cannot",   label: "가족·대출 때문에 사실상 불가능하다" }
      ]
    },
    {
      id: "exception",
      no: 7,
      title: "지금 회사에서 마지막으로<br />\"그래도 이건 할 만하다\" 느낀 게 언제인가요?",
      type: "single",
      options: [
        { v: "thisWeek", label: "이번 주에도 있었다" },
        { v: "thisMonth",label: "이번 달 안에" },
        { v: "m3",       label: "3개월쯤 전" },
        { v: "m6over",   label: "6개월도 더 됐다" },
        { v: "never",    label: "입사한 뒤로 한 번도 없다" }
      ]
    },
    {
      id: "depth",
      no: 8,
      title: "이 리포트가 어디까지<br />짚어주면 좋겠나요?",
      /* 아픈 문장을 열 수 있는 권한을 사용자가 직접 준다 */
      type: "single",
      options: [
        { v: "all",      label: "내가 못 보고 있는 것까지 다 짚어줬으면" },
        { v: "evidence", label: "아픈 얘기여도 근거가 있으면 괜찮다" },
        { v: "gentle",   label: "너무 아프지 않게, 방향만 알려줬으면" },
        { v: "organize", label: "지금은 판단보다 정리가 필요하다" }
      ]
    }
  ];

  /* 라벨 조회 — 리포트에서 "당신은 ~라고 답하셨습니다" 에 쓴다 */
  function labelOf(qid, value) {
    var all = PHASE_A.concat(PHASE_B), i, q, k;
    for (i = 0; i < all.length; i++) {
      q = all[i];
      if (q.id !== qid || !q.options) continue;
      for (k = 0; k < q.options.length; k++) {
        if (q.options[k].v === value) return q.options[k].label;
      }
    }
    return value;
  }

  /* 여러 선택의 라벨을 한꺼번에 */
  function labelsOf(qid, values) {
    return (values || []).map(function (v) { return labelOf(qid, v); });
  }

  /* 행동 문항의 층 분류 — 탐지 규칙이 계속 쓴다 */
  function actionTiers(picked) {
    var q = PHASE_A.filter(function (x) { return x.id === "actions"; })[0];
    var byV = {};
    q.options.forEach(function (o) { byV[o.v] = o.tier; });
    var out = { prep: [], active: [], etc: [], none: false };
    (picked || []).forEach(function (v) {
      var t = byV[v];
      if (t === "none") out.none = true;
      else if (out[t]) out[t].push(v);
    });
    return out;
  }

  function find(qid) {
    return PHASE_A.concat(PHASE_B).filter(function (q) { return q.id === qid; })[0] || null;
  }

  global.Questions = {
    PHASE_A: PHASE_A,
    PHASE_B: PHASE_B,
    labelOf: labelOf,
    labelsOf: labelsOf,
    actionTiers: actionTiers,
    find: find,
    countA: PHASE_A.length,
    countB: PHASE_B.filter(function (q) { return !q.sub; }).length
  };
})(typeof window !== "undefined" ? window : global);
