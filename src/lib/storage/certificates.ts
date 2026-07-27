export const CERTIFICATES_BUCKET = "certificados-pfx";

export function getCertificateStoragePath(cnpj: string, fileHash: string) {
  return `certificados/${cnpj}/${fileHash}.pfx`;
}
