"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { useElementSize } from "@/lib/useElementSize";

export default function RuleHitChart({
  data,
}: {
  data: { ruleId: string; label: string; count: number }[];
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <h3 className="mb-2 text-xs font-semibold text-muted">룰별 탐지 건수</h3>
      <div ref={ref} className="h-40 w-full">
        <BarChart width={size.width} height={size.height} data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#232B37" vertical={false} />
          <XAxis
            dataKey="ruleId"
            tick={{ fill: "#8B95A7", fontSize: 10 }}
            axisLine={{ stroke: "#232B37" }}
            tickLine={false}
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
            formatter={(value: number, _name, item) => [value, item.payload.label]}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} minPointSize={2}>
            {data.map((d) => (
              <Cell key={d.ruleId} fill={d.ruleId === "R-01" || d.ruleId === "R-06" ? "#E8544C" : "#4C9FE8"} />
            ))}
          </Bar>
        </BarChart>
      </div>
    </div>
  );
}
