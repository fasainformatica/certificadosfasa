import type { Tone } from "@/components/ui/status-badge";

export type ClientPresentationInput = {
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  whatsapp_notifications_enabled?: boolean | null;
  responsavel: string | null;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function hasClientPhone(client: Pick<ClientPresentationInput, "telefone" | "whatsapp">) {
  return hasText(client.whatsapp) || hasText(client.telefone);
}

export function getClientNoticePresentation(client: Pick<ClientPresentationInput, "telefone" | "whatsapp" | "whatsapp_notifications_enabled">) {
  if (client.whatsapp_notifications_enabled === false) {
    return {
      label: "Avisos pausados",
      tone: "amber" as Tone,
      description: "Este cliente não recebe avisos automáticos por WhatsApp.",
    };
  }

  if (!hasClientPhone(client)) {
    return {
      label: "Sem WhatsApp",
      tone: "red" as Tone,
      description: "Cadastre um WhatsApp ou telefone para permitir avisos ao cliente.",
    };
  }

  return {
    label: "Avisos permitidos",
    tone: "green" as Tone,
    description: "O cliente pode entrar na fila de avisos quando houver certificado elegível.",
  };
}

export function getClientContactSummary(client: Pick<ClientPresentationInput, "email" | "telefone" | "whatsapp">) {
  const hasPhone = hasClientPhone(client);
  const hasEmail = hasText(client.email);

  if (hasPhone && hasEmail) {
    return {
      label: "Contato completo",
      tone: "green" as Tone,
    };
  }

  if (hasPhone) {
    return {
      label: "Telefone cadastrado",
      tone: "blue" as Tone,
    };
  }

  if (hasEmail) {
    return {
      label: "Somente e-mail",
      tone: "amber" as Tone,
    };
  }

  return {
    label: "Sem contato",
    tone: "red" as Tone,
  };
}

export function buildClientPageSummary(clients: ClientPresentationInput[], totalClients: number) {
  const withoutPhone = clients.filter((client) => !hasClientPhone(client)).length;
  const pausedNotices = clients.filter((client) => client.whatsapp_notifications_enabled === false).length;
  const withoutResponsible = clients.filter((client) => !hasText(client.responsavel)).length;

  return {
    totalClients,
    currentPageClients: clients.length,
    withPhone: clients.length - withoutPhone,
    withoutPhone,
    pausedNotices,
    withoutResponsible,
  };
}
