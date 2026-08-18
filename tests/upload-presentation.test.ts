import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatUploadFileSize,
  getUploadCommunicationErrorMessage,
  getUploadFallbackErrorMessage,
  getUploadFileSummary,
} from "@/lib/certificados/upload-presentation";

const uploadFormSource = readFileSync(
  join(process.cwd(), "src/app/(internal)/certificados/novo/upload-certificate-form.tsx"),
  "utf8",
);

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
    expect(getUploadFallbackErrorMessage()).toContain("certificado");
    expect(getUploadCommunicationErrorMessage()).toContain("Verifique");
  });

  it("mostra acoes de download e detalhes depois do cadastro ou atualizacao", () => {
    expect(uploadFormSource).toContain("uploadResult");
    expect(uploadFormSource).toContain("Certificado cadastrado com sucesso.");
    expect(uploadFormSource).toContain("Certificado atualizado com sucesso.");
    expect(uploadFormSource).toContain("/api/certificados/${uploadResult.id}/arquivo");
    expect(uploadFormSource).toContain("Baixar certificado");
    expect(uploadFormSource).toContain("Ver detalhes");
    expect(uploadFormSource).not.toContain("router.replace(`/certificados/${payload.certificado.id}`)");
  });
});
