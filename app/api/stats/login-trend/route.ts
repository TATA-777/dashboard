import { NextResponse } from "next/server";

// ─────────────────────────────────────────────
// 시간대별(00시~23시) 정상/이상 로그인 접속자 수
// 오시은 인증서버(ALB) 실제 DB 집계 API를 서버사이드에서 fetch해서
// 그대로 전달하는 프록시 (profile-dist와 동일한 패턴).
//
// 시은이 서버가 장애/미배포 상태일 때 대시보드가 깨지지 않도록
// 실패 시 mock(전부 0) 값으로 fallback.
// ─────────────────────────────────────────────

const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://zw-korea-alb-1001485199.ap-northeast-2.elb.amazonaws.com";

export async function GET() {
  try {
    const res = await fetch(`${AUTH_API_BASE}/api/stats/login-trend`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("login-trend proxy error:", error);
    return NextResponse.json(
      {
        trend: Array.from({ length: 24 }, (_, i) => ({
          hour: `${String(i).padStart(2, "0")}시`,
          normal: 0,
          alert: 0,
        })),
      },
      { status: 200 }
    );
  }
}