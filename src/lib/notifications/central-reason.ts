import type { CentralEvent } from "./central-list";
import { getSafeNotificationErrorMessage } from "./event-presentation";

/** N13: a cancelled event never shows a delivery failure. */
export function getCentralReason(event: Pick<CentralEvent, "status" | "error_message">): { short: string; full: string } | null {
  if (event.status === "cancelled" || event.status === "skipped") {
    const raw = event.error_message?.trim().toLowerCase() ?? "";
    if (raw.includes("saiu do acompanhamento")) return { short: "Cancelado: fora do acompanhamento", full: "O certificado saiu do acompanhamento de renovação." };
    if (raw.includes("destinatario desativado") || raw.includes("categoria desmarcada")) return { short: "Cancelado: contato desativado", full: "O destinatário foi desativado ou a categoria foi desmarcada." };
    if (raw.includes("destinatario ou comunicado")) return { short: "Cancelado: contato indisponível", full: "O destinatário ou o comunicado não está mais disponível." };
    return null;
  }
  if (event.status !== "failed") return null;
  const full = getSafeNotificationErrorMessage(event.error_message);
  return full ? { short: full.split(". ")[0].replace(/\.$/, ""), full } : null;
}
