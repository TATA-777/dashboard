// ─────────────────────────────────────────────
// IP → 위경도/국가/도시 변환.
//
// 오시은 확정 스펙(8/27)의 login:success / login:anomaly 이벤트에는
// ipAddress만 오고 좌표(lat/lng)나 국가명이 없어서, 지도에 점을 찍으려면
// 대시보드가 직접 조회해야 함. app/api/geo 라우트를 경유해서 ip-api.com을 호출.
// 같은 IP는 세션 내에서 캐싱해서 중복 호출 방지.
// ─────────────────────────────────────────────

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
    const res = await fetch(`/api/geo/${ip}`);
    const result: GeoResult = await res.json();
    cache.set(ip, result);
    return result;
  } catch {
    return FALLBACK;
  }
}
