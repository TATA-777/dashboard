import { io, type Socket } from "socket.io-client";

// ─────────────────────────────────────────────
// Socket.io 클라이언트 (싱글톤)
//
// 이벤트명: 오시은 확정 (8/27 확정 → 이후 구두 재확인 완료)
//   login:success  — 로그인 성공 { userId, email, ipAddress, trustLevel, isAnomaly, timestamp }
//   login:anomaly  — 이상 탐지   { userId, email, ipAddress, reason, trustLevel, timestamp }
//   session:killed — 세션 종료(서버 → 클라이언트 브로드캐스트) { userId, sessionId, reason, timestamp }
//
// ⚠️ 위 payload 어디에도 sessionId/좌표/국가가 없음 (session:killed만 sessionId 있음).
//   sessionId는 GET /api/sessions?userId=로, 좌표는 geolocateIp()로 useLiveDashboard.ts에서 직접 채움.
//
// ✅ 세션 강제종료는 socket 이벤트가 아니라 REST(POST /api/session/kill, { sessionId, reason })로만 요청.
//   "socket.emit으로 종료 요청" 기능은 없음 — 오시은 확인 완료. kill API 호출 성공 시
//   서버가 그 결과로 session:killed를 소켓 브로드캐스트하는 구조.
//
// ✅ ALB 트레일링 슬래시 리다이렉트 주의 (오시은 확인, 9/14):
//   ALB가 /socket.io/ (끝 슬래시 있음) 요청을 /socket.io로 308 리다이렉트 시키는데,
//   리다이렉트 응답엔 CORS 헤더가 없어서 브라우저가 그냥 막아버림 — 아래 addTrailingSlash: false로 회피.
//
// ✅ 9/20: transports를 ["websocket", "polling"] → ["websocket"]까지 테스트했는데
//   전부 502/타임아웃으로 실패. 시은이 서버에서 pm2 실시간 로그 띄워놓고 동시 테스트했는데
//   재시도 시점에 서버 로그에 아무 흔적도 안 찍힘 → 요청이 Node 프로세스까지 아예
//   도달을 못 하고 있다는 뜻(ALB/WAF 등 앞단에서 막히는 것으로 추정, 인프라팀 확인 중).
//
// ✅ 9/20: 소켓 연결 시도 직전에 실제로 시은이 서버(ALB)까지 도달하는 REST 요청
//   (profile-dist)을 마커로 하나 날려서, 서버 로그에 "이 시각에 시도했다"는
//   타임스탬프 기준점을 남김. (rule-hits는 로컬 mock이라 서버까지 안 감 — 마커로 쓰면 안 됨)
// ─────────────────────────────────────────────

export const EVENTS = {
  LOGIN_NEW: "login:success",
  ALERT_DETECTED: "login:anomaly",
  SESSION_TERMINATED: "session:killed", // 서버 → 클라이언트 (응답/브로드캐스트)
} as const;

let socketInstance: Socket | null = null;

/**
 * 소켓 인스턴스를 하나만 만들어서 재사용한다.
 * NEXT_PUBLIC_SOCKET_URL이 비어있으면 연결을 시도하지 않고 null을 반환 →
 * 호출부(useLiveDashboard)에서 mock 모드로 폴백한다.
 */
export function getSocket(): Socket | null {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL;
  console.log("[소켓 디버그] NEXT_PUBLIC_SOCKET_URL =", url);

  if (!url) {
    console.log("[소켓 디버그] URL이 없어서 연결 시도 안 함");
    return null;
  }

  if (!socketInstance) {
    console.log("[소켓 디버그] io() 호출 시도");
    socketInstance = io(url, {
  path: "/socket.io",
  addTrailingSlash: false,
  withCredentials: true,
  transports: ["polling", "websocket"], // polling 먼저 핸드셰이크 후 websocket 업그레이드
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  autoConnect: true,
});

    socketInstance.on("connect", () => {
      console.log("[소켓 디버그] 연결 성공! id =", socketInstance?.id);
    });
    socketInstance.on("connect_error", (err) => {
      console.log("[소켓 디버그] 연결 실패:", err.message);
    });
  }

  return socketInstance;
}

export function disconnectSocket() {
  socketInstance?.disconnect();
  socketInstance = null;
}