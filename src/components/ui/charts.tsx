"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCount } from "@/lib/format";
import {
  Bar,
  BarChart as RechartsBarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
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

function normalizeStatusName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function getCertificateStatusHref(name: string) {
  const normalized = normalizeStatusName(name);

  if (normalized === "em dia" || normalized === "validos" || normalized.includes("lidos")) {
    return "/certificados?situacao=em_dia";
  }

  if (
    normalized === "vencendo" ||
    normalized === "vence em breve" ||
    normalized === "vencem em breve" ||
    normalized === "proximo" ||
    normalized === "proximos"
  ) {
    return "/certificados?situacao=vence_em_breve";
  }

  if (normalized === "vencidos") {
    return "/certificados?situacao=vencido";
  }

  return null;
}

function expirationLabel(name: string) {
  const labels: Record<string, string> = {
    "7 dias": "0\u20137 dias",
    "15 dias": "8\u201315 dias",
    "30 dias": "16\u201330 dias",
  };
  return labels[name] ?? name;
}

function certificateCount(value: number | string) {
  return `${formatCount(Number(value))} ${Number(value) === 1 ? "certificado" : "certificados"}`;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  const name = item.payload?.name ?? item.name ?? label ?? "Certificados";

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-[0_8px_24px_rgba(16,24,40,0.12)]">
      <p className="font-semibold text-text">{expirationLabel(name)}</p>
      <p className="mt-1 tabular-nums text-text-2">{certificateCount(item.value ?? 0)}</p>
    </div>
  );
}

export function DonutChart({ data, total }: { data: DonutData[]; total: number }) {
  const safeTotal = Math.max(total, 1);
  const empty = total === 0 || data.every((item) => item.value === 0);
  const chartData = empty ? [{ name: "Sem certificados", value: 1, color: "var(--surface-muted)" }] : data;

  return (
    <div className="grid w-full min-w-0 gap-6 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto h-[176px] w-[176px]" role="img" aria-label={`Total: ${certificateCount(total)}${empty ? ". Sem certificados para exibir." : ". Distribuição por situação na lista a seguir."}`}>
        <div className="h-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={64}
              outerRadius={88}
              paddingAngle={0}
              stroke="none"
              strokeWidth={0}
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[28px] leading-[34px] font-semibold tabular-nums text-text">{formatCount(total)}</span>
          <span className="text-[13px] leading-5 text-text-3">certificados</span>
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[320px]">
        {data.map((item) => {
          const percent = Math.round((item.value / safeTotal) * 100);
          const href = getCertificateStatusHref(item.name);
          const content = (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="break-words text-sm text-text">{item.name}</span>
              </div>
              <span className="text-right text-sm font-semibold tabular-nums text-text">{formatCount(item.value)}</span>
              <span className="text-right text-[13px] leading-5 tabular-nums text-text-3">{percent}%</span>
            </>
          );

          return href ? (
            <Link
              key={item.name}
              href={href}
              className="grid grid-cols-[minmax(0,1fr)_auto_48px] items-center gap-2 py-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              title={`Ver certificados ${item.name.toLowerCase()}`}
              aria-label={`Ver certificados ${item.name.toLowerCase()}: ${certificateCount(item.value)}, ${percent}% do total`}
            >
              {content}
            </Link>
          ) : (
            <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto_48px] items-center gap-2 py-3">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ExpirationBarChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const router = useRouter();
  return (
    <div className="min-w-0 tabular-nums">
      <div className="h-[220px]" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} margin={{ top: 24, right: 0, left: 0, bottom: 0 }} accessibilityLayer={false}>
          <XAxis dataKey="name" tickFormatter={expirationLabel} interval={0} minTickGap={0} tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--text-2)", fontSize: 13 }} />
          <Tooltip cursor={{ fill: "var(--surface-hover)" }} content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={40} minPointSize={(value) => value === 0 ? 0.01 : 0}
            onClick={(_, index) => { if (data[index]?.name === "Vencidos") router.push("/certificados?situacao=vencido"); }}>
            <LabelList dataKey="value" position="top" offset={8} fill="var(--text)" fontSize={13} fontWeight={600} formatter={(value) => formatCount(Number(value))} />
            {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} cursor={entry.name === "Vencidos" ? "pointer" : "default"} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Certificados por faixa de vencimento</caption>
        <thead><tr><th scope="col">Prazo</th><th scope="col">Certificados</th></tr></thead>
        <tbody>
        {data.map((item) => (
          <tr key={item.name}><th scope="row">{expirationLabel(item.name)}</th><td>{formatCount(item.value)}</td></tr>
        ))}
        </tbody>
      </table>
      <Link href="/certificados?situacao=vencido" className="sr-only text-sm text-primary focus:not-sr-only focus:outline-2 focus:outline-offset-2 focus:outline-primary">Ver certificados vencidos</Link>
      {data.length === 0 ? (
        <p className="text-sm text-text-3">Indisponível</p>
      ) : null}
    </div>
  );
}
