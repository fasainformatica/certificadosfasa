"use client";

import dynamic from "next/dynamic";

type ChartItem = {
  name: string;
  value: number;
  color: string;
};

const DynamicDonutChart = dynamic(() => import("@/components/ui/charts").then((mod) => mod.DonutChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const DynamicExpirationBarChart = dynamic(() => import("@/components/ui/charts").then((mod) => mod.ExpirationBarChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

function ChartSkeleton() {
  return <div className="h-56 animate-pulse rounded-2xl border border-slate-100 bg-slate-100/70" />;
}

export function LazyDonutChart({ data, total }: { data: ChartItem[]; total: number }) {
  return <DynamicDonutChart data={data} total={total} />;
}

export function LazyExpirationBarChart({ data }: { data: ChartItem[] }) {
  return <DynamicExpirationBarChart data={data} />;
}
