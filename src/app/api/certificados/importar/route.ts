import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { CertificateUploadError, registerCertificateUpload } from "@/lib/certificados/upload-service";
import { rebuildNotificationSchedule, runDueNotificationJob } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BULK_FILES = 240;
const MAX_BULK_CERTIFICATES = 80;

const manifestEntrySchema = z.object({
  field: z.string().min(1).max(80),
  name: z.string().min(1).max(260),
  relativePath: z.string().min(1).max(1000),
  size: z.number().int().min(0),
});

const manifestSchema = z.array(manifestEntrySchema).min(1).max(MAX_BULK_FILES);

type ManifestEntry = z.infer<typeof manifestEntrySchema>;

type ImportFile = {
  manifest: ManifestEntry;
  file: File;
  path: string;
  folder: string;
  name: string;
};

type ImportResult = {
  pasta: string;
  arquivo: string;
  cnpj?: string;
  certificado_id?: string;
  data_vencimento?: string;
  status?: string;
  mensagem?: string;
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || null;
}

function normalizeRelativePath(value: string) {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function getFolder(path: string) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/") || "raiz";
}

function getBaseName(path: string) {
  return path.split("/").pop() ?? path;
}

function getPathDepth(path: string) {
  return path.split("/").filter(Boolean).length;
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/i, "").trim();
}

function extractPasswordFromTxtTitle(fileName: string) {
  const title = stripExtension(fileName);
  const withoutPrefix = title.replace(/^(senha|senhas|password|pass)\s*[-_=.\s]+/i, "").trim();
  const withoutSuffix = withoutPrefix.replace(/\s*[-_=.\s]+(senha|senhas|password|pass)$/i, "").trim();

  return withoutSuffix || title;
}

function extractSingleCnpjFromPath(path: string) {
  const matches = Array.from(path.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14}/g))
    .map((match) => match[0]?.replace(/\D/g, "") ?? "")
    .filter((value) => value.length === 14);
  const unique = Array.from(new Set(matches));

  return unique.length === 1 ? unique[0] : null;
}

function choosePasswordFile(files: ImportFile[]) {
  const txtFiles = files
    .filter((item) => item.name.toLowerCase().endsWith(".txt"))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  return (
    txtFiles.find((item) => /senha|password|pass/i.test(item.name)) ??
    txtFiles[0] ??
    null
  );
}

function buildFilesFromManifest(formData: FormData, manifest: ManifestEntry[]) {
  return manifest.map((entry) => {
    const file = formData.get(entry.field);

    if (!(file instanceof File)) {
      throw new Error(`Arquivo ausente no pacote de importacao: ${entry.name}`);
    }

    const path = normalizeRelativePath(entry.relativePath || entry.name);
    const name = getBaseName(path);

    return {
      manifest: entry,
      file,
      path,
      folder: getFolder(path),
      name,
    } satisfies ImportFile;
  });
}

