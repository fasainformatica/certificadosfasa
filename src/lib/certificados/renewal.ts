export function wasCertificateRenewed(createdAt: string | null | undefined, lastUploadAt: string | null | undefined) {
  const createdTime = Date.parse(createdAt ?? "");
  const uploadTime = Date.parse(lastUploadAt ?? "");

  return Number.isFinite(createdTime) && Number.isFinite(uploadTime) && uploadTime > createdTime + 1000;
}
