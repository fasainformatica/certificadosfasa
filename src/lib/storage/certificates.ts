export const CERTIFICATES_BUCKET = "certificados-pfx";

export function getCertificateStoragePath(cnpj: string) {
  return `certificados/${cnpj}/certificado.pfx`;
}
