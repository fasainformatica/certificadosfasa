export function getBulkImportEmptySelectionMessage() {
  return "Selecione a pasta principal onde estão os certificados.";
}

export function getBulkImportNoBatchMessage() {
  return "Nenhum certificado .pfx com arquivo .txt de senha foi encontrado na estrutura esperada.";
}

export function getBulkImportBatchErrorMessage() {
  return "Não foi possível importar este lote. Revise os arquivos e tente novamente.";
}

export function getBulkImportCommunicationErrorMessage() {
  return "Não foi possível conversar com o servidor. Verifique sua conexão e tente novamente.";
}

export function getBulkImportProgressLabel(current: number, total: number) {
  if (total <= 0) {
    return "Preparando importação.";
  }

  return `Processando lote ${current} de ${total}. Mantenha esta tela aberta até finalizar.`;
}