function groupFilesByFolder(files: ImportFile[]) {
  const groups = new Map<string, ImportFile[]>();
  const pfxFiles = files.filter((file) => file.name.toLowerCase().endsWith(".pfx"));
  const hasClientFolderShape = pfxFiles.some((file) => getPathDepth(file.path) === 3);
  const acceptedDepth = hasClientFolderShape ? 3 : 2;

  for (const file of files) {
    const extension = file.name.toLowerCase();

    if (!extension.endsWith(".pfx") && !extension.endsWith(".txt")) {
      continue;
    }

    if (getPathDepth(file.path) !== acceptedDepth) {
      continue;
    }

    const current = groups.get(file.folder) ?? [];
    current.push(file);
    groups.set(file.folder, current);
  }

  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right, "pt-BR"));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError("Requisicao invalida.", 400, "form_data_invalido");
  }

  const rawManifest = formData.get("manifest");

  if (typeof rawManifest !== "string") {
    return jsonError("Manifesto da importacao nao enviado.", 400, "manifesto_obrigatorio");
  }

  let manifest: ManifestEntry[];

  try {
    manifest = manifestSchema.parse(JSON.parse(rawManifest));
  } catch {
    return jsonError("Manifesto da importacao invalido.", 400, "manifesto_invalido");
  }

  let files: ImportFile[];

  try {
    files = buildFilesFromManifest(formData, manifest);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Pacote de importacao invalido.", 400, "arquivo_invalido");
  }

  const groups = groupFilesByFolder(files);
  const pfxCount = groups.reduce(
    (total, [, groupFiles]) => total + groupFiles.filter((item) => item.name.toLowerCase().endsWith(".pfx")).length,
    0,
  );

  if (pfxCount === 0) {
    return jsonError("Nenhum certificado .pfx foi encontrado na pasta selecionada.", 400, "sem_pfx");
  }

  if (pfxCount > MAX_BULK_CERTIFICATES) {
    return jsonError(
      `A importacao aceita no maximo ${MAX_BULK_CERTIFICATES} certificados por vez.`,
      413,
      "muitos_certificados",
    );
  }

  const admin = createSupabaseAdminClient();
  const ip = getClientIp(request);
  const importados: ImportResult[] = [];
  const ignorados: ImportResult[] = [];
  const falhas: ImportResult[] = [];

  for (const [folder, groupFiles] of groups) {
    const passwordFile = choosePasswordFile(groupFiles);
    const pfxFiles = groupFiles
      .filter((item) => item.name.toLowerCase().endsWith(".pfx"))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

    if (pfxFiles.length === 0) {
      continue;
    }

    if (!passwordFile) {
      for (const pfxFile of pfxFiles) {
        falhas.push({
          pasta: folder,
          arquivo: pfxFile.name,
          mensagem: "Nenhum arquivo .txt com a senha foi encontrado na mesma pasta do certificado.",
        });
      }
      continue;
    }

    let password: string;

    try {
      password = extractPasswordFromTxtTitle(passwordFile.name);
    } catch (error) {
      for (const pfxFile of pfxFiles) {
        falhas.push({
          pasta: folder,
          arquivo: pfxFile.name,
          mensagem: error instanceof Error ? error.message : "Nao foi possivel ler o nome do arquivo de senha.",
        });
      }
      continue;
    }

    if (!password) {
      for (const pfxFile of pfxFiles) {
        falhas.push({
          pasta: folder,
          arquivo: pfxFile.name,
          mensagem: "Senha nao encontrada no nome do arquivo .txt.",
        });
      }
      continue;
    }

    for (const pfxFile of pfxFiles) {
      try {
        const buffer = Buffer.from(await pfxFile.file.arrayBuffer());
        const certificado = await registerCertificateUpload({
          admin,
          userId: auth.user.id,
          ip,
          fileName: pfxFile.name,
          buffer,
          password,
          clientData: {
            cnpj_manual: extractSingleCnpjFromPath(pfxFile.path),
            nome_razao_social: stripExtension(pfxFile.name) || stripExtension(getBaseName(folder)) || "Cliente importado",
            email: null,
            telefone: null,
            whatsapp: null,
            responsavel: null,
            observacoes: `Importado em massa da pasta: ${folder}`,
          },
          metadata: {
            origem: "importacao_em_massa",
            pasta: folder,
            arquivo_senha: passwordFile.name,
          },
          preserveExistingClientData: true,
        });

        importados.push({
          pasta: folder,
          arquivo: pfxFile.name,
          certificado_id: certificado.id,
          cnpj: certificado.cnpj,
          data_vencimento: certificado.data_vencimento,
          status: certificado.status,
        });
      } catch (error) {
        if (error instanceof CertificateUploadError && error.code === "certificado_duplicado") {
          ignorados.push({
            pasta: folder,
            arquivo: pfxFile.name,
            mensagem: "Este arquivo ja estava cadastrado.",
          });
          continue;
        }

        falhas.push({
          pasta: folder,
          arquivo: pfxFile.name,
          mensagem: error instanceof CertificateUploadError ? error.message : "Falha ao importar certificado.",
        });
      }
    }
  }

  const notificacoes =
    importados.length > 0
      ? {
          rebuild: await rebuildNotificationSchedule({ triggeredBy: "system", userId: auth.user.id }),
          dia: await runDueNotificationJob({ triggeredBy: "system", userId: auth.user.id }),
        }
      : null;

  return NextResponse.json({
    resumo: {
      certificados_encontrados: pfxCount,
      importados: importados.length,
      ignorados: ignorados.length,
      falhas: falhas.length,
    },
    importados,
    ignorados,
    falhas,
    notificacoes,
  });
}
