// ─────────────────────────────────────────────
// 인증서버(역할2) REST API 호출 함수
// 실제 엔드포인트/응답 형식은 오시은이 준 "잠정 스펙" 기준이라 확정 아님.
// base URL만 .env.local에서 바꾸면 전체 반영됨.
// ─────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// next.config.js의 basePath. fetch에는 자동으로 안 붙으므로 대시보드 자체 라우트 호출 시 직접 붙인다.
const BASE_PATH = "/dashboard";

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
// 각 라우트가 서버사이드에서 오시은(login-trend/profile-dist)·
// 서지영(rule-hits, Wazuh) API를 대신 호출하는 프록시 구조.
//
// ⚠️ 9/28 수정: basePath('/dashboard')가 fetch에 자동으로 안 붙어서
// '/api/stats/...'로 나가면 ALB가 인증서버로 보내버림 → 프록시를 안 거치고
// 인증서버 응답을 받던 버그. 반드시 '/dashboard' 접두사를 붙여서 호출한다.
// ─────────────────────────────────────────────

async function statsFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_PATH}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`통계 API 요청 실패 (${res.status}): ${BASE_PATH}${path}`);
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

/** 시간대별 로그인 추이. GET /dashboard/api/stats/login-trend (대시보드 자체 라우트) */
export async function fetchLoginTrend(): Promise<LoginTrendPoint[]> {
  const data = await statsFetch<{ trend: LoginTrendPoint[] }>("/api/stats/login-trend");
  return data.trend;
}

/** 룰별 탐지 건수. GET /dashboard/api/stats/rule-hits (대시보드 자체 라우트 → Wazuh) */
export async function fetchRuleHits(): Promise<RuleHitPoint[]> {
  const data = await statsFetch<{ rules: RuleHitPoint[] }>("/api/stats/rule-hits");
  return data.rules;
}

/** 프로파일 분포. GET /dashboard/api/stats/profile-dist (대시보드 자체 라우트) */
export async function fetchProfileDist(): Promise<ProfileDistPoint[]> {
  const data = await statsFetch<{ distribution: ProfileDistPoint[] }>("/api/stats/profile-dist");
  return data.distribution;
}