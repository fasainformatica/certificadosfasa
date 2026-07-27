import { describe, expect, it } from "vitest";

import { MAX_PFX_SIZE_BYTES } from "@/lib/validations/certificados";
import { CertificateUploadError, isPfxUploadFile, registerCertificateUpload } from "@/lib/certificados/upload-service";
import { getCertificateStoragePath } from "@/lib/storage/certificates";

const clientData = {
  nome_razao_social: "Cliente Teste",
};

function input(buffer: Buffer, fileName = "certificado.pfx") {
  return {
    admin: {} as never,
    userId: "00000000-0000-0000-0000-000000000001",
    ip: null,
    fileName,
    buffer,
    password: "senha",
    clientData,
  };
}

describe("upload PFX", () => {
  it("aceita somente arquivo .pfx nao vazio com assinatura ASN.1", () => {
    expect(isPfxUploadFile("certificado.pfx", Buffer.from([0x30, 0x82]))).toBe(true);
    expect(isPfxUploadFile("certificado.txt", Buffer.from([0x30, 0x82]))).toBe(false);
    expect(isPfxUploadFile("certificado.pfx", Buffer.from([0x31, 0x82]))).toBe(false);
    expect(isPfxUploadFile("certificado.pfx", Buffer.alloc(0))).toBe(false);
  });

  it("salva cada versao do PFX em um caminho proprio dentro da pasta do CNPJ", () => {
    const firstHash = "a".repeat(64);
    const secondHash = "b".repeat(64);

    expect(getCertificateStoragePath("11222333000144", firstHash)).toBe(
      "certificados/11222333000144/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pfx",
    );
    expect(getCertificateStoragePath("11222333000144", secondHash)).toBe(
      "certificados/11222333000144/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pfx",
    );
    expect(getCertificateStoragePath("11222333000144", firstHash)).not.toBe(
      getCertificateStoragePath("11222333000144", secondHash),
    );
  });

  it("falha antes de banco/storage quando arquivo esta vazio", async () => {
    await expect(registerCertificateUpload(input(Buffer.alloc(0)))).rejects.toMatchObject({
      status: 400,
      code: "arquivo_vazio",
    } satisfies Partial<CertificateUploadError>);
  });

  it("falha antes de banco/storage quando arquivo excede limite", async () => {
    await expect(registerCertificateUpload(input(Buffer.alloc(MAX_PFX_SIZE_BYTES + 1)))).rejects.toMatchObject({
      status: 413,
      code: "arquivo_muito_grande",
    } satisfies Partial<CertificateUploadError>);
  });

  it("falha com mensagem generica para arquivo que nao parece PFX", async () => {
    await expect(registerCertificateUpload(input(Buffer.from("not a pfx")))).rejects.toMatchObject({
      status: 400,
      code: "pfx_invalido",
      message: "Senha incorreta ou certificado inválido.",
    } satisfies Partial<CertificateUploadError>);
  });
});
