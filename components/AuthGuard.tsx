"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

/**
 * 대시보드 페이지를 감싸서 로그인 안 한 사람은 /login으로 보냄.
 * 자동 로그아웃(타임아웃) 로직은 없음 — 한 번 로그인하면 로그아웃 버튼을
 * 직접 누르기 전까지 계속 로그인 상태 유지.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    // 로그인 여부 확인 중에는 빈 화면(깜빡임 방지). 오래 걸리지 않는 로컬 체크라 순간적으로만 보임.
    return <div className="min-h-screen bg-base" />;
  }

  return <>{children}</>;
}
