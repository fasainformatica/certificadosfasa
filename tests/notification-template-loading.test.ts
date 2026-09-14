import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_CERTIFICATE_TEMPLATE, ensureDefaultNotificationTemplates } from "@/lib/notifications/engine";

type Template = Database["public"]["Tables"]["notification_templates"]["Row"];
type Result = { data: Template | null; error: { message: string } | null };

const db = vi.hoisted(() => ({
  read: vi.fn<(type: string, active: boolean) => Promise<Result>>(),
  insert: vi.fn<(row: Partial<Template>) => Promise<Result>>(),
  update: vi.fn<(id: string, row: Partial<Template>) => Promise<Result>>(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const filters: Record<string, string | boolean> = {};
      let insert: Partial<Template> | undefined;
      let update: Partial<Template> | undefined;
      const query = {
        select: () => query,
        eq: (column: string, value: string | boolean) => { filters[column] = value; return query; },
        maybeSingle: () => db.read(String(filters.type), filters.active === true),
        insert: (row: Partial<Template>) => { insert = row; return query; },
        update: (row: Partial<Template>) => { update = row; return query; },
        single: () => insert ? db.insert(insert) : db.update(String(filters.id), update ?? {}),
      };
      return query;
    },
  }),
}));

function template(type: string, active: boolean, content = "Mensagem personalizada") : Template {
  return {
    id: `template-${type}`, type, active, content, title: type,
    created_by: null, created_at: "2026-01-01", updated_at: "2026-01-01",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.read.mockImplementation(async (type, active) => ({ data: template(type, active), error: null }));
});
afterEach(() => vi.useRealTimers());

describe("carregamento dos templates", () => {
  it("sobrepoe a latencia de quatro leituras sem alterar conteudo nem ativacao", async () => {
    vi.useFakeTimers();
    db.read.mockImplementation((type, active) => new Promise((resolve) => {
      setTimeout(() => resolve({ data: template(type, active), error: null }), 100);
    }));
    const start = Date.now();
    const loading = ensureDefaultNotificationTemplates();
    await vi.runAllTimersAsync();
    const result = await loading;

    expect(Date.now() - start).toBe(100);
    expect(db.read).toHaveBeenCalledTimes(4);
    expect(result.expiring.content).toBe("Mensagem personalizada");
    expect(db.read).toHaveBeenCalledWith("client_certificate_expired", false);
    expect(db.read).toHaveBeenCalledWith("client_certificate_expiring", true);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("continua criando apenas o template ausente, com vencidos ao cliente inativo", async () => {
    db.read.mockImplementation(async (type, active) => ({
      data: type === "client_certificate_expired" ? null : template(type, active), error: null,
    }));
    db.insert.mockImplementation(async (row) => ({
      data: template(String(row.type), row.active === true, row.content), error: null,
    }));
    const result = await ensureDefaultNotificationTemplates();
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ type: "client_certificate_expired", active: false }));
    expect(result.clientExpired.type).toBe("client_certificate_expired");
  });

  it("preserva a atualizacao do template legado sem sobrescrever outros textos", async () => {
    db.read.mockImplementation(async (type, active) => ({
      data: template(type, active, type === "certificate_expiring" ? "Aviso {empresa}" : "Texto do operador"),
      error: null,
    }));
    db.update.mockResolvedValue({ data: template("certificate_expiring", true, DEFAULT_CERTIFICATE_TEMPLATE), error: null });
    const result = await ensureDefaultNotificationTemplates();
    expect(db.update).toHaveBeenCalledExactlyOnceWith("template-certificate_expiring", { content: DEFAULT_CERTIFICATE_TEMPLATE });
    expect(result.expiring.content).toBe(DEFAULT_CERTIFICATE_TEMPLATE);
    expect(result.expired.content).toBe("Texto do operador");
  });

  it("propaga falha de leitura sem criar um template no lugar de uma consulta com erro", async () => {
    db.read.mockResolvedValue({ data: null, error: { message: "consulta indisponivel" } });
    await expect(ensureDefaultNotificationTemplates()).rejects.toThrow("consulta indisponivel");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
