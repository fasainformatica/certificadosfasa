import { Clock3, KeyRound, ShieldCheck, XCircle } from "lucide-react";

import { FasaLogo } from "@/components/brand/fasa-logo";
import { Badge } from "@/components/ui/status-badge";
import { hashPublicDownloadToken } from "@/lib/download/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { PublicDownloadForm } from "./download-form";

type PublicDownloadPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PublicDownloadPage({ params }: PublicDownloadPageProps) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const tokenHash = hashPublicDownloadToken(token);
  const { data: link } = await admin
    .from("links_download")
    .select("id, ativo, usado")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const available = Boolean(link?.ativo && !link.usado);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/10 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <FasaLogo className="h-12 w-12" priority />
            <p className="mt-4 text-sm font-semibold text-blue-700">Fasa Informática</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">Download protegido</h1>
          </div>
          {available ? <Badge tone="green">Link disponível</Badge> : <Badge tone="red">Link indisponível</Badge>}
        </div>

        {available ? (
          <>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Informe a senha temporária recebida para liberar um acesso de curta duração ao certificado.
            </p>
            <div className="mt-4 grid gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-sm text-slate-700">
              <div className="flex gap-2">
                <Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                <p>Depois da liberação, o acesso ao arquivo expira em 60 segundos.</p>
              </div>
              <div className="flex gap-2">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                <p>O link é de uso único. Não compartilhe esta página ou a senha temporária.</p>
              </div>
            </div>
            <div className="mt-6">
              <PublicDownloadForm token={token} />
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <div className="flex gap-2">
              <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Não foi possível liberar este download.</p>
                <p className="mt-1 leading-6">
                  Este link já foi utilizado, invalidado ou não está mais disponível. Solicite um novo link à equipe da Fasa.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
          <KeyRound aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>A Fasa nunca solicita a senha real do certificado por esta página. Use somente a senha temporária enviada com o link.</p>
        </div>
      </section>
    </main>
  );
}
