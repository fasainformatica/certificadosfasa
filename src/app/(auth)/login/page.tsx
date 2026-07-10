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
    <main className="flex min-h-screen items-center justify-center bg-[#f6f9ff] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-blue-100/70 bg-white p-6 shadow-xl shadow-blue-950/10 ring-1 ring-white/80">
        <div className="mb-7">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-semibold text-white shadow-sm shadow-blue-600/25">
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
