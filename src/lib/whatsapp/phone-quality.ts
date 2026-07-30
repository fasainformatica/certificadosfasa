import { maskPhone, normalizeBrazilianPhone } from "@/lib/utils/phone";

export type WhatsAppPhoneQualityClient = {
  id: string;
  nome_razao_social: string;
  cnpj: string;
  telefone: string | null;
  whatsapp: string | null;
  whatsapp_notifications_enabled: boolean | null;
};

export type WhatsAppPhoneQualityIssueType = "missing_phone" | "invalid_phone" | "notifications_disabled";

export type WhatsAppPhoneQualityIssue = {
  type: WhatsAppPhoneQualityIssueType;
  clientId: string;
  clientName: string;
  cnpj: string;
  phoneMasked: string | null;
  title: string;
  description: string;
};

export type WhatsAppPhoneDuplicateGroup = {
  normalizedPhone: string;
  phoneMasked: string;
  count: number;
  clients: Array<{
    id: string;
    name: string;
    cnpj: string;
  }>;
};

export type WhatsAppPhoneQualitySummary = {
  totalClients: number;
  analyzedClients: number;
  analysisLimited: boolean;
  readyToSendCount: number;
  missingPhoneCount: number;
  invalidPhoneCount: number;
  notificationsDisabledCount: number;
  duplicateGroupCount: number;
  duplicateClientCount: number;
  issueSamples: WhatsAppPhoneQualityIssue[];
  duplicateGroups: WhatsAppPhoneDuplicateGroup[];
};

const DEFAULT_SAMPLE_LIMIT = 6;

function getPreferredPhone(client: Pick<WhatsAppPhoneQualityClient, "whatsapp" | "telefone">) {
  const whatsapp = client.whatsapp?.trim();

  if (whatsapp) {
    return whatsapp;
  }

  const telefone = client.telefone?.trim();
  return telefone || null;
}

function normalizePhoneSafely(value: string) {
  try {
    return normalizeBrazilianPhone(value);
  } catch {
    return null;
  }
}

function pushSample(
  samples: WhatsAppPhoneQualityIssue[],
  issue: WhatsAppPhoneQualityIssue,
  sampleLimit: number,
) {
  if (samples.length < sampleLimit) {
    samples.push(issue);
  }
}

export function analyzeWhatsAppPhoneQuality(
  clients: WhatsAppPhoneQualityClient[],
  options: {
    totalCount?: number;
    sampleLimit?: number;
  } = {},
): WhatsAppPhoneQualitySummary {
  const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;
  const totalClients = options.totalCount ?? clients.length;
  const missingIssues: WhatsAppPhoneQualityIssue[] = [];
  const invalidIssues: WhatsAppPhoneQualityIssue[] = [];
  const disabledIssues: WhatsAppPhoneQualityIssue[] = [];
  const clientsByNormalizedPhone = new Map<string, WhatsAppPhoneDuplicateGroup["clients"]>();
  let readyToSendCount = 0;
  let missingPhoneCount = 0;
  let invalidPhoneCount = 0;
  let notificationsDisabledCount = 0;

  for (const client of clients) {
    if (client.whatsapp_notifications_enabled === false) {
      notificationsDisabledCount += 1;
      pushSample(
        disabledIssues,
        {
          type: "notifications_disabled",
          clientId: client.id,
          clientName: client.nome_razao_social,
          cnpj: client.cnpj,
          phoneMasked: getPreferredPhone(client) ? maskPhone(getPreferredPhone(client)) : null,
          title: "Avisos bloqueados",
          description: "Este cliente nao entra na fila automatica enquanto os avisos estiverem desativados.",
        },
        sampleLimit,
      );
      continue;
    }

    const preferredPhone = getPreferredPhone(client);

    if (!preferredPhone) {
      missingPhoneCount += 1;
      pushSample(
        missingIssues,
        {
          type: "missing_phone",
          clientId: client.id,
          clientName: client.nome_razao_social,
          cnpj: client.cnpj,
          phoneMasked: null,
          title: "Sem telefone para envio",
          description: "Cadastre um WhatsApp ou desative os avisos deste cliente.",
        },
        sampleLimit,
      );
      continue;
    }

    const normalizedPhone = normalizePhoneSafely(preferredPhone);

    if (!normalizedPhone) {
      invalidPhoneCount += 1;
      pushSample(
        invalidIssues,
        {
          type: "invalid_phone",
          clientId: client.id,
          clientName: client.nome_razao_social,
          cnpj: client.cnpj,
          phoneMasked: maskPhone(preferredPhone),
          title: "Formato de telefone invalido",
          description: "Use DDD e numero completo. Exemplo: (11) 99999-9999.",
        },
        sampleLimit,
      );
      continue;
    }

    readyToSendCount += 1;

    const duplicateClients = clientsByNormalizedPhone.get(normalizedPhone) ?? [];
    duplicateClients.push({
      id: client.id,
      name: client.nome_razao_social,
      cnpj: client.cnpj,
    });
    clientsByNormalizedPhone.set(normalizedPhone, duplicateClients);
  }

  const duplicateGroups = [...clientsByNormalizedPhone.entries()]
    .filter(([, duplicateClients]) => duplicateClients.length > 1)
    .map(([normalizedPhone, duplicateClients]) => ({
      normalizedPhone,
      phoneMasked: maskPhone(normalizedPhone),
      count: duplicateClients.length,
      clients: duplicateClients.slice(0, sampleLimit),
    }));

  return {
    totalClients,
    analyzedClients: clients.length,
    analysisLimited: clients.length < totalClients,
    readyToSendCount,
    missingPhoneCount,
    invalidPhoneCount,
    notificationsDisabledCount,
    duplicateGroupCount: duplicateGroups.length,
    duplicateClientCount: duplicateGroups.reduce((total, group) => total + group.count, 0),
    issueSamples: [...invalidIssues, ...missingIssues, ...disabledIssues].slice(0, sampleLimit),
    duplicateGroups: duplicateGroups.slice(0, sampleLimit),
  };
}
