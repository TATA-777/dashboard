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
  type RuleId,
} from "@/mock/mockData";

const FORCE_MOCK = process.env.NEXT_PUBLIC_FORCE_MOCK === "true";
const MAX_EVENTS = 50; // 지도 점(events)용
const MAX_ALERTS = 1000; // 알림은 사실상 무제한 (관리자가 직접 지울 때만 삭제)
// (9/30) Wazuh 탐지만 있고 로그인 이벤트가 없는 IP에 대시보드가 직접 찍는 점의 id 접두사
const WAZUH_DOT_PREFIX = "wazuh:";
// (9/30) Wazuh 탐지 IP를 기억하는 시간. Wazuh가 로그인 이벤트보다 먼저 도착하는 경우만 처리하면 되므로 짧게 둔다.
// 이 시간이 지난 뒤 같은 IP로 정상 시간대에 로그인하면 다시 파란 점으로 찍힘.
const ANOMALY_IP_TTL_MS = 60_000;

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

// ⚠️ 수정(9/28): 예전엔 saveToStorage(JSON.stringify)로 저장해서 '"true"'(따옴표 포함)가 들어갔는데
// 읽을 땐 "true"와 비교해서 항상 false → 새로고침마다 알림이 초기화되던 버그.
// 플래그는 JSON 없이 raw 문자열로 저장하고, 예전에 잘못 저장된 '"true"'도 인정한다.
function hasRealDataFlag(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(REAL_DATA_FLAG_KEY);
  return v === "true" || v === '"true"';
}

function setRealDataFlag() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REAL_DATA_FLAG_KEY, "true");
  } catch {
    // 무시
  }
}

// ⚠️ 추가(9/29): mock 데이터 id인지 판별 (mockData.ts의 evt-1~3, alert-evt-1~3)
// 소켓 연결 전 화면에 뜬 mock이 localStorage에 저장된 채로 실데이터 플래그가 켜지면
// 옛날 mock이 "2일 전" 실데이터처럼 계속 남는 버그가 있었음 → 불러올 때 mock id만 걸러낸다.
// 실데이터 id는 `${userId}-${timestamp}` / `${ruleId}-...` 형식이라 evt-로 시작하지 않음.
function isMock(id: string): boolean {
  return id.startsWith("evt-") || id.startsWith("alert-evt-");
}

