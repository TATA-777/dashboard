import { NextResponse } from "next/server";

// ─────────────────────────────────────────────
// 룰별(R-01~R-06) 탐지 건수 - mock
//
// ⚠️ 룰 라벨은 프로젝트3_계획서(6장 탐지 룰 표) 및 mock/mockData.ts의
// RULE_LABELS와 정확히 동일하게 맞춤 — 서지영(탐지·모니터링) 담당
// 산출물 기준. 임의로 다른 이름으로 바꾸지 말 것 (계획서·발표자료와
// 대시보드 화면이 서로 다른 룰 이름을 보여주면 안 되므로).
//
// 나중에 서지영 쪽 Wazuh 탐지 로그 집계 API가 준비되면, 아래 return을
// 그 API를 서버사이드에서 fetch해서 전달하는 프록시로 바꾸면 됨.
// ─────────────────────────────────────────────

export async function GET() {
  return NextResponse.json(
    {
      rules: [
        { ruleId: "R-01", label: "브루트포스", count: 12 },
        { ruleId: "R-02", label: "포트스캔", count: 34 },
        { ruleId: "R-03", label: "지리적 이상 접속", count: 8 },
        { ruleId: "R-04", label: "비정상 시간대 접속", count: 19 },
        { ruleId: "R-05", label: "블랙리스트 IP 재접속", count: 5 },
        { ruleId: "R-06", label: "SQLi/XSS 패턴", count: 2 },
      ],
    },
    { status: 200 }
  );
}
