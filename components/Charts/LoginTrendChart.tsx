"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useElementSize } from "@/lib/useElementSize";

export default function LoginTrendChart({
  data,
}: {
  data: { hour: string; normal: number; alert: number }[];
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <h3 className="mb-2 text-xs font-semibold text-muted">시간대별 로그인 추이</h3>
      <div ref={ref} className="h-40 w-full">
        <AreaChart width={size.width} height={size.height} data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="normalFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4C9FE8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#4C9FE8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="alertFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8544C" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#E8544C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232B37" vertical={false} />
          <XAxis
            dataKey="hour"
            tick={{ fill: "#8B95A7", fontSize: 10 }}
            axisLine={{ stroke: "#232B37" }}
            tickLine={false}
            interval={3}
          />
          <YAxis tick={{ fill: "#8B95A7", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "#131820",
              border: "1px solid #232B37",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "#E5E9F0" }}
          />
          <Area type="monotone" dataKey="normal" stroke="#4C9FE8" fill="url(#normalFill)" strokeWidth={2} name="정상" />
          <Area type="monotone" dataKey="alert" stroke="#E8544C" fill="url(#alertFill)" strokeWidth={2} name="이상" />
        </AreaChart>
      </div>
    </div>
  );
}
