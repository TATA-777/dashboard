import { NextResponse } from "next/server";

// ─────────────────────────────────────────────
// Zero Trust 신뢰도 프로파일(Low/High/Zero-Trust)별 인원 수
// 오시은 인증서버(ALB) 실제 DB 집계 API를 서버사이드에서 fetch해서
// 그대로 전달하는 프록시. 브라우저는 여전히 이 경로(/api/stats/profile-dist)만
// 호출하므로 CORS 대상 아님 (app/api/geo/[ip]/route.ts와 동일한 패턴).
//
// 시은이 서버가 장애/미배포 상태일 때 대시보드가 깨지지 않도록
// 실패 시 mock 값으로 fallback.
// ─────────────────────────────────────────────

const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://zw-korea-alb-1001485199.ap-northeast-2.elb.amazonaws.com";

export async function GET() {
  try {
    const res = await fetch(`${AUTH_API_BASE}/api/stats/profile-dist`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`upstream ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("profile-dist proxy error:", error);
    return NextResponse.json(
      {
        distribution: [
          { profile: "Low", count: 62 },
          { profile: "High", count: 24 },
          { profile: "Zero-Trust", count: 14 },
        ],
      },
      { status: 200 }
    );
  }
}