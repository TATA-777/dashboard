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
const MAX_EVENTS = 50; // 지도 파란 점(정상 로그인) 최대 개수 — 빨간 점은 알림과 1:1이라 알림을 지울 때만 사라짐
const MAX_ALERTS = 1000; // 알림은 사실상 무제한 (관리자가 직접 지울 때만 삭제)
// (9/29) 지도 표시 원칙: 정상 로그인 1건 = 파란 점 1개, 이상 알림 1건 = 빨간 점 1개
// Wazuh 알림(event:anomaly-detected) 1건마다 대시보드가 찍는 빨간 점의 id 접두사 (점 id = 접두사 + 알림 id)
const WAZUH_DOT_PREFIX = "wazuh:";
// (9/30) GuardDuty 알림(event:security-alert)의 알림 id 접두사. 빨간 점 id도 알림 id와 똑같이 씀 (점 id === 알림 id)
const GUARDDUTY_ID_PREFIX = "guardduty-";
// (9/29) Wazuh 탐지와 같은 IP의 로그인을 "같은 로그인"으로 보는 시간.
// 이 시간 안의 같은 IP 파란 점은 Wazuh 빨간 점으로 교체하고, 이후 같은 IP로 정상 시간대에 로그인하면 다시 파란 점으로 찍힘.
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

// (9/29) Wazuh payload의 ruleId 문자열이 R-01~R-06 중 하나일 때만 RuleId로 인정
const RULE_IDS: readonly string[] = ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06"];
function toRuleId(value: string): RuleId | undefined {
  return RULE_IDS.includes(value) ? (value as RuleId) : undefined;
}

