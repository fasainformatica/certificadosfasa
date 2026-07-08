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
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f8fafc_42%,#eef6ff_100%)] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white/75 bg-white/80 p-6 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100/50 backdrop-blur-xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-lg font-semibold text-white shadow-lg shadow-blue-600/25">
          F
        </div>
        <p className="text-sm font-semibold text-blue-700">Fasa Informática</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">Download protegido</h1>
        {available ? (
          <>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Informe a senha temporaria recebida para liberar um link de download valido por 60 segundos.
            </p>
            <div className="mt-6">
              <PublicDownloadForm token={token} />
            </div>
          </>
        ) : (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Este link ja foi utilizado ou esta invalido.
          </p>
        )}
      </section>
    </main>
  );
}
