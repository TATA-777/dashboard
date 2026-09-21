"use client";

import { useEffect, useState } from "react";
import {
  fetchLoginTrend,
  fetchRuleHits,
  fetchProfileDist,
  type LoginTrendPoint,
  type RuleHitPoint,
  type ProfileDistPoint,
} from "./api";
import { mockLoginTrend, mockRuleHits, mockProfileDist } from "@/mock/mockData";

const FORCE_MOCK = process.env.NEXT_PUBLIC_FORCE_MOCK === "true";
const POLL_INTERVAL_MS = 30_000; // 소켓 이벤트가 아니라 집계 수치라 30초 주기 폴링으로 충분

/**
 * 하단 차트 3종(로그인 추이 / 룰별 탐지 / 프로파일 분포) 데이터.
 * 엔드포인트가 아직 미정이라, API 호출이 실패하면 조용히 mock으로 폴백한다.
 * (에러를 화면에 노출하지 않는 이유: 통계 차트는 실패해도 대시보드 전체 사용에
 *  지장이 없어야 하므로 — 알림/세션 패널과 달리 실패를 시끄럽게 알릴 필요 없음)
 */
export function useDashboardStats() {
  const [loginTrend, setLoginTrend] = useState<LoginTrendPoint[]>(mockLoginTrend);
  const [ruleHits, setRuleHits] = useState<RuleHitPoint[]>(mockRuleHits);
  const [profileDist, setProfileDist] = useState<ProfileDistPoint[]>(mockProfileDist);
  const [usingMock, setUsingMock] = useState(true);

  useEffect(() => {
    if (FORCE_MOCK) {
      setUsingMock(true);
      return;
    }

    let cancelled = false;

    const load = async () => {
      console.log("[통계 디버그] 폴링 시작");
      try {
        const [trend, rules, dist] = await Promise.all([
          fetchLoginTrend(),
          fetchRuleHits(),
          fetchProfileDist(),
        ]);
        if (cancelled) return;
        setLoginTrend(trend);
        setRuleHits(rules);
        setProfileDist(dist);
        setUsingMock(false);
      } catch (err) {
        // 엔드포인트 미확정/서버 미준비 상태에서는 실패가 정상이므로 mock 유지
        console.error("[통계 디버그] 로딩 실패:", err);
        if (!cancelled) setUsingMock(true);
      }
    };

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { loginTrend, ruleHits, profileDist, usingMock };
}