// (9/29) 지도 점 개수 제한: 파란 점(정상)만 최신 MAX_EVENTS개로 자르고, 빨간 점(이상)은 알림과 1:1이라 전부 유지
function capEvents(list: LoginEvent[]): LoginEvent[] {
  let normalCount = 0;
  return list.filter((e) => e.status !== "normal" || ++normalCount <= MAX_EVENTS);
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

/**
 * (9/30) GuardDuty Finding 이벤트 (event:security-alert).
 * 흐름: GuardDuty → EventBridge → Lambda(수정) → Redis guardduty:finding → 인증서버(시은)가 아래 형태로 변환해서 전파.
 * ⚠️ severity는 실제 Finding이면 숫자(1~10), 테스트 PUBLISH면 "High" 같은 문자열로 올 수 있음.
 * ⚠️ location은 lng가 아니라 lon. 좌표를 못 찾으면 서울 좌표 + isInternal: true로 폴백되므로 지도엔 안 찍음.
 */
export interface SecurityAlertPayload {
  id?: string;
  source?: string;
  title?: string;
  severity?: string | number;
  region?: string;
  location?: {
    ip?: string;
    lat?: number;
    lon?: number;
    country?: string;
    isInternal?: boolean;
  } | null;
  timestamp?: string;
}

// (9/30) GuardDuty 심각도 → 알림 색상. 7 이상(High/Critical)만 빨강, 나머지는 주황
function toGuardDutySeverity(severity: string | number | undefined): "high" | "medium" {
  if (severity === undefined || severity === null || severity === "") return "medium";
  const n = Number(severity);
  if (!Number.isNaN(n)) return n >= 7 ? "high" : "medium";
  const s = String(severity).toLowerCase();
  return s === "high" || s === "critical" ? "high" : "medium";
}

async function buildLoginEvent(
  payload: LoginSuccessPayload | LoginAnomalyPayload,
  status: "normal" | "alert"
): Promise<LoginEvent> {
  const [geo, sessions] = await Promise.all([
    geolocateIp(payload.ipAddress),
    fetchActiveSessions(payload.userId).catch(() => []),
  ]);
  // ⚠️ 수정(9/29): 예전엔 그 유저의 "마지막 세션"을 무조건 가져와서, 같은 계정으로 여러 IP에서 로그인하면
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

  // (9/29) Wazuh(event:anomaly-detected)가 최근에 탐지한 IP → 탐지 시각(ms).
  // login:success가 Wazuh 이벤트보다 늦게 도착하면, 그 로그인은 이미 Wazuh 빨간 점으로 표시돼 있으므로 파란 점을 따로 안 찍기 위함.
  const anomalyIps = useRef<Map<string, number>>(new Map());

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
      // (9/29) 이상 로그인은 인증서버가 login:anomaly를 따로 보내고, 그쪽에서 알림 1건 + 빨간 점 1개를 찍음
      // → 여기서도 찍으면 같은 자리에 점이 2개 겹치므로 건너뜀
      if (payload.isAnomaly) return;

      const event = await buildLoginEvent(payload, "normal");

      // Wazuh가 최근(ANOMALY_IP_TTL_MS 이내)에 이 IP를 먼저 탐지했으면 이미 빨간 점으로 표시돼 있으므로 파란 점을 안 찍음
      const detectedAt = anomalyIps.current.get(event.ip);
      if (detectedAt !== undefined) {
        if (Date.now() - detectedAt < ANOMALY_IP_TTL_MS) return;
        anomalyIps.current.delete(event.ip);
      }

      setEvents((prev) => capEvents([event, ...prev.filter((e) => e.id !== event.id)]));
    };

    const handleAlertDetected = async (payload: LoginAnomalyPayload) => {
      const event = await buildLoginEvent(payload, "alert");
      // 알림 1건 = 빨간 점 1개 (알림 id와 점 id가 같음)
      setEvents((prev) => capEvents([event, ...prev.filter((e) => e.id !== event.id)]));
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
          ...prev.filter((a) => a.id !== event.id),
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
            ruleId,
            ruleLabel,
            ip,
            country: payload.country ?? "",
            time,
            severity: "high" as const,
          },
          ...prev,
        ].slice(0, MAX_ALERTS)
      );

      // 사설 IP(10.x 등)나 IP가 없는 탐지는 위치 조회가 안 되므로 알림만 띄우고 지도엔 안 찍음
      if (ip === "-") return;
      anomalyIps.current.set(ip, Date.now());

      const geo = await geolocateIp(ip);
      if (geo.lat === 0 && geo.lng === 0) return;

      // 알림 1건 = 빨간 점 1개 (점 id = "wazuh:" + 알림 id)
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

      // 같은 IP로 최근(ANOMALY_IP_TTL_MS 이내)에 찍힌 파란 점은 같은 로그인이므로 이 빨간 점으로 교체
      // (인증서버는 정상, Wazuh는 이상으로 본 로그인 → 빨간 점 1개로만 표시)
      const isRecentNormalSameIp = (e: LoginEvent) =>
        e.status === "normal" &&
        e.ip === ip &&
        Date.now() - new Date(e.time).getTime() < ANOMALY_IP_TTL_MS;
      setEvents((prev) =>
        capEvents([dot, ...prev.filter((e) => !isRecentNormalSameIp(e))])
      );
    };

    // (9/30) GuardDuty 알림(event:security-alert): 알림 1건 + 빨간 점 1개
    // 점 id === 알림 id → handleDismiss의 기존 조건(e.id !== alert.id)으로 알림 삭제 시 점도 같이 지워짐
    const handleSecurityAlert = (payload: SecurityAlertPayload) => {
      const findingId = payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const alertId = `${GUARDDUTY_ID_PREFIX}${findingId}`;
      const title = payload.title || "GuardDuty Security Finding";
      const time = payload.timestamp || new Date().toISOString();
      const loc = payload.location ?? undefined;
      const ip = loc?.ip || "-";

      setAlerts((prev) =>
        [
          {
            id: alertId,
            sessionId: "", // 세션 없음 → 버튼이 "알림 삭제"로 표시되고 세션 종료 요청도 안 나감
            ruleLabel: `GuardDuty · ${title}`,
            ip,
            country: loc?.country ?? "",
            time,
            severity: toGuardDutySeverity(payload.severity),
          },
          ...prev.filter((a) => a.id !== alertId), // 같은 Finding이 다시 오면(GuardDuty 갱신) 중복 없이 교체
        ].slice(0, MAX_ALERTS)
      );

      // AWS 내부 행위(외부 IP/좌표 없음 → 서울 좌표 폴백)는 가짜 위치라 지도엔 안 찍고 알림만 띄움
      if (!loc || loc.isInternal) return;
      const lat = loc.lat;
      const lng = loc.lon; // ⚠️ 서버는 lng가 아니라 lon으로 보냄
      if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (lat === 0 && lng === 0) return;

      // 알림 1건 = 빨간 점 1개 (점 id === 알림 id)
      const dot: LoginEvent = {
        id: alertId,
        sessionId: "",
        userId: "GuardDuty",
        ip,
        lat,
        lng,
        country: loc.country ?? "",
        city: "",
        time,
        profile: "-" as Profile, // GuardDuty 이벤트엔 프로파일 정보가 없어서 팝업에 "-"로 표시
        status: "alert",
        reason: payload.region ? `${title} (${payload.region})` : title,
      };
      setEvents((prev) => capEvents([dot, ...prev.filter((e) => e.id !== alertId)]));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on(EVENTS.LOGIN_NEW, handleLoginNew);
    socket.on(EVENTS.ALERT_DETECTED, handleAlertDetected);
    socket.on(EVENTS.SESSION_TERMINATED, handleSessionTerminated);
    socket.on(EVENTS.ANOMALY_DETECTED, handleAnomalyDetected);
    socket.on(EVENTS.SECURITY_ALERT, handleSecurityAlert);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off(EVENTS.LOGIN_NEW, handleLoginNew);
      socket.off(EVENTS.ALERT_DETECTED, handleAlertDetected);
      socket.off(EVENTS.SESSION_TERMINATED, handleSessionTerminated);
      socket.off(EVENTS.ANOMALY_DETECTED, handleAnomalyDetected);
      socket.off(EVENTS.SECURITY_ALERT, handleSecurityAlert);
    };
  }, []);

  /**
   * 알림 삭제 (9/28 수정, 9/29 수정)
   * - 알림 1건 = 빨간 점 1개이므로, 알림을 지우면 그 알림의 점 1개만 같이 지움
   *   · 로그인 이상탐지 알림: 점 id === 알림 id
   *   · Wazuh 알림: 점 id === "wazuh:" + 알림 id
   *   · GuardDuty 알림(9/30): 점 id === 알림 id ("guardduty-" + Finding id)
   *   · mock 알림: 알림 id === "alert-" + 점 id
   * - 세션이 있는 알림(로그인 이상탐지)은 세션 강제 종료까지 수행
   */
  const handleDismiss = useCallback(
    async (alert: AlertEvent) => {
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      setEvents((prev) =>
        prev.filter(
          (e) =>
            e.id !== alert.id &&
            e.id !== `${WAZUH_DOT_PREFIX}${alert.id}` &&
            `alert-${e.id}` !== alert.id
        )
      );

      if (!alert.sessionId) return;

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