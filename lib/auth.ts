"use client";

// ─────────────────────────────────────────────
// 대시보드 자체 접근 제어 (관리자 전용 로그인)
// ⚠️ 이건 오시은 인증서버(Zero-Watch 서비스 로그인)랑은 완전히 별개.
// 대시보드 화면 자체를 관리자만 보게 막는 간단한 게이트임.
//
// 자동 로그아웃 없음: 세션 만료/타임아웃 타이머 없고, localStorage에 로그인 상태를
// 저장해서 브라우저를 껐다 켜도 로그인 상태가 유지됨. 로그아웃 버튼을 직접 눌러야만 풀림.
// ─────────────────────────────────────────────

const STORAGE_KEY = "zw_dashboard_auth";

// 관리자 계정 (데모/학교 프로젝트용 — 실제 서비스라면 서버 인증으로 바꿔야 함)
// 환경변수로 바꾸고 싶으면 .env.local에 NEXT_PUBLIC_ADMIN_USERNAME / NEXT_PUBLIC_ADMIN_PASSWORD 추가
const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "zerowatch1234";

export function login(username: string, password: string): boolean {
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, loggedInAt: Date.now() }));
    return true;
  }
  return false;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false; // SSR 중에는 항상 false (클라이언트에서만 판단)
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function getCurrentUsername(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw).username ?? null;
  } catch {
    return null;
  }
}
