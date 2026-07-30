import type { NotificationProvider } from "@/lib/supabase/database.types";
import { EUATENDO_PROVIDER, WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

type ManualNoticeDeliveryMode = "sent" | "queued";
type ManualNoticeFailureStage = "config" | "queue" | "send";

export function getManualNoticeProviderLabel(provider: NotificationProvider) {
  if (provider === WHATSAPP_EXTENSION_PROVIDER) {
    return "extensão do Chrome";
  }

  if (provider === EUATENDO_PROVIDER) {
    return "euAtendo";
  }

  return "WhatsApp";
}

export function getManualNoticeSuccessMessage({
  provider,
  mode,
}: {
  provider: NotificationProvider;
  mode: ManualNoticeDeliveryMode;
}) {
  const providerLabel = getManualNoticeProviderLabel(provider);

  if (mode === "queued") {
    return `Aviso adicionado à fila da ${providerLabel}. O envio acontecerá quando o WhatsApp Web buscar a próxima mensagem.`;
  }

  return `Aviso enviado com sucesso pelo ${providerLabel}.`;
}

export function getManualNoticeFailureMessage({
  provider,
  stage,
}: {
  provider: NotificationProvider;
  stage: ManualNoticeFailureStage;
}) {
  const providerLabel = getManualNoticeProviderLabel(provider);

  if (stage === "config") {
    return `Não foi possível enviar o aviso. O canal ${providerLabel} não está configurado para envio.`;
  }

  if (stage === "queue") {
    return `Não foi possível adicionar o aviso à fila da ${providerLabel}. Tente novamente em alguns instantes.`;
  }

  return `Não foi possível enviar o aviso pelo ${providerLabel}. Verifique o canal de envio e tente novamente.`;
}
