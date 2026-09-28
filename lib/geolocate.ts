// ─────────────────────────────────────────────
// IP → 위경도/국가/도시 변환.
//
// 오시은 확정 스펙(8/27)의 login:success / login:anomaly 이벤트에는
// ipAddress만 오고 좌표(lat/lng)나 국가명이 없어서, 지도에 점을 찍으려면
// 대시보드가 직접 조회해야 함. app/api/geo 라우트를 경유해서 ip-api.com을 호출.
// 같은 IP는 세션 내에서 캐싱해서 중복 호출 방지.
//
// ⚠️ 9/28 수정: next.config.js의 basePath('/dashboard')는 fetch에 자동으로 안 붙음.
// '/api/geo/...'로 호출하면 ALB가 인증서버로 보내서 404 → 좌표 (0,0)으로 폴백되던 버그.
// 반드시 '/dashboard' 접두사를 붙여서 대시보드 자체 라우트로 가게 한다.
// 또한 실패한 결과(FALLBACK)는 캐싱하지 않아 다음에 다시 조회되도록 한다.
// ─────────────────────────────────────────────

const BASE_PATH = "/dashboard";

interface GeoResult {
  lat: number;
  lng: number;
  country: string;
  city: string;
}

const cache = new Map<string, GeoResult>();

const FALLBACK: GeoResult = { lat: 0, lng: 0, country: "알 수 없음", city: "" };

export async function geolocateIp(ip: string): Promise<GeoResult> {
  if (cache.has(ip)) return cache.get(ip)!;

  try {
    const res = await fetch(`${BASE_PATH}/api/geo/${encodeURIComponent(ip)}`);
    if (!res.ok) return FALLBACK; // 실패는 캐싱하지 않고 다음에 재시도
    const result: GeoResult = await res.json();
    if (typeof result.lat !== "number" || typeof result.lng !== "number") return FALLBACK;
    cache.set(ip, result);
    return result;
  } catch {
    return FALLBACK;
  }
}