"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(username, password)) {
      router.replace("/");
    } else {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-6"
      >
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-normal shadow-[0_0_8px_2px_rgba(76,159,232,0.6)]" />
          <h1 className="text-base font-semibold text-ink">
            Zero-Watch <span className="font-normal text-muted">관제 대시보드</span>
          </h1>
        </div>

        <p className="mb-4 text-xs text-muted">관리자 계정으로만 접근할 수 있습니다.</p>

        <label className="mb-1 block text-xs text-muted" htmlFor="username">
          아이디
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-normal"
          autoFocus
        />

        <label className="mb-1 block text-xs text-muted" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-normal"
        />

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <button
          type="submit"
          className="w-full rounded bg-normal py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          로그인
        </button>
      </form>
    </div>
  );
}
