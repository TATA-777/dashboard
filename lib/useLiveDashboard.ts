"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
const MAX_EVENTS = 50;

// 새로고침/dev 서버 재시작해도 실시간 알림이 안 사라지도록 로컬스토리지에 저장
const EVENTS_STORAGE_KEY = "zw-dashboard-events";
const ALERTS_STORAGE_KEY = "zw-dashboard-alerts";
// "진짜로 소켓 붙어서 mock을 지운 적이 있다"는 것만 나타내는 별도 플래그.
// 이게 없으면 mock 데이터가 우연히 저장된 것도 "실데이터 있음"으로 착각하게 됨.
const REAL_DATA_FLAG_KEY = "zw-dashboard-has-real-data";

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback; // SSR에서는 localStorage 없음
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback; // 저장된 값이 깨져있으면 그냥 기본값 사용
  }
}

function saveToStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 용량 초과 등으로 저장 실패해도 화면 표시엔 지장 없으니 무시
  }
}

function hasRealDataFlag(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(REAL_DATA_FLAG_KEY) === "true";
}

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
 * 지영 확정(9/23): Wazuh R-01~R-06 탐지룰 전체에서 발행되는 광범위 이상탐지 이벤트.
 * ⚠️ 실제로 룰마다 필드가 들쭉날쭉 옴 (ip 대신 srcIp로 오거나, ruleName/severity/message가 빠지는 경우 있음,
 *    timestamp가 아예 안 오는 경우도 있음) → 아래 필드 대부분을 optional로 두고 핸들러에서 방어적으로 처리함.
 */
export interface AnomalyDetectedPayload {
  ruleId: string;
  ruleName?: string;
  severity?: number;
  timestamp?: string;
  ip?: string;
  srcIp?: string;
  userId?: string | null;
  userEmail?: string | null;
  country?: string | null;
  message?: string;
  wazuhRuleId?: string;
  source?: string;
}

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

export function useLiveDashboard() {
  // 실데이터 플래그가 true일 때만 로컬스토리지 값을 신뢰해서 불러오고,
  // 아니면(=한 번도 소켓에서 실데이터를 받아 mock을 지운 적 없으면) mock으로 시작
  const [events, setEvents] = useState<LoginEvent[]>(() =>
    hasRealDataFlag() ? loadFromStorage(EVENTS_STORAGE_KEY, mockLoginEvents) : mockLoginEvents
  );
  const [alerts, setAlerts] = useState<AlertEvent[]>(() =>
    hasRealDataFlag() ? loadFromStorage(ALERTS_STORAGE_KEY, mockAlerts) : mockAlerts
  );
  const [connected, setConnected] = useState(false);
  const [usingMock, setUsingMock] = useState(true);

  // 이미 실데이터 플래그가 true였다면(=예전에 이미 mock을 한 번 지운 적 있음) 다시 지울 필요 없음
  const hasClearedMock = useRef(hasRealDataFlag());

  // events/alerts가 바뀔 때마다 로컬스토리지에 계속 반영
  // (mock을 아직 지운 적 없는 상태에서 저장돼도 상관없음 - 플래그가 true가 되기 전까진 다음 로드 때 무시됨)
  useEffect(() => {
    saveToStorage(EVENTS_STORAGE_KEY, events);
  }, [events]);

  useEffect(() => {
    saveToStorage(ALERTS_STORAGE_KEY, alerts);
  }, [alerts]);

  useEffect(() => {
    if (FORCE_MOCK) {
      setUsingMock(true);
      return;
    }
    const socket = getSocket();
    if (!socket) {
      setUsingMock(true);
      return;
    }

    const handleConnect = () => {
      setConnected(true);
      setUsingMock(false);
      if (!hasClearedMock.current) {
        hasClearedMock.current = true;
        setEvents([]);
        setAlerts([]);
        saveToStorage(REAL_DATA_FLAG_KEY, "true"); // 이제부터는 저장된 값을 실데이터로 신뢰해도 됨
      }
    };
    const handleDisconnect = () => {
      setConnected(false);
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

    const handleAnomalyDetected = (payload: AnomalyDetectedPayload) => {
      const ip = payload.ip ?? payload.srcIp ?? "-";
      const ruleLabel = payload.ruleName ? `${payload.ruleId} · ${payload.ruleName}` : payload.ruleId;
      // timestamp가 안 올 수도 있어서 id는 절대 겹치지 않도록 별도 조합
      const uniqueSuffix = `${payload.timestamp ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts((prev) =>
        [
          {
            id: `${payload.ruleId}-${uniqueSuffix}`,
            sessionId: "",
            ruleLabel,
            ip,
            country: payload.country ?? "",
            time: payload.timestamp ?? new Date().toISOString(),
            severity: "high" as const,
          },
          ...prev,
        ].slice(0, MAX_EVENTS)
      );
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(EVENTS.LOGIN_NEW, handleLoginNew);
    socket.on(EVENTS.ALERT_DETECTED, handleAlertDetected);
    socket.on(EVENTS.SESSION_TERMINATED, handleSessionTerminated);
    socket.on(EVENTS.ANOMALY_DETECTED, handleAnomalyDetected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off(EVENTS.LOGIN_NEW, handleLoginNew);
      socket.off(EVENTS.ALERT_DETECTED, handleAlertDetected);
      socket.off(EVENTS.SESSION_TERMINATED, handleSessionTerminated);
      socket.off(EVENTS.ANOMALY_DETECTED, handleAnomalyDetected);
    };
  }, []);

  const handleTerminate = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return; // sessionId 없는 항목(인프라 이상탐지)은 종료 대상이 아니므로 아예 무시

      setEvents((prev) => prev.filter((e) => e.sessionId !== sessionId));
      setAlerts((prev) => prev.filter((a) => a.sessionId !== sessionId));

      if (usingMock) return;

      try {
        await terminateSession(sessionId, "대시보드 관리자 강제 종료");
      } catch (err) {
        console.error("세션 종료 요청 실패:", err);
      }
    },
    [usingMock]
  );

  return { events, alerts, connected, usingMock, handleTerminate };
}