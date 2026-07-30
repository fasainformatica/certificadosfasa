import { describe, expect, it } from "vitest";

import {
  getBulkImportBatchErrorMessage,
  getBulkImportCommunicationErrorMessage,
  getBulkImportEmptySelectionMessage,
  getBulkImportNoBatchMessage,
  getBulkImportProgressLabel,
} from "@/lib/certificados/bulk-import-presentation";

describe("bulk import presentation", () => {
  it("mantem mensagens de erro acionaveis", () => {
    expect(getBulkImportEmptySelectionMessage()).toContain("Selecione a pasta principal");
    expect(getBulkImportNoBatchMessage()).toContain("Nenhum certificado .pfx");
    expect(getBulkImportBatchErrorMessage()).toContain("Não foi possível importar este lote");
    expect(getBulkImportCommunicationErrorMessage()).toContain("Verifique sua conexão");
  });

  it("descreve o progresso por lote", () => {
    expect(getBulkImportProgressLabel(2, 5)).toBe("Processando lote 2 de 5. Mantenha esta tela aberta até finalizar.");
    expect(getBulkImportProgressLabel(0, 0)).toBe("Preparando importação.");
  });
});
