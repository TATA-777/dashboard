"use client";

// ⚠️ recharts의 PieChart/Pie가 이 환경에서 좌표 계산 시 NaN을 내는
// 해결 안 되는 버그가 있어서(콘솔: `<path> attribute d: Expected number, "M NaN,NaN"`),
// recharts 없이 순수 SVG(stroke-dasharray 도넛 기법)로 직접 그림.
// 다른 두 차트(LoginTrendChart, RuleHitChart)는 recharts 그대로 사용 중 — 거긴 문제 없었음.

const COLORS: Record<string, string> = {
  Low: "#4C9FE8",
  High: "#E8A23D",
  "Zero-Trust": "#E8544C",
};

const SIZE = 140; // svg viewBox 한 변
const STROKE_WIDTH = 22;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ProfileDistChart({
  data,
}: {
  data: { profile: string; count: number }[];
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0) || 1;

  // 각 구간의 dasharray/offset을 누적해서 계산 (도넛 조각을 이어붙이는 방식)
  let cumulative = 0;
  const segments = data.map((d) => {
    const fraction = d.count / total;
    const length = fraction * CIRCUMFERENCE;
    const offset = cumulative;
    cumulative += length;
    return { ...d, length, offset };
  });

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <h3 className="mb-2 text-xs font-semibold text-muted">프로파일 분포</h3>
      <div className="flex h-40 w-full items-center justify-center gap-4">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="-rotate-90"
        >
          {segments.map((s) => (
            <circle
              key={s.profile}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={COLORS[s.profile] ?? "#8B95A7"}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
              strokeDashoffset={-s.offset}
            >
              <title>
                {s.profile}: {s.count}건 ({Math.round((s.count / total) * 100)}%)
              </title>
            </circle>
          ))}
        </svg>

        <div className="flex flex-col gap-1.5 text-[11px] text-muted">
          {data.map((d) => (
            <span key={d.profile} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: COLORS[d.profile] ?? "#8B95A7" }}
              />
              {d.profile} <span className="font-mono text-ink">{d.count}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
