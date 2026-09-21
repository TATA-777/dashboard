import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0A0E14",       // 배경
        surface: "#131820",    // 패널
        surface2: "#1A2029",   // 패널 hover/구분
        line: "#232B37",       // 경계선/그리드
        ink: "#E5E9F0",        // 본문 텍스트
        muted: "#8B95A7",      // 보조 텍스트
        normal: "#4C9FE8",     // 정상 접속 (스틸블루)
        danger: "#E8544C",     // 이상 탐지 (시그널레드)
        warn: "#E8A23D",       // 경고 (앰버)
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        sonar: {
          "0%": { transform: "scale(0.6)", opacity: "0.8" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      animation: {
        sonar: "sonar 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
