// ─────────────────────────────────────────────
// 목업 데이터 스키마
// 나중에 역할2(인증서버) Socket.io 이벤트 / 역할2·DB 통계 API 응답과
// 필드명을 최대한 맞춰서, 실연동 시 fetch 함수만 갈아끼우면 되게 설계함.
// ─────────────────────────────────────────────

export type Profile = "Low" | "High" | "Zero-Trust";
export type LoginStatus = "normal" | "alert";
export type RuleId = "R-01" | "R-02" | "R-03" | "R-04" | "R-05" | "R-06";

export interface LoginEvent {
  id: string;
  sessionId: string;
  userId: string;
  ip: string;
  lat: number;
  lng: number;
  country: string;
  city: string;
  time: string; // ISO
  profile: Profile;
  status: LoginStatus;
  ruleId?: RuleId; // status === 'alert'일 때만 존재 (Wazuh 룰 기반, 서지영 쪽)
  reason?: string; // 오시은 쪽 login:anomaly의 이상탐지 사유 원문 (R-01~06 룰 코드 아님, 자유 텍스트)
}

export interface AlertEvent {
  id: string;
  sessionId: string;
  ruleId?: RuleId; // Wazuh 룰(R-01~06) 기반일 때만 존재 (서지영 쪽). 오시은 쪽 실시간 알림엔 없음.
  ruleLabel: string; // 룰 라벨 또는 오시은 쪽 reason 원문
  ip: string;
  country: string;
  time: string;
  severity: "high" | "medium";
}

export const RULE_LABELS: Record<RuleId, string> = {
  "R-01": "브루트포스",
  "R-02": "포트스캔",
  "R-03": "지리적 이상 접속",
  "R-04": "비정상 시간대 접속",
  "R-05": "블랙리스트 IP 재접속",
  "R-06": "SQLi/XSS 패턴",
};

export const mockLoginEvents: LoginEvent[] = [
  {
    id: "evt-1",
    sessionId: "sess-9001",
    userId: "kim***",
    ip: "121.66.xx.xx",
    lat: 37.5665,
    lng: 126.978,
    country: "대한민국",
    city: "서울",
    time: new Date(Date.now() - 2 * 60000).toISOString(),
    profile: "Low",
    status: "normal",
  },
  {
    id: "evt-2",
    sessionId: "sess-9002",
    userId: "kim***",
    ip: "203.0.113.55",
    lat: 55.7558,
    lng: 37.6173,
    country: "러시아",
    city: "모스크바",
    time: new Date(Date.now() - 40000).toISOString(),
    profile: "Zero-Trust",
    status: "alert",
    ruleId: "R-03",
  },
  {
    id: "evt-3",
    sessionId: "sess-9003",
    userId: "unknown",
    ip: "198.51.100.23",
    lat: 39.9042,
    lng: 116.4074,
    country: "중국",
    city: "베이징",
    time: new Date(Date.now() - 15000).toISOString(),
    profile: "High",
    status: "alert",
    ruleId: "R-01",
  },
];

export const mockAlerts: AlertEvent[] = mockLoginEvents
  .filter((e) => e.status === "alert")
  .map((e) => ({
    id: `alert-${e.id}`,
    sessionId: e.sessionId,
    ruleId: e.ruleId!,
    ruleLabel: RULE_LABELS[e.ruleId!],
    ip: e.ip,
    country: e.country,
    time: e.time,
    severity: e.ruleId === "R-01" ? "high" : "medium",
  }));

// 시간대별 로그인 추이 (24h)
export const mockLoginTrend = Array.from({ length: 24 }, (_, h) => ({
  hour: `${String(h).padStart(2, "0")}시`,
  normal: Math.floor(Math.random() * 40) + 10,
  alert: Math.floor(Math.random() * 6),
}));

// 룰별 탐지 건수
export const mockRuleHits = (Object.keys(RULE_LABELS) as RuleId[]).map((id) => ({
  ruleId: id,
  label: RULE_LABELS[id],
  count: Math.floor(Math.random() * 20) + 1,
}));

// 프로파일 분포
export const mockProfileDist = [
  { profile: "Low", count: 62 },
  { profile: "High", count: 24 },
  { profile: "Zero-Trust", count: 14 },
];
