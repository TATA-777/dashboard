import { NextRequest, NextResponse } from "next/server";

// 서지영 Wazuh 통계 API (2026-09-24 연결 확인 완료)
const WAZUH_STATS_API_BASE = "http://10.3.11.29:8088";

// ─────────────────────────────────────────────
// 룰별(R-01~R-06) 탐지 건수
//
// ⚠️ 룰 라벨은 프로젝트3_계획서(6장 탐지 룰 표) 및 mock/mockData.ts의
// RULE_LABELS와 정확히 동일하게 맞춤 — 서지영(탐지·모니터링) 담당
// 산출물 기준. 임의로 다른 이름으로 바꾸지 말 것.
//
// Wazuh API(10.3.11.29:8088)는 ruleId/count만 내려주고 label은 안 주므로,
// 여기서 라벨을 붙여서 프론트에 전달하는 프록시 역할을 함.
// Wazuh API 호출이 실패하면(네트워크 문제 등) 조용히 mock으로 폴백.
// ─────────────────────────────────────────────

const RULE_LABELS: Record<string, string> = {
  "R-01": "브루트포스",
  "R-02": "포트스캔",
  "R-03": "지리적 이상 접속",
  "R-04": "비정상 시간대 접속",
  "R-05": "블랙리스트 IP 재접속",
  "R-06": "SQLi/XSS 패턴",
};

const MOCK_FALLBACK = [
  { ruleId: "R-01", label: RULE_LABELS["R-01"], count: 12 },
  { ruleId: "R-02", label: RULE_LABELS["R-02"], count: 34 },
  { ruleId: "R-03", label: RULE_LABELS["R-03"], count: 8 },
  { ruleId: "R-04", label: RULE_LABELS["R-04"], count: 19 },
  { ruleId: "R-05", label: RULE_LABELS["R-05"], count: 5 },
  { ruleId: "R-06", label: RULE_LABELS["R-06"], count: 2 },
];

interface WazuhRuleHit {
  ruleId: string;
  count: number;
}

export async function GET(request: NextRequest) {
  // 기본은 누적(total). 나중에 프론트에서 기간 토글 만들면 ?period=today|24h로 넘기면 됨
  const period = request.nextUrl.searchParams.get("period") ?? "total";

  try {
    const res = await fetch(`${WAZUH_STATS_API_BASE}/api/rule-hits?period=${period}`, {
      cache: "no-store", // 집계값은 매번 최신으로 받아야 하므로 캐시 안 함
    });

    if (!res.ok) {
      throw new Error(`Wazuh stats API responded ${res.status}`);
    }

    const data: { rules: WazuhRuleHit[] } = await res.json();

    const rules = data.rules.map((r) => ({
      ruleId: r.ruleId,
      label: RULE_LABELS[r.ruleId] ?? r.ruleId,
      count: r.count,
    }));

    return NextResponse.json({ rules }, { status: 200 });
  } catch (err) {
    console.error("[rule-hits] Wazuh API 호출 실패, mock으로 폴백:", err);
    return NextResponse.json({ rules: MOCK_FALLBACK }, { status: 200 });
  }
}