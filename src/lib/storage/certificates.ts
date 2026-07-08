export const CERTIFICATES_BUCKET = "certificados-pfx";

export function getCertificateStoragePath(cnpj: string, hashArquivo: string) {
  return `certificados/${cnpj}/${hashArquivo}.pfx`;
}
