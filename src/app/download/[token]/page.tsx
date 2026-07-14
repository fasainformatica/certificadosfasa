import { FasaLogo } from "@/components/brand/fasa-logo";
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
    <main className="flex min-h-screen items-center justify-center bg-[#f6f9ff] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-blue-100/70 bg-white p-6 shadow-xl shadow-blue-950/10 ring-1 ring-white/80">
        <FasaLogo className="mb-5 h-12 w-12" priority />
        <p className="text-sm font-semibold text-blue-700">Fasa Informática</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">Download protegido</h1>
        {available ? (
          <>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Informe a senha temporária recebida para liberar um link de download válido por 60 segundos.
            </p>
            <div className="mt-6">
              <PublicDownloadForm token={token} />
            </div>
          </>
        ) : (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Este link já foi utilizado ou está inválido.
          </p>
        )}
      </section>
    </main>
  );
}
