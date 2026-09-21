// ─────────────────────────────────────────────
// 인증서버(역할2) REST API 호출 함수
// 실제 엔드포인트/응답 형식은 오시은이 준 "잠정 스펙" 기준이라 확정 아님.
// base URL만 .env.local에서 바꾸면 전체 반영됨.
// ─────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type ApiProfile = "LOW" | "HIGH" | "ZERO_TRUST";

interface TerminateSessionResult {
  success: boolean;
  error?: string;
}

interface SessionSummary {
  sessionId: string;
  userId: string;
  email: string;
  role: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL이 설정되지 않았습니다.");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    // 인증서버가 쿠키(세션) 기반이라 크로스오리진 요청에도 쿠키를 실어 보내야 함
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API 요청 실패 (${res.status}): ${path}`);
  }

  return res.json() as Promise<T>;
}

/**
 * 세션 강제 종료.
 * 확정 스펙(오시은, 8/27): POST /api/session/kill { sessionId, reason }
 * (userId가 아니라 sessionId 기준 — 예전 잠정 스펙에서 바뀜)
 */
export async function terminateSession(
  sessionId: string,
  reason = "대시보드 관리자 강제 종료"
): Promise<TerminateSessionResult> {
  return apiFetch<TerminateSessionResult>("/api/session/kill", {
    method: "POST",
    body: JSON.stringify({ sessionId, reason }),
  });
}

/**
 * 특정 유저의 활성 세션 목록.
 * 확정 스펙(오시은, 8/27): GET /api/sessions?userId=... → { userId, activeSessions: [...] }
 * (쿼리 파라미터 필수, 응답 필드명도 sessions가 아니라 activeSessions)
 */
export async function fetchActiveSessions(userId: string): Promise<SessionSummary[]> {
  const data = await apiFetch<{ userId: string; activeSessions: SessionSummary[] }>(
    `/api/sessions?userId=${encodeURIComponent(userId)}`
  );
  return data.activeSessions;
}

/** 유저 프로파일(Low/High/Zero-Trust) 조회. 잠정 스펙: GET /api/user/:id/profile */
export async function fetchUserProfile(userId: string): Promise<ApiProfile> {
  const data = await apiFetch<{ profile: ApiProfile }>(`/api/user/${userId}/profile`);
  return data.profile;
}

// ─────────────────────────────────────────────
// 하단 차트 3종용 통계 API
//
// ⚠️ 위 apiFetch(오시은 인증서버, 외부 ALB)와 다르게, 이 3개는
// 대시보드 "자기 자신"의 Next.js API 라우트를 호출함
// (app/api/stats/*/route.ts — app/api/geo/[ip]와 동일한 패턴).
// 브라우저 입장에서 같은 origin 요청이라 CORS/ALB 등록 문제 자체가
// 없음. 상대경로로 fetch하는 이유가 그거라, BASE_URL을 안 씀.
//
// 지금은 그 라우트들이 각각 mock 값을 반환하지만, 나중에 오시은
// (login-trend/profile-dist)·서지영(rule-hits) 쪽 실제 데이터가
// 준비되면 route.ts 안에서 서버사이드로 그 API를 fetch해서 전달하는
// 프록시로 바꾸면 됨 — 이 파일의 fetchLoginTrend 등 함수 시그니처는
// 그대로 유지되므로 useDashboardStats 훅은 손댈 필요 없음.
// ─────────────────────────────────────────────

async function statsFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`통계 API 요청 실패 (${res.status}): ${path}`);
  }
  return res.json() as Promise<T>;
}

export interface LoginTrendPoint {
  hour: string;
  normal: number;
  alert: number;
}

export interface RuleHitPoint {
  ruleId: string;
  label: string;
  count: number;
}

export interface ProfileDistPoint {
  profile: string;
  count: number;
}

/** 시간대별 로그인 추이. GET /api/stats/login-trend (대시보드 자체 라우트) */
export async function fetchLoginTrend(): Promise<LoginTrendPoint[]> {
  const data = await statsFetch<{ trend: LoginTrendPoint[] }>("/api/stats/login-trend");
  return data.trend;
}

/** 룰별 탐지 건수. GET /api/stats/rule-hits (대시보드 자체 라우트) */
export async function fetchRuleHits(): Promise<RuleHitPoint[]> {
  const data = await statsFetch<{ rules: RuleHitPoint[] }>("/api/stats/rule-hits");
  return data.rules;
}

/** 프로파일 분포. GET /api/stats/profile-dist (대시보드 자체 라우트) */
export async function fetchProfileDist(): Promise<ProfileDistPoint[]> {
  const data = await statsFetch<{ distribution: ProfileDistPoint[] }>("/api/stats/profile-dist");
  return data.distribution;
}
