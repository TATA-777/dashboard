"use client";

import dynamic from "next/dynamic";
import DashboardLayout from "@/components/DashboardLayout";
import AlertList from "@/components/AlertPanel/AlertList";
import AuthGuard from "@/components/AuthGuard";
import { useLiveDashboard } from "@/lib/useLiveDashboard";
import { useDashboardStats } from "@/lib/useDashboardStats";

const chartLoading = (
  <div className="flex h-40 items-center justify-center text-xs text-muted">
    차트를 불러오는 중...
  </div>
);

// recharts는 SSR 중 브라우저 전용 API에 의존하는 부분이 있어 서버 렌더링에서 에러가 남 → 클라이언트 전용으로 로드
const WorldMap = dynamic(() => import("@/components/MapPanel/WorldMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-muted">
      지도를 불러오는 중...
    </div>
  ),
});
const LoginTrendChart = dynamic(() => import("@/components/Charts/LoginTrendChart"), {
  ssr: false,
  loading: () => chartLoading,
});
const RuleHitChart = dynamic(() => import("@/components/Charts/RuleHitChart"), {
  ssr: false,
  loading: () => chartLoading,
});
const ProfileDistChart = dynamic(() => import("@/components/Charts/ProfileDistChart"), {
  ssr: false,
  loading: () => chartLoading,
});

export default function DashboardPage() {
  const { events, alerts, connected, usingMock, handleTerminate } = useLiveDashboard();
  const { loginTrend, ruleHits, profileDist } = useDashboardStats();

  return (
    <AuthGuard>
      <DashboardLayout connected={connected} usingMock={usingMock}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          {/* 지도 영역 */}
          <div className="h-[420px]">
            <WorldMap events={events} />
          </div>

          {/* 알림 패널 */}
          <div className="h-[420px]">
            <AlertList
              alerts={alerts}
              onTerminate={handleTerminate}
              reconnecting={!usingMock && !connected}
            />
          </div>
        </div>

        {/* 하단 차트 3종 */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <LoginTrendChart data={loginTrend} />
          <RuleHitChart data={ruleHits} />
          <ProfileDistChart data={profileDist} />
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}