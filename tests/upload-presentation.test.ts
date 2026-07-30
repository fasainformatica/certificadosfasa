import { describe, expect, it } from "vitest";

import {
  formatUploadFileSize,
  getUploadCommunicationErrorMessage,
  getUploadFallbackErrorMessage,
  getUploadFileSummary,
} from "@/lib/certificados/upload-presentation";

describe("upload presentation", () => {
  it("formata tamanho de arquivo com unidades legiveis", () => {
    expect(formatUploadFileSize(0)).toBe("0 B");
    expect(formatUploadFileSize(512)).toBe("512 B");
    expect(formatUploadFileSize(1536)).toBe("1,5 KB");
    expect(formatUploadFileSize(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("gera resumo do arquivo selecionado sem depender do input nativo", () => {
    expect(getUploadFileSummary(null)).toBe("Nenhum arquivo selecionado");
    expect(getUploadFileSummary({ name: "cliente.pfx", size: 2048 })).toBe("cliente.pfx (2 KB)");
  });

  it("mantem mensagens de erro humanas para falhas comuns", () => {
    expect(getUploadFallbackErrorMessage()).toContain("Não foi possível enviar o certificado");
    expect(getUploadCommunicationErrorMessage()).toContain("Verifique sua conexão");
  });
});
