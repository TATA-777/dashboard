"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket, EVENTS } from "./socket";
import { terminateSession, fetchActiveSessions } from "./api";
import { geolocateIp } from "./geolocate";
import {
  mockLoginEvents,
  mockAlerts,
  type LoginEvent,
  type AlertEvent,
  type Profile,
} from "@/mock/mockData";

const FORCE_MOCK = process.env.NEXT_PUBLIC_FORCE_MOCK === "true";
const MAX_EVENTS = 50; // 무한정 쌓이지 않게 최근 N개만 유지

// 오시은 쪽 trustLevel 값(LOW/HIGH/ZERO_TRUST) → 화면 표시용 Profile 라벨
function toProfile(trustLevel: string): Profile {
  if (trustLevel === "HIGH") return "High";
  if (trustLevel === "ZERO_TRUST") return "Zero-Trust";
  return "Low";
}

interface LoginSuccessPayload {
  userId: string;
  email: string;
  ipAddress: string;
  trustLevel: string;
  isAnomaly: boolean;
  timestamp: string;
}

interface LoginAnomalyPayload {
  userId: string;
  email: string;
  ipAddress: string;
  reason: string;
  trustLevel: string;
  timestamp: string;
}

interface SessionKilledPayload {
  userId: string;
  sessionId: string;
  reason: string;
  timestamp: string;
}

/**
 * 오시은 확정 스펙(8/27)의 login:success/login:anomaly payload에는
 * sessionId, 좌표(lat/lng), 국가/도시가 없어서 여기서 직접 채워넣는다.
 *  - sessionId: GET /api/sessions?userId=로 조회해서 가장 최근 세션을 사용
 *    (지도 점 클릭 → 세션 강제종료 하려면 sessionId가 꼭 있어야 함)
 *  - lat/lng/country/city: ipAddress를 geolocateIp()로 조회
 */
async function buildLoginEvent(
  payload: LoginSuccessPayload | LoginAnomalyPayload,
  status: "normal" | "alert"
): Promise<LoginEvent> {
  const [geo, sessions] = await Promise.all([
    geolocateIp(payload.ipAddress),
    fetchActiveSessions(payload.userId).catch(() => []),
  ]);

  const latestSession = sessions[sessions.length - 1];

  return {
    id: `${payload.userId}-${payload.timestamp}`,
    sessionId: latestSession?.sessionId ?? "",
    userId: payload.email || payload.userId,
    ip: payload.ipAddress,
    lat: geo.lat,
    lng: geo.lng,
    country: geo.country,
    city: geo.city,
    time: payload.timestamp,
    profile: toProfile(payload.trustLevel),
    status,
    reason: "reason" in payload ? payload.reason : undefined,
  };
}

/**
 * 대시보드의 "살아있는" 데이터 소스.
 *
 * - 소켓 연결 성공 && FORCE_MOCK이 아니면: 실시간 이벤트로 상태 갱신
 * - 연결 실패 / URL 미설정 / FORCE_MOCK=true: mock 데이터 그대로 사용 (개발·시연용)
 */
export function useLiveDashboard() {
  const [events, setEvents] = useState<LoginEvent[]>(mockLoginEvents);
  const [alerts, setAlerts] = useState<AlertEvent[]>(mockAlerts);
  const [connected, setConnected] = useState(false);
  const [usingMock, setUsingMock] = useState(true);

  useEffect(() => {
    if (FORCE_MOCK) {
      setUsingMock(true);
      return;
    }

    const socket = getSocket();
    if (!socket) {
      // NEXT_PUBLIC_SOCKET_URL이 비어있는 경우 → mock 유지
      setUsingMock(true);
      return;
    }

    const handleConnect = () => {
      setConnected(true);
      setUsingMock(false);
    };
    const handleDisconnect = () => {
      setConnected(false);
      // 연결이 끊겨도 지금까지 받은 실데이터는 유지 (mock으로 되돌리지 않음)
    };

    const handleLoginNew = async (payload: LoginSuccessPayload) => {
      const event = await buildLoginEvent(payload, payload.isAnomaly ? "alert" : "normal");
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    };

    const handleAlertDetected = async (payload: LoginAnomalyPayload) => {
      const event = await buildLoginEvent(payload, "alert");
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
      setAlerts((prev) =>
        [
          {
            id: event.id,
            sessionId: event.sessionId,
            // 오시은 쪽엔 룰 코드(R-01~06)가 없고 자유 텍스트 reason만 있어서 그대로 라벨로 사용
            ruleLabel: payload.reason,
            ip: event.ip,
            country: event.country,
            time: event.time,
            severity: "high" as const,
          },
          ...prev,
        ].slice(0, MAX_EVENTS)
      );
    };

    const handleSessionTerminated = (payload: SessionKilledPayload) => {
      setEvents((prev) => prev.filter((e) => e.sessionId !== payload.sessionId));
      setAlerts((prev) => prev.filter((a) => a.sessionId !== payload.sessionId));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(EVENTS.LOGIN_NEW, handleLoginNew);
    socket.on(EVENTS.ALERT_DETECTED, handleAlertDetected);
    socket.on(EVENTS.SESSION_TERMINATED, handleSessionTerminated);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off(EVENTS.LOGIN_NEW, handleLoginNew);
      socket.off(EVENTS.ALERT_DETECTED, handleAlertDetected);
      socket.off(EVENTS.SESSION_TERMINATED, handleSessionTerminated);
    };
  }, []);

  const handleTerminate = useCallback(
    async (sessionId: string) => {
      // 낙관적 업데이트: 서버 응답 기다리지 않고 UI 먼저 반영
      setEvents((prev) => prev.filter((e) => e.sessionId !== sessionId));
      setAlerts((prev) => prev.filter((a) => a.sessionId !== sessionId));

      if (usingMock || !sessionId) return; // mock 모드거나 sessionId 확보 못했으면 REST 호출 안 함

      try {
        // 오시은 확정(8/27): socket으로 "종료해줘" 요청하는 이벤트는 없음.
        // 종료는 항상 REST(POST /api/session/kill)로 요청하고,
        // 성공하면 서버가 session:killed를 소켓으로 방송해준다.
        await terminateSession(sessionId, "대시보드 관리자 강제 종료");
      } catch (err) {
        // TODO: 실패 시 토스트/알림 UI로 사용자에게 알리기 (지금은 콘솔 로그만)
        console.error("세션 종료 요청 실패:", err);
      }
    },
    [usingMock]
  );

  return { events, alerts, connected, usingMock, handleTerminate };
}
