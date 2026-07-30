"use client";

import { AlertTriangle, CheckCircle2, FolderUp, Info, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, type InputHTMLAttributes, useMemo, useState } from "react";

import { buttonClass } from "@/components/ui/button-styles";
import {
  getBulkImportBatchErrorMessage,
  getBulkImportCommunicationErrorMessage,
  getBulkImportEmptySelectionMessage,
  getBulkImportNoBatchMessage,
  getBulkImportProgressLabel,
} from "@/lib/certificados/bulk-import-presentation";
import { formatCnpj, formatDate } from "@/lib/utils/format";

type ImportItem = {
  pasta: string;
  arquivo: string;
  cnpj?: string;
  certificado_id?: string;
  data_vencimento?: string;
  status?: string;
  mensagem?: string;
};

type ImportResponse = {
  resumo: {
    certificados_encontrados: number;
    importados: number;
    ignorados: number;
    falhas: number;
  };
  importados: ImportItem[];
  ignorados: ImportItem[];
  falhas: ImportItem[];
};

type ImportErrorResponse = {
  error?: {
    message?: string;
  };
};

type DirectoryFile = File & {
  webkitRelativePath?: string;
};

const MAX_CERTIFICATES_PER_BATCH = 5;
const MAX_FILES_PER_BATCH = 20;

const directoryInputProps = {
  webkitdirectory: "",
  directory: "",
} satisfies InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

function getRelativePath(file: File) {
  return (file as DirectoryFile).webkitRelativePath || file.name;
}

function getExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function normalizeRelativePath(value: string) {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function getPathDepth(file: File) {
  return normalizeRelativePath(getRelativePath(file)).split("/").filter(Boolean).length;
}

function getFolder(file: File) {
  const parts = normalizeRelativePath(getRelativePath(file)).split("/");
  parts.pop();
  return parts.join("/") || "raiz";
}

function getAcceptedFiles(files: File[]) {
  const pfxFiles = files.filter((file) => getExtension(file) === "pfx");
  const hasClientFolderShape = pfxFiles.some((file) => getPathDepth(file) === 3);
  const acceptedDepth = hasClientFolderShape ? 3 : 2;

  return files.filter((file) => {
    const extension = getExtension(file);
    return (extension === "pfx" || extension === "txt") && getPathDepth(file) === acceptedDepth;
  });
}

function createImportBatches(files: File[]) {
  const acceptedFiles = getAcceptedFiles(files);
  const groups = new Map<string, File[]>();

  for (const file of acceptedFiles) {
    const current = groups.get(getFolder(file)) ?? [];
    current.push(file);
    groups.set(getFolder(file), current);
  }

  const batches: File[][] = [];
  let currentBatch: File[] = [];
  let currentPfxCount = 0;

  for (const [, groupFiles] of Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right, "pt-BR"))) {
    const groupPfxCount = groupFiles.filter((file) => getExtension(file) === "pfx").length;

    if (groupPfxCount === 0) {
      continue;
    }

    const wouldExceed =
      currentBatch.length > 0 &&
      (currentPfxCount + groupPfxCount > MAX_CERTIFICATES_PER_BATCH ||
        currentBatch.length + groupFiles.length > MAX_FILES_PER_BATCH);

    if (wouldExceed) {
      batches.push(currentBatch);
      currentBatch = [];
      currentPfxCount = 0;
    }

    currentBatch.push(...groupFiles);
    currentPfxCount += groupPfxCount;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function getPfxFiles(files: File[]) {
  return files.filter((file) => getExtension(file) === "pfx");
}

function splitFilesByFolder(files: File[]) {
  const groups = new Map<string, File[]>();

  for (const file of files) {
    const current = groups.get(getFolder(file)) ?? [];
    current.push(file);
    groups.set(getFolder(file), current);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
    .map(([, groupFiles]) => groupFiles);
}

function mergeImportResponses(current: ImportResponse | null, next: ImportResponse): ImportResponse {
  return {
    resumo: {
      certificados_encontrados: (current?.resumo.certificados_encontrados ?? 0) + next.resumo.certificados_encontrados,
      importados: (current?.resumo.importados ?? 0) + next.resumo.importados,
      ignorados: (current?.resumo.ignorados ?? 0) + next.resumo.ignorados,
      falhas: (current?.resumo.falhas ?? 0) + next.resumo.falhas,
    },
    importados: [...(current?.importados ?? []), ...next.importados],
    ignorados: [...(current?.ignorados ?? []), ...next.ignorados],
    falhas: [...(current?.falhas ?? []), ...next.falhas],
  };
}

function createFailedBatchResponse(batchFiles: File[], message: string): ImportResponse {
  const pfxFiles = getPfxFiles(batchFiles);

  return {
    resumo: {
      certificados_encontrados: pfxFiles.length,
      importados: 0,
      ignorados: 0,
      falhas: pfxFiles.length,
    },
    importados: [],
    ignorados: [],
    falhas: pfxFiles.map((file) => ({
      pasta: getFolder(file),
      arquivo: file.name,
      mensagem: message,
    })),
  };
}

async function postImportBatch(batchFiles: File[]) {
  const formData = new FormData();
  const manifest = batchFiles.map((file, index) => {
    const field = `arquivo_${index}`;
    const relativePath = getRelativePath(file);
    formData.append(field, file, relativePath);

    return {
      field,
      name: file.name,
      relativePath,
      size: file.size,
    };
  });

  formData.set("manifest", JSON.stringify(manifest));
  formData.set("run_notifications", "false");

  const response = await fetch("/api/certificados/importar", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as ImportResponse & ImportErrorResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? getBulkImportBatchErrorMessage());
  }

  return payload;
}

async function importBatchWithFallback(batchFiles: File[]) {
  try {
    return await postImportBatch(batchFiles);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha de comunicação com o servidor.";
    const folderBatches = splitFilesByFolder(batchFiles);

    if (folderBatches.length <= 1) {
      return createFailedBatchResponse(batchFiles, message);
    }

    let mergedResult: ImportResponse | null = null;

    for (const folderBatch of folderBatches) {
      try {
        mergedResult = mergeImportResponses(mergedResult, await postImportBatch(folderBatch));
      } catch (folderError) {
        const folderMessage = folderError instanceof Error ? folderError.message : message;
        mergedResult = mergeImportResponses(mergedResult, createFailedBatchResponse(folderBatch, folderMessage));
      }
    }

    return mergedResult ?? createFailedBatchResponse(batchFiles, message);
  }
}

function ImportResultList({ title, items, tone }: { title: string; items: ImportItem[]; tone: "success" | "warning" | "danger" }) {
  if (items.length === 0) {
    return null;
  }

  const toneClass = {
    success: "border-green-100 bg-green-50/60 text-green-800",
    warning: "border-amber-100 bg-amber-50/60 text-amber-800",
    danger: "border-red-100 bg-red-50/60 text-red-800",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {items.map((item, index) => (
          <div key={`${item.pasta}-${item.arquivo}-${index}`} className="grid gap-2 bg-white px-3 py-3 text-sm md:grid-cols-[1.2fr_1fr_1fr_1.4fr] md:items-center">
            <div>
              <p className="font-semibold text-slate-950">{item.arquivo}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.pasta}</p>
            </div>
            <div className="text-slate-700">{item.cnpj ? formatCnpj(item.cnpj) : "-"}</div>
            <div className="text-slate-700">{item.data_vencimento ? formatDate(item.data_vencimento) : "-"}</div>
            <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${toneClass}`}>
              {item.mensagem ?? (item.status ? `Importado como ${item.status}` : "Processado")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BulkImportCertificatesForm() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const fileSummary = useMemo(() => {
    const acceptedFiles = getAcceptedFiles(files);
    const pfx = acceptedFiles.filter((file) => getExtension(file) === "pfx").length;
    const txt = acceptedFiles.filter((file) => getExtension(file) === "txt").length;
    const folders = new Set(
      acceptedFiles.map((file) => getFolder(file)),
    ).size;
    const batches = createImportBatches(files).length;

    return { pfx, txt, folders, batches, ignored: files.length - acceptedFiles.length };
  }, [files]);
  const folderMissing = error === getBulkImportEmptySelectionMessage();

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    setProgress(null);
    setFiles(Array.from(event.target.files ?? []));
  }

  function handleClearSelection() {
    if (pending) {
      return;
    }

    setFiles([]);
    setError(null);
    setResult(null);
    setProgress(null);
    setInputKey((current) => current + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setError(null);
    setResult(null);

    if (files.length === 0) {
      setError(getBulkImportEmptySelectionMessage());
      return;
    }

    const batches = createImportBatches(files);

    if (batches.length === 0) {
      setError(getBulkImportNoBatchMessage());
      return;
    }

    let mergedResult: ImportResponse | null = null;
    setPending(true);
    setProgress({ current: 0, total: batches.length });

    try {
      for (const [batchIndex, batchFiles] of batches.entries()) {
        const payload = await importBatchWithFallback(batchFiles);
        mergedResult = mergeImportResponses(mergedResult, payload);
        setProgress({ current: batchIndex + 1, total: batches.length });
      }

      if ((mergedResult?.resumo.importados ?? 0) > 0) {
        await fetch("/api/notifications/check-expiring", {
          method: "POST",
        });
      }

      setResult(mergedResult);
      setPending(false);
      setProgress(null);
      router.refresh();
    } catch {
      setError(getBulkImportCommunicationErrorMessage());
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="grid gap-4">
      <form
        onSubmit={handleSubmit}
        aria-busy={pending}
        aria-describedby={error ? "bulk-import-error" : undefined}
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5"
      >
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Info aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="text-sm leading-6 text-slate-700">
              <p className="font-semibold text-slate-950">Estrutura esperada</p>
              <p>
                Selecione a pasta principal. Dentro dela, cada cliente deve ter uma pasta com o certificado
                <span className="font-semibold"> .pfx </span>
                e um arquivo
                <span className="font-semibold"> .txt </span>
                cujo nome é a senha do certificado. Nesta carga, o telefone do cliente não é obrigatório.
                Subpastas dentro da pasta do cliente serão ignoradas.
              </p>
              <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-600 ring-1 ring-slate-200">
                certificados / Cliente ABC / certificado.pfx + 123456.txt
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <label htmlFor="pasta-certificados" className="text-sm font-medium text-slate-800">
            Pasta de certificados
          </label>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 transition duration-200 hover:border-blue-300 hover:bg-blue-50/50">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p id="pasta-certificados-summary" className="text-sm font-semibold text-slate-950">
                  {files.length > 0 ? `${files.length} arquivos selecionados` : "Selecione a pasta principal"}
                </p>
                <p id="pasta-certificados-help" className="mt-1 text-xs text-slate-500">
                  A importação divide a carga em lotes e mostra um relatório por arquivo.
                </p>
              </div>
              <input
                key={inputKey}
                id="pasta-certificados"
                type="file"
                multiple
                accept=".pfx,.txt"
                disabled={pending}
                aria-invalid={folderMissing}
                aria-describedby="pasta-certificados-summary pasta-certificados-help"
                onChange={handleFilesChange}
                className="block max-w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none transition file:mr-4 file:h-10 file:border-0 file:bg-blue-600 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                {...directoryInputProps}
              />
            </div>
          </div>
        </div>

        {files.length > 0 ? (
          <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm shadow-slate-950/5 sm:grid-cols-5">
            <div>
              <p className="text-xs text-slate-500">Pastas detectadas</p>
              <p className="text-lg font-semibold text-slate-950">{fileSummary.folders}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Certificados PFX</p>
              <p className="text-lg font-semibold text-slate-950">{fileSummary.pfx}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Arquivos de senha</p>
              <p className="text-lg font-semibold text-slate-950">{fileSummary.txt}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Lotes de envio</p>
              <p className="text-lg font-semibold text-slate-950">{fileSummary.batches}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ignorados</p>
              <p className="text-lg font-semibold text-slate-950">{fileSummary.ignored}</p>
            </div>
          </div>
        ) : null}

        {fileSummary.ignored > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            {fileSummary.ignored} arquivo(s) fora da estrutura esperada serão ignorados.
          </div>
        ) : null}

        {progress ? (
          <div className="grid gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800" role="status" aria-live="polite">
            <span>{getBulkImportProgressLabel(progress.current, progress.total)}</span>
            <span
              role="progressbar"
              aria-label="Progresso da importação"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.current}
              className="block h-2 overflow-hidden rounded-full bg-blue-100"
            >
              <span
                className="block h-full rounded-full bg-blue-600 transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </span>
          </div>
        ) : null}

        {error ? (
          <div id="bulk-import-error" className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          {files.length > 0 ? (
            <button type="button" disabled={pending} onClick={handleClearSelection} className={buttonClass("secondary", "h-10")}>
              Limpar seleção
            </button>
          ) : null}
          <button type="submit" disabled={pending || files.length === 0} className={buttonClass("primary", "h-10")}>
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <FolderUp aria-hidden="true" className="h-4 w-4" />
            )}
            {pending ? "Importando certificados" : "Importar certificados"}
          </button>
        </div>
      </form>

      {result ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Encontrados</p>
              <p className="text-2xl font-semibold text-slate-950">{result.resumo.certificados_encontrados}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Importados</p>
              <p className="flex items-center gap-2 text-2xl font-semibold text-green-700">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                {result.resumo.importados}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Ignorados</p>
              <p className="text-2xl font-semibold text-amber-700">{result.resumo.ignorados}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Falhas</p>
              <p className="text-2xl font-semibold text-red-700">{result.resumo.falhas}</p>
            </div>
          </div>

          <ImportResultList title="Importados" items={result.importados} tone="success" />
          <ImportResultList title="Ignorados" items={result.ignorados} tone="warning" />
          <ImportResultList title="Falhas" items={result.falhas} tone="danger" />

          <div className="flex justify-end">
            <button type="button" onClick={() => router.refresh()} className={buttonClass("secondary")}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Atualizar listagem
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
