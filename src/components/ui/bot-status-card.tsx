import { Activity, Bot, Clock3, Send } from "lucide-react";

import { Badge, getBotStatusMeta } from "@/components/ui/status-badge";

type BotStatusCardProps = {
  online: boolean;
  name?: string | null;
  lastSeen?: string | null;
  pending: number;
  sentToday: number;
  failed: number;
};

export function BotStatusCard({ online, name, lastSeen, pending, sentToday, failed }: BotStatusCardProps) {
  const status = getBotStatusMeta(online);

  return (
    <article className="relative overflow-hidden rounded-3xl border border-blue-100/70 bg-white/84 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-xl hover:shadow-blue-950/10 sm:p-5">
      <div className="absolute right-4 top-4 h-20 w-20 rounded-full bg-sky-200/20 blur-2xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status do WhatsApp Bot</p>
          <h3 className="mt-2 truncate text-xl font-semibold text-slate-950">{name ?? "Nenhum dispositivo principal"}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500 shadow-[0_0_0_6px_rgba(34,197,94,0.12)]" : "bg-red-500 shadow-[0_0_0_6px_rgba(239,68,68,0.12)]"}`} />
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>
      <div className="relative mt-4 grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-100/70 bg-blue-50/55 p-3 sm:col-span-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Clock3 className="h-3.5 w-3.5" /> Última conexão
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {lastSeen ? new Date(lastSeen).toLocaleString("pt-BR") : "Não identificada"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/78 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Activity className="h-3.5 w-3.5" /> Aguardando
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">{pending}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/78 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Send className="h-3.5 w-3.5" /> Enviadas hoje
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">{sentToday}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/78 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <Bot className="h-3.5 w-3.5" /> Falhas
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-950">{failed}</p>
        </div>
      </div>
    </article>
  );
}
