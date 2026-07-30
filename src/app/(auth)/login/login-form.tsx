"use client";

import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { buttonClass, inputClass } from "@/components/ui/button-styles";
import { getLoginErrorMessage } from "@/lib/auth/login-presentation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const fieldDescriptionId = error ? "login_help login_error" : "login_help";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(getLoginErrorMessage("invalid_credentials"));
        setPending(false);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(getLoginErrorMessage("auth_service_unavailable"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <p id="login_help" className="text-sm leading-6 text-slate-600">
        Informe o e-mail corporativo e a senha cadastrada para acessar o painel.
      </p>

      <div className="grid gap-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-800">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
          disabled={pending}
          aria-describedby={fieldDescriptionId}
          aria-invalid={Boolean(error)}
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-800">
          Senha
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(inputClass, "pr-12")}
            disabled={pending}
            aria-describedby={fieldDescriptionId}
            aria-invalid={Boolean(error)}
          />
          <button
            type="button"
            className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 outline-none transition duration-150 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setShowPassword((current) => !current)}
            disabled={pending}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            aria-controls="password"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Eye aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {error ? (
        <div id="login_error" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "h-10")}
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <LockKeyhole aria-hidden="true" className="h-4 w-4" />
        )}
        {pending ? "Entrando" : "Entrar"}
      </button>
    </form>
  );
}