// (9/30) Wazuh payload의 ruleId 문자열이 R-01~R-06 중 하나일 때만 RuleId로 인정
const RULE_IDS: readonly string[] = ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06"];
function toRuleId(value: string): RuleId | undefined {
  return RULE_IDS.includes(value) ? (value as RuleId) : undefined;
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
  // ⚠️ 수정(9/30): 예전엔 그 유저의 "마지막 세션"을 무조건 가져와서, 같은 계정으로 여러 IP에서 로그인하면
  // 서로 다른 점이 같은 sessionId를 갖게 됨 → 한 알림을 지우면 다른 IP 점까지 같이 사라지던 버그.
  // 이제는 로그인 IP와 같은 세션 중 가장 최근 것을 고르고, 없을 때만 마지막 세션으로 대체한다.
  const sameIp = sessions.filter((s) => s.ipAddress === payload.ipAddress);
  const pool = sameIp.length > 0 ? sameIp : sessions;
  const latestSession = [...pool].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )[pool.length - 1];
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
  // 플래그가 true인데 저장값이 없으면 mock이 아니라 빈 배열로 시작
  // (9/29) 저장값을 불러올 때 mock id는 걸러냄 → 관리자가 안 지운 실데이터 알림은 그대로 유지
  const [events, setEvents] = useState<LoginEvent[]>(() =>
    hasRealDataFlag()
      ? loadFromStorage<LoginEvent[]>(EVENTS_STORAGE_KEY, []).filter((e) => !isMock(e.id))
      : mockLoginEvents
  );
  const [alerts, setAlerts] = useState<AlertEvent[]>(() =>
    hasRealDataFlag()
      ? loadFromStorage<AlertEvent[]>(ALERTS_STORAGE_KEY, []).filter((a) => !isMock(a.id))
      : mockAlerts
  );
  const [connected, setConnected] = useState(false);
  const [usingMock, setUsingMock] = useState(true);

  // 이미 실데이터 플래그가 true였다면(=예전에 이미 mock을 한 번 지운 적 있음) 다시 지울 필요 없음
  const hasClearedMock = useRef(hasRealDataFlag());

  // (9/29) Wazuh(event:anomaly-detected)가 이상으로 판단한 IP → 룰 라벨.
  // 인증서버(login:success)는 정상으로 보냈어도, 같은 IP를 Wazuh가 잡았으면 지도에서 빨간 점으로 표시하기 위함.
  // (login:success가 Wazuh 이벤트보다 늦게 도착하는 경우까지 처리하려고 ref에 기억해 둠)
  const anomalyIps = useRef<Map<string, { label: string; ruleId?: RuleId; at: number }>>(new Map());

  // events/alerts가 바뀔 때마다 로컬스토리지에 계속 반영
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
        setRealDataFlag(); // 이제부터는 저장된 값을 실데이터로 신뢰해도 됨
      }
    };
    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleLoginNew = async (payload: LoginSuccessPayload) => {
      const built = await buildLoginEvent(payload, payload.isAnomaly ? "alert" : "normal");
      // Wazuh가 먼저 이 IP를 이상으로 잡았으면 인증서버 판정과 상관없이 alert로 표시
      // 최근(ANOMALY_IP_TTL_MS 이내)에 Wazuh가 잡은 IP일 때만 alert로 표시 → 오래된 탐지 때문에 정상 로그인이 빨개지지 않게
      const hit = anomalyIps.current.get(built.ip);
      const wazuh = hit && Date.now() - hit.at < ANOMALY_IP_TTL_MS ? hit : undefined;
      if (hit && !wazuh) anomalyIps.current.delete(built.ip);
      const event: LoginEvent = wazuh
        ? {
            ...built,
            status: "alert",
            ruleId: wazuh.ruleId ?? built.ruleId,
            reason: built.reason ?? wazuh.label,
          }
        : built;
      // Wazuh가 먼저 와서 대시보드가 임시로 찍어둔 점(wazuh:)이 같은 IP에 있으면 실제 로그인 점으로 교체
      setEvents((prev) =>
        [
          event,
          ...prev.filter((e) => !(e.id.startsWith(WAZUH_DOT_PREFIX) && e.ip === event.ip)),
        ].slice(0, MAX_EVENTS)
      );
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
        ].slice(0, MAX_ALERTS)
      );
    };

    // 서버에서 세션 종료 브로드캐스트가 오면 해당 세션에 연결된 항목만 제거
    // (sessionId가 빈 값이면 Wazuh 알림 전체가 지워지는 사고 방지)
    const handleSessionTerminated = (payload: SessionKilledPayload) => {
      if (!payload.sessionId) return;
      setEvents((prev) => prev.filter((e) => e.sessionId !== payload.sessionId));
      setAlerts((prev) => prev.filter((a) => a.sessionId !== payload.sessionId));
    };

    const handleAnomalyDetected = async (payload: AnomalyDetectedPayload) => {
      const ip = payload.ip ?? payload.srcIp ?? "-";
      const ruleLabel = payload.ruleName ? `${payload.ruleId} · ${payload.ruleName}` : payload.ruleId;
      const ruleId = toRuleId(payload.ruleId);
      // timestamp가 안 올 수도 있어서 id는 절대 겹치지 않도록 별도 조합
      const uniqueSuffix = `${payload.timestamp ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const alertId = `${payload.ruleId}-${uniqueSuffix}`;
      const time = payload.timestamp ?? new Date().toISOString();
      setAlerts((prev) =>
        [
          {
            id: alertId,
            sessionId: "",
            ruleId, // (9/30) 알림 삭제 시 지도에서 같은 IP·같은 룰로 빨개진 점을 찾기 위해 저장
            ruleLabel,
            ip,
            country: payload.country ?? "",
            time,
            severity: "high" as const,
          },
          ...prev,
        ].slice(0, MAX_ALERTS)
      );

      if (ip === "-") return;
      anomalyIps.current.set(ip, { label: ruleLabel, ruleId, at: Date.now() });

      // ① 같은 IP로 "최근(ANOMALY_IP_TTL_MS 이내)"에 찍힌 점 중 가장 최근 것 하나만 빨간색(alert)으로 변경
      //    (예전 정상 시간대에 찍힌 같은 IP의 파란 점까지 빨개지지 않게, events는 최신순이라 첫 번째가 가장 최근)
      const isRecentSameIp = (e: LoginEvent) =>
        e.ip === ip && Date.now() - new Date(e.time).getTime() < ANOMALY_IP_TTL_MS;
      setEvents((prev) => {
        const idx = prev.findIndex(isRecentSameIp);
        if (idx === -1) return prev;
        const next = [...prev];
        const e = next[idx];
        next[idx] = { ...e, status: "alert", ruleId: ruleId ?? e.ruleId, reason: e.reason ?? ruleLabel };
        return next;
      });

      // ② (9/30) 최근 같은 IP 점이 없으면(로그인 이벤트가 안 왔거나 아직 도착 전) 위치를 조회해서 빨간 점을 직접 찍음
      //    사설 IP(10.x 등)는 위치 조회가 실패해서 (0,0)이 나오므로 지도에 안 찍음
      const geo = await geolocateIp(ip);
      if (geo.lat === 0 && geo.lng === 0) return;
      const dot: LoginEvent = {
        id: `${WAZUH_DOT_PREFIX}${alertId}`,
        sessionId: "",
        userId: payload.userEmail ?? payload.userId ?? "unknown",
        ip,
        lat: geo.lat,
        lng: geo.lng,
        country: payload.country ?? geo.country,
        city: geo.city,
        time,
        profile: "-" as Profile, // Wazuh 이벤트엔 프로파일 정보가 없어서 팝업에 "-"로 표시
        status: "alert",
        ruleId,
        reason: ruleLabel,
      };
      // 최근 로그인 점이 이미 있으면(①에서 빨개짐) 중복으로 안 찍음
      setEvents((prev) =>
        prev.some(isRecentSameIp) ? prev : [dot, ...prev].slice(0, MAX_EVENTS)
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

  /**
   * 알림 삭제 (9/28 수정, 9/30 수정)
   * - 알림은 무조건 id 기준으로 삭제 → Wazuh 알림(sessionId 없음)도 정상 삭제됨
   * - Wazuh 알림: 같은 IP + 같은 룰로 빨개진 지도 점(대시보드가 직접 찍은 wazuh: 점 포함)도 같이 삭제
   * - 로그인 이상탐지 알림: 알림과 같은 id의 지도 점만 삭제 (예전엔 sessionId로 지워서
   *   같은 세션으로 묶인 다른 IP 점까지 같이 사라지던 버그) + 세션 강제 종료 수행
   */
  const handleDismiss = useCallback(
    async (alert: AlertEvent) => {
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));

      if (!alert.sessionId) {
        if (alert.ruleId && alert.ip !== "-") {
          setEvents((prev) =>
            prev.filter((e) => !(e.ip === alert.ip && e.ruleId === alert.ruleId))
          );
          anomalyIps.current.delete(alert.ip);
        }
        return;
      }

      // 실데이터: 알림 id === 지도 점 id / mock: 알림 id === "alert-" + 지도 점 id
      setEvents((prev) =>
        prev.filter((e) => e.id !== alert.id && `alert-${e.id}` !== alert.id)
      );

      // mock 알림(가짜 sessionId: sess-900x)은 서버에 세션 종료 요청을 보내지 않음
      if (usingMock || isMock(alert.id)) return;

      try {
        await terminateSession(alert.sessionId, "대시보드 관리자 강제 종료");
      } catch (err) {
        console.error("세션 종료 요청 실패:", err);
      }
    },
    [usingMock]
  );

  return { events, alerts, connected, usingMock, handleDismiss };
}