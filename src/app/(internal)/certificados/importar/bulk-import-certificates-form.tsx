"use client";

import { AlertTriangle, CheckCircle2, FolderUp, Info, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, type InputHTMLAttributes, useMemo, useState } from "react";

import { buttonClass } from "@/components/ui/button-styles";
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
    <div className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 divide-y divide-blue-50 overflow-hidden rounded-2xl border border-blue-100">
        {items.map((item, index) => (
          <div key={`${item.pasta}-${item.arquivo}-${index}`} className="grid gap-2 bg-white px-3 py-3 text-sm md:grid-cols-[1.2fr_1fr_1fr_1.4fr] md:items-center">
            <div>
              <p className="font-semibold text-slate-950">{item.arquivo}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.pasta}</p>
            </div>
            <div className="text-slate-700">{item.cnpj ? formatCnpj(item.cnpj) : "-"}</div>
            <div className="text-slate-700">{item.data_vencimento ? formatDate(item.data_vencimento) : "-"}</div>
            <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${toneClass}`}>
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const fileSummary = useMemo(() => {
    const pfx = files.filter((file) => getExtension(file) === "pfx").length;
    const txt = files.filter((file) => getExtension(file) === "txt").length;
    const folders = new Set(
      files.map((file) => {
        const parts = getRelativePath(file).replace(/\\/g, "/").split("/");
        parts.pop();
        return parts.join("/") || "raiz";
      }),
    ).size;

    return { pfx, txt, folders };
  }, [files]);

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    setFiles(Array.from(event.target.files ?? []));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (files.length === 0) {
      setError("Selecione a pasta onde estao os certificados.");
      return;
    }

    const formData = new FormData();
    const manifest = files.map((file, index) => {
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
    setPending(true);

    try {
      const response = await fetch("/api/certificados/importar", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImportResponse & ImportErrorResponse;

      if (!response.ok) {
        setError(payload.error?.message ?? "Nao foi possivel importar os certificados.");
        setPending(false);
        return;
      }

      setResult(payload);
      setPending(false);
      router.refresh();
    } catch {
      setError("Falha de comunicacao com o servidor.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-3xl border border-blue-100/70 bg-white p-4 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 sm:p-5">
        <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
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
                cujo nome e a senha do certificado. Nesta carga, o telefone do cliente nao e obrigatorio.
                Subpastas dentro da pasta do cliente serao ignoradas.
              </p>
              <p className="mt-2 rounded-2xl bg-white/75 px-3 py-2 font-mono text-xs text-slate-600">
                certificados / Cliente ABC / certificado.pfx + 123456.txt
              </p>
            </div>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-800">
          Pasta de certificados
          <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 p-5 transition duration-200 hover:border-blue-300 hover:bg-blue-50/70">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {files.length > 0 ? `${files.length} arquivos selecionados` : "Selecione a pasta principal"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  A importacao processa os certificados um por vez e mostra um relatorio por arquivo.
                </p>
              </div>
              <input
                type="file"
                multiple
                accept=".pfx,.txt"
                onChange={handleFilesChange}
                className="block max-w-full rounded-2xl border border-blue-100 bg-white/90 text-sm text-slate-700 outline-none transition file:mr-4 file:h-10 file:border-0 file:bg-blue-600 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                {...directoryInputProps}
              />
            </div>
          </div>
        </label>

        {files.length > 0 ? (
          <div className="grid gap-2 rounded-3xl border border-blue-100 bg-white px-4 py-3 text-sm sm:grid-cols-3">
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
          </div>
        ) : null}

        {error ? (
          <div className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <button type="submit" disabled={pending || files.length === 0} className={buttonClass("primary", "h-10")}>
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <FolderUp aria-hidden="true" className="h-4 w-4" />
            )}
            Importar certificados
          </button>
        </div>
      </form>

      {result ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5 sm:grid-cols-4">
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
