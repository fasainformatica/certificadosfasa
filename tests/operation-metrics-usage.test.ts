import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const modulePath = "@/lib/metricas/operacao";
const pages = ["dashboard", "notificacoes", "whatsapp"];
function source(page: string) {
  return readFileSync(join(process.cwd(), `src/app/(internal)/${page}/page.tsx`), "utf8");
}
function calls(code: string, name: string) {
  const result: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("page.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return result;
}

describe("page usage of the shared operational metrics", () => {
  it.each(pages)("%s imports and calls the same reader, with no inline event aggregate", (page) => {
    const code = source(page);
    const ast = ts.createSourceFile("page.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imported = ast.statements.filter(ts.isImportDeclaration).some((node) =>
      ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === modulePath
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      && node.importClause.namedBindings.elements.some((item) => item.name.text === "lerMetricasOperacao"));
    expect(imported).toBe(true);
    expect(calls(code, "lerMetricasOperacao")).toHaveLength(1);
    expect(code).not.toContain('rpc("get_dashboard_metrics")');
    expect(code).not.toContain("head: true");
    expect(code).not.toContain('"use client"');
    expect(code).toContain("Indisponível");
  });

  it("uses shared fields for each repeated displayed metric, not legacy aliases", () => {
    for (const page of pages) {
      const code = source(page);
      for (const field of ["queue", "failed", "sentToday"]) expect(code).toContain(`.${field}`);
    }
    for (const page of ["dashboard", "whatsapp"]) {
      expect(source(page)).toContain(".lastSentAt");
    }
    expect(source("whatsapp")).toContain(".state");
    // Section 7.5 removes dispatch/cadence state: it is not a confirmed queue verification.
    expect(source("dashboard")).not.toContain("operation.state");
    expect(source("dashboard")).not.toContain("Última execução registrada");
    expect(calls(source("dashboard"), "lerCertificadosEmOperacao")).toHaveLength(1);
    expect(source("dashboard")).not.toContain("falhas_hoje ||");
  });

  it("keeps the module server-only, injected and read-only", () => {
    const code = readFileSync(join(process.cwd(), "src/lib/metricas/operacao.ts"), "utf8");
    expect(code).toContain('import "server-only"');
    expect(code).not.toMatch(/\.(insert|update|upsert|delete|rpc)\s*\(/);
    expect(code).not.toContain("createSupabaseAdminClient()");
    expect(code).not.toContain("process.env");
    expect(code).not.toMatch(/console\./);
  });

  it("uses N11 payload helper in both presentations without deriving validity from send_date", () => {
    const code = source("notificacoes");
    expect(code).toContain("provider, payload, dias_restantes");
    expect(calls(code, "getRenewalRetryPresentation")).toHaveLength(2);
    for (const call of calls(code, "getRenewalRetryPresentation")) {
      expect(call.arguments.map((argument) => argument.getText())).toEqual(["event.payload", "certificado?.data_vencimento"]);
    }
    expect(code.match(/renewalRetry\.renewed \?/g)).toHaveLength(2);
    expect(code.match(/A validade mudou depois deste aviso\. Reenviar mandaria uma data que n\u00e3o vale mais\./g)).toHaveLength(2);
  });
});
