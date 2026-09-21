import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "관제 대시보드",
  description: "실시간 로그인 관제 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="font-sans">{children}</body>
    </html>
  );
}
