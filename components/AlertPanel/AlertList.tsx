"use client";

import { useState, useEffect } from "react";
import type { AlertEvent } from "@/mock/mockData";

function formatTimeAgo(iso: string) {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}초 전`;
  return `${Math.floor(diffSec / 60)}분 전`;
}

// 서버 렌더링 시점과 브라우저 렌더링 시점의 "지금"이 달라서 생기는
// hydration mismatch를 막기 위해, 마운트 전까지는 빈 값만 출력하고
// 마운트된 뒤(useEffect)에만 실제 상대시간을 계산해서 채운다.
function useTimeAgo(iso: string) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const update = () => setLabel(formatTimeAgo(iso));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [iso]);

  return label;
}

function AlertItem({
  alert,
  onTerminate,
}: {
  alert: AlertEvent;
  onTerminate: (sessionId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [terminated, setTerminated] = useState(false);
  const timeLabel = useTimeAgo(alert.time);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onTerminate(alert.sessionId);
    setTerminated(true);
  };

  return (
    <div
      className={`rounded-md border px-3 py-2.5 text-sm ${
        alert.severity === "high"
          ? "border-danger/40 bg-danger/10"
          : "border-warn/40 bg-warn/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">
          {alert.severity === "high" ? "🔴" : "🟠"} {alert.ruleLabel}
        </span>
        <span className="font-mono text-xs text-muted">{timeLabel}</span>
      </div>
      <div className="mt-1 font-mono text-xs text-muted">
        {alert.ip} · {alert.country}
        {alert.ruleId && ` · ${alert.ruleId}`}
      </div>

      {!terminated ? (
        <button
          onClick={handleClick}
          className={`mt-2 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            confirming
              ? "bg-danger text-white hover:bg-danger/90"
              : "bg-surface2 text-ink hover:bg-line"
          }`}
        >
          {confirming ? "정말 세션을 종료할까요? (클릭하여 확정)" : "세션 강제 종료"}
        </button>
      ) : (
        <div className="mt-2 text-xs text-normal">세션이 종료되었습니다.</div>
      )}
    </div>
  );
}

export default function AlertList({
  alerts,
  onTerminate,
  reconnecting = false,
}: {
  alerts: AlertEvent[];
  onTerminate: (sessionId: string) => void;
  /** true면 mock도 실시간 연결도 아닌, 연결 시도/재연결 중인 과도기 상태 */
  reconnecting?: boolean;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">실시간 알림</h2>
          {reconnecting && (
            <span className="flex items-center gap-1 text-[10px] text-warn">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
              재연결 중...
            </span>
          )}
        </div>
        <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs font-mono text-danger">
          {alerts.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">
            현재 탐지된 이상 접근이 없습니다.
          </div>
        ) : (
          alerts.map((a) => (
            <AlertItem key={a.id} alert={a} onTerminate={onTerminate} />
          ))
        )}
      </div>
    </div>
  );
}
