import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/82 text-sm font-semibold text-slate-700 shadow-sm shadow-blue-950/5 transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:w-auto sm:px-3"
        aria-label="Sair"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">Sair</span>
      </button>
    </form>
  );
}
