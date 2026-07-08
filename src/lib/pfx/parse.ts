import "server-only";

import forge from "node-forge";

import { extractFirstValidCnpj } from "./cnpj";

export class PfxParseError extends Error {
  constructor() {
    super("Senha incorreta ou certificado invalido.");
    this.name = "PfxParseError";
  }
}

export type ParsedPfx = {
  cnpj: string | null;
  nomeTitular: string;
  dataEmissao: string | null;
  dataVencimento: string;
};

type Pkcs12CertBag = {
  cert?: forge.pki.Certificate;
};

type ForgeExtension = {
  name?: string;
  value?: unknown;
  altNames?: Array<{
    type?: number;
    value?: unknown;
    oid?: string;
  }>;
};

function valueToText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return "";
}

function collectCertificateText(cert: forge.pki.Certificate) {
  const chunks: string[] = [];

  for (const attribute of cert.subject.attributes) {
    chunks.push(valueToText(attribute.value));
    chunks.push(valueToText(attribute.name));
    chunks.push(valueToText(attribute.shortName));
  }

  for (const attribute of cert.issuer.attributes) {
    chunks.push(valueToText(attribute.value));
  }

  for (const extension of cert.extensions as ForgeExtension[]) {
    chunks.push(valueToText(extension.name));
    chunks.push(valueToText(extension.value));

    if (extension.altNames) {
      for (const altName of extension.altNames) {
        chunks.push(valueToText(altName.value));
        chunks.push(valueToText(altName.oid));
      }
    }
  }

  return chunks.filter(Boolean).join(" ");
}

function getSubjectAttribute(cert: forge.pki.Certificate, shortName: string) {
  const attribute = cert.subject.attributes.find((item) => item.shortName === shortName || item.name === shortName);
  return attribute?.value ? String(attribute.value) : null;
}

function cleanHolderName(commonName: string | null, organizationName: string | null, cnpj: string | null) {
  const baseName = commonName ?? organizationName ?? "Titular do certificado";

  if (!cnpj) {
    return baseName.trim();
  }

  const cnpjIndex = baseName.replace(/\D/g, "").includes(cnpj)
    ? baseName.search(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)
    : -1;

  if (cnpjIndex > 0) {
    return baseName.slice(0, cnpjIndex).replace(/[:\s-]+$/g, "").trim() || baseName.trim();
  }

  return baseName.replace(cnpj, "").replace(/[:\s-]+$/g, "").trim() || baseName.trim();
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parsePfx(buffer: Buffer, password: string): ParsedPfx {
  try {
    const asn1 = forge.asn1.fromDer(buffer.toString("binary"));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    const certBags = (p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ] ?? []) as Pkcs12CertBag[];
    const certificates = certBags.map((bag) => bag.cert).filter((cert): cert is forge.pki.Certificate => Boolean(cert));

    if (certificates.length === 0) {
      throw new PfxParseError();
    }

    const certWithCnpj =
      certificates.find((cert) => extractFirstValidCnpj(collectCertificateText(cert))) ?? certificates[0];
    const cnpj = extractFirstValidCnpj(collectCertificateText(certWithCnpj));
    const commonName = getSubjectAttribute(certWithCnpj, "CN");
    const organizationName = getSubjectAttribute(certWithCnpj, "O");

    return {
      cnpj,
      nomeTitular: cleanHolderName(commonName, organizationName, cnpj),
      dataEmissao: certWithCnpj.validity.notBefore ? toDateOnly(certWithCnpj.validity.notBefore) : null,
      dataVencimento: toDateOnly(certWithCnpj.validity.notAfter),
    };
  } catch (error) {
    if (error instanceof PfxParseError) {
      throw error;
    }

    throw new PfxParseError();
  }
}
