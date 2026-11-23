import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] leading-[18px] font-medium text-[var(--text)] transition-colors duration-150 hover:bg-[var(--surface-hover)]"
        aria-label="Sair"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
        <span>Sair</span>
      </button>
    </form>
  );
}
