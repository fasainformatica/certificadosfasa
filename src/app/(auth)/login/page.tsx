import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";

import { FasaLogo } from "@/components/brand/fasa-logo";
import { Badge } from "@/components/ui/status-badge";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { isInvalidRefreshTokenError, sessionCleanupRedirectPath } from "@/lib/supabase/auth-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (hasSupabasePublicEnv()) {
    const supabase = await createServerSupabaseClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        redirect("/dashboard");
      }
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        redirect(sessionCleanupRedirectPath());
      }

      throw error;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/10 sm:p-7">
        <div className="mb-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <FasaLogo className="h-12 w-12" priority />
              <p className="mt-4 text-sm font-semibold text-blue-700">Fasa Informática</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">Acesso interno</h1>
            </div>
            <Badge tone="blue">Painel Fasa</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Entre para acompanhar vencimentos, certificados e avisos da equipe.
          </p>
        </div>
        <LoginForm />
        <div className="mt-5 grid gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
          <div className="flex gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />
            <p>Use apenas sua conta interna autorizada pela Fasa.</p>
          </div>
          <div className="flex gap-2">
            <KeyRound aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />
            <p>Permissões de WhatsApp e configurações continuam restritas ao perfil administrador.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
