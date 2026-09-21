"use client";

import { useEffect, useRef, useState } from "react";

interface Size {
  width: number;
  height: number;
}

/**
 * recharts의 ResponsiveContainer가 일부 환경(Next.js Turbopack 등)에서
 * ResizeObserver 신호를 못 받아 빈 화면으로 남는 이슈가 있어서,
 * 크기 측정을 직접 해서 차트에 숫자로 넘겨주기 위한 훅.
 *
 * fallback은 요소가 아직 측정되기 전(마운트 직후) 잠깐 보여줄 기본 크기.
 */
export function useElementSize<T extends HTMLElement>(
  fallback: Size = { width: 320, height: 160 }
) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };

    measure(); // 마운트 직후 1회 즉시 측정

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
