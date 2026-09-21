"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUsername, logout } from "@/lib/auth";

export default function DashboardLayout({
  children,
  connected = false,
  usingMock = true,
}: {
  children: React.ReactNode;
  connected?: boolean;
  usingMock?: boolean;
}) {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    setUsername(getCurrentUsername());
  }, []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-base">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`h-2 w-2 rounded-full ${
              connected
                ? "bg-normal shadow-[0_0_8px_2px_rgba(76,159,232,0.6)]"
                : "bg-warn shadow-[0_0_8px_2px_rgba(232,162,61,0.5)]"
            }`}
          />
          <h1 className="text-base font-semibold tracking-tight text-ink">
            Zero-Watch <span className="text-muted font-normal">관제 대시보드</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-muted">
          <span
            className={`rounded border px-2 py-1 ${
              usingMock
                ? "border-warn/40 text-warn"
                : "border-normal/40 text-normal"
            }`}
          >
            {usingMock ? "MOCK 데이터" : connected ? "실시간 연결됨" : "재연결 중..."}
          </span>
          <span>관리자: {username ?? "admin"}</span>
          <span className="rounded border border-line px-2 py-1">Korea · ap-northeast-2</span>
          <button
            onClick={handleLogout}
            className="rounded border border-line px-2 py-1 text-muted hover:border-danger/50 hover:text-danger"
          >
            로그아웃
          </button>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
