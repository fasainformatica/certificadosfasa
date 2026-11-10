import type { ReactNode } from "react";

import type { CertificadoStatus } from "@/lib/supabase/database.types";
import { CERTIFICATE_STATUS_CLASS, CERTIFICATE_STATUS_LABEL } from "@/lib/certificados/status-labels";
import { cn } from "@/lib/utils/cn";

export type Tone = "blue" | "green" | "amber" | "red" | "slate";

const toneClasses: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-800",
  green: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-900",
  red: "bg-red-50 text-red-800",
  slate: "bg-slate-100 text-slate-700",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: CertificadoStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150",
        CERTIFICATE_STATUS_CLASS[status],
      )}
    >
      {CERTIFICATE_STATUS_LABEL[status]}
    </span>
  );
}

export function getBotStatusMeta(connected: boolean): { label: string; tone: Tone } {
  return connected ? { label: "Conectado", tone: "green" } : { label: "Desconectado", tone: "red" };
}
