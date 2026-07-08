import { redirect } from "next/navigation";

import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (hasSupabasePublicEnv()) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#f8fafc_42%,#eef6ff_100%)] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white/75 bg-white/80 p-6 shadow-xl shadow-blue-950/10 ring-1 ring-blue-100/50 backdrop-blur-xl">
        <div className="mb-7">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-lg font-semibold text-white shadow-lg shadow-blue-600/25">
            F
          </div>
          <p className="text-sm font-semibold text-blue-700">Fasa Informática</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">Acesso interno</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Entre para acompanhar vencimentos, certificados e avisos da equipe.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
