export type UploadFileSummaryInput = {
  name: string;
  size: number;
};

function formatRoundedSize(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

export function formatUploadFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "-";
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${formatRoundedSize(kilobytes)} KB`;
  }

  return `${formatRoundedSize(kilobytes / 1024)} MB`;
}

export function getUploadFileSummary(file: UploadFileSummaryInput | null | undefined) {
  if (!file) {
    return "Nenhum arquivo selecionado";
  }

  return `${file.name} (${formatUploadFileSize(file.size)})`;
}

export function getUploadFallbackErrorMessage() {
  return "Não foi possível enviar o certificado. Revise o arquivo e tente novamente.";
}

export function getUploadCommunicationErrorMessage() {
  return "Não foi possível conversar com o servidor. Verifique sua conexão e tente novamente.";
}
