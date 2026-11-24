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
  return <div role="status" aria-label="Carregando gráfico" className="h-[220px] w-full animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />;
}

export function LazyDonutChart({ data, total }: { data: ChartItem[]; total: number }) {
  return <DynamicDonutChart data={data} total={total} />;
}

export function LazyExpirationBarChart({ data }: { data: ChartItem[] }) {
  return <DynamicExpirationBarChart data={data} />;
}
