export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
export type StatusPresentation = Readonly<{ label: string; tone: StatusTone }>;

export const STATUS_LABELS = {
  validade: {
    em_dia: { label: "Em dia", tone: "success" },
    vence_em_breve: { label: "Vence em breve", tone: "warning" },
    vencido: { label: "Vencido", tone: "danger" },
  },
  renovacao: {
    em_acompanhamento: { label: "Em acompanhamento", tone: "neutral" },
    renovado_fasa: { label: "Renovado com a Fasa", tone: "success" },
    renovado_fora: { label: "Renovado fora", tone: "neutral" },
    sem_retorno: { label: "Sem retorno", tone: "warning" },
    pausado: { label: "Pausado", tone: "warning" },
    inativo: { label: "Inativo", tone: "neutral" },
  },
  aviso: {
    na_fila: { label: "Na fila", tone: "info" },
    processando: { label: "Enviando", tone: "info" },
    nova_tentativa: { label: "Nova tentativa", tone: "warning" },
    enviado: { label: "Enviado", tone: "success" },
    falha: { label: "Falha no envio", tone: "danger" },
    cancelado: { label: "Cancelado", tone: "neutral" },
  },
  cliente: {
    avisos_permitidos: { label: "Avisos permitidos", tone: "success" },
    sem_whatsapp: { label: "Sem WhatsApp", tone: "warning" },
    avisos_desativados: { label: "Avisos desativados", tone: "neutral" },
  },
  canal: {
    configurado: { label: "Configurado", tone: "success" },
    nao_configurado: { label: "Não configurado", tone: "danger" },
  },
  conexao: {
    verificada: { label: "Conectada", tone: "success" },
    nao_verificada: { label: "Ainda não verificada", tone: "warning" },
    falhou: { label: "Falha na conexão", tone: "danger" },
  },
  automacao: {
    habilitada: { label: "Habilitada", tone: "neutral" },
    desligada: { label: "Desligada", tone: "neutral" },
  },
  envio: {
    liberado: { label: "Envio liberado", tone: "neutral" },
    pausado: { label: "Envio pausado", tone: "warning" },
  },
} as const satisfies Record<string, Record<string, StatusPresentation>>;

export type StatusDomain = keyof typeof STATUS_LABELS;
export type StatusValue<D extends StatusDomain> = keyof (typeof STATUS_LABELS)[D];
export type StatusSelection = { [D in StatusDomain]: { domain: D; status: StatusValue<D> } }[StatusDomain];

export function getStatusLabel<D extends StatusDomain>(domain: D, status: StatusValue<D>): StatusPresentation {
  return STATUS_LABELS[domain][status] as StatusPresentation;
}

export function getStatusPresentation(selection: StatusSelection): StatusPresentation {
  const domain: Readonly<Record<string, StatusPresentation>> = STATUS_LABELS[selection.domain];
  return domain[selection.status];
}

/** Stored event status to the display map. Skipped has no label of its own in the specification. */
export const NOTICE_DISPLAY_STATUS: Readonly<Record<string, StatusValue<"aviso">>> = {
  pending: "na_fila", reserved: "processando", processing: "processando", retry: "nova_tentativa",
  sent: "enviado", failed: "falha", cancelled: "cancelado", skipped: "cancelado",
};

/** Channel log status; outcomes that are not a delivery state get no badge. */
export const CHANNEL_LOG_DISPLAY_STATUS: Readonly<Record<string, StatusValue<"aviso">>> = {
  sent: "enviado", retry: "nova_tentativa", failed: "falha", error: "falha", waiting: "na_fila",
};

export const CHANNEL_EVENT_LABELS: Readonly<Record<string, string>> = {
  dispatch: "Execução do envio", operational_safety: "Verificação de segurança", reserve: "Reserva de mensagem",
  send_text: "Envio de mensagem", extension_ack: "Confirmação da extensão", extension_safety: "Verificação de segurança da extensão",
  extension_reserve: "Reserva de mensagem pela extensão", manual_certificate_notice: "Aviso manual de certificado",
};
