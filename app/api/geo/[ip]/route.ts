import { NextRequest, NextResponse } from "next/server";

// 브라우저에서 곧바로 http://ip-api.com을 호출하면, 대시보드가 HTTPS로 떠있을 때
// mixed-content로 막힌다 (오시은 쪽 소켓 URL이 https 확정이라 대시보드도 https로 열림).
// 그래서 이 서버 라우트가 대신 조회해서 결과만 클라이언트에 돌려준다.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  try {
    const { ip } = await params;
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,lat,lon,country,city`
    );
    const data = await res.json();

    if (data.status !== "success") {
      return NextResponse.json({ lat: 0, lng: 0, country: "알 수 없음", city: "" });
    }

    return NextResponse.json({
      lat: data.lat,
      lng: data.lon,
      country: data.country,
      city: data.city,
    });
  } catch {
    return NextResponse.json({ lat: 0, lng: 0, country: "알 수 없음", city: "" });
  }
}
