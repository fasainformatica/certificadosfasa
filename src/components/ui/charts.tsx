"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DonutData = {
  name: string;
  value: number;
  color: string;
};

type TooltipPayload = {
  value?: number | string;
  name?: string;
  color?: string;
  payload?: {
    name?: string;
    color?: string;
  };
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  const name = item.payload?.name ?? item.name ?? label ?? "Certificados";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-xl shadow-blue-950/10 ring-1 ring-white/70 backdrop-blur">
      <p className="font-semibold text-slate-950">{name}</p>
      <p className="mt-1 text-slate-600">{item.value ?? 0} certificados</p>
    </div>
  );
}

export function DonutChart({ data, total }: { data: DonutData[]; total: number }) {
  const safeTotal = Math.max(total, 1);
  const empty = total === 0 || data.every((item) => item.value === 0);
  const chartData = empty ? [{ name: "Sem certificados", value: 1, color: "#E2E8F0" }] : data;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr] lg:items-center">
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={empty ? 0 : 3}
              stroke="#ffffff"
              strokeWidth={3}
              isAnimationActive={!empty}
              animationDuration={650}
              animationEasing="ease-out"
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            {!empty ? <Tooltip content={<ChartTooltip />} /> : null}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-slate-950">{total}</span>
          <span className="text-xs font-medium text-slate-500">total</span>
        </div>
      </div>
      <div className="grid gap-3">
        {data.map((item) => {
          const percent = Math.round((item.value / safeTotal) * 100);

          return (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl border border-blue-100/70 bg-white px-3 py-2 shadow-sm shadow-blue-950/5 transition duration-150 hover:bg-blue-50/70">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm font-medium text-slate-700">{item.name}</span>
              </div>
              <span className="text-sm font-semibold text-slate-950">
                {percent}% <span className="text-slate-400">({item.value})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExpirationBarChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} margin={{ top: 18, right: 10, left: -16, bottom: 0 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
          <Tooltip cursor={{ fill: "#EFF6FF", radius: 12 }} content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[12, 12, 0, 0]} isAnimationActive animationDuration={650} animationEasing="ease-out" maxBarSize={50}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
