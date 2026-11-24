import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Send } from "lucide-react";
import { describe, expect, it } from "vitest";
import { AlertBanner, Button, DataTable, Disclosure, FilterBar, HelpTip, KeyValueList, KpiCard, KpiGrid, Panel, StatInline, TableText, Tabs } from "@/components/ui/spec";
import { queryHref } from "@/components/ui/spec/url-state";

const render = renderToStaticMarkup;
const css = readFileSync(path.resolve("src/components/ui/spec/spec.module.css"), "utf8");

describe("spec KpiCard and KpiGrid", () => {
  it.each(["none", "warning", "danger"] as const)("renders ok and zero with tone %s", (tone) => {
    expect(render(<KpiCard label="Falhas" value={3} description="Aguardando revisão" tone={tone} />)).toContain(`data-tone="${tone}"`);
    const html = render(<KpiCard label="Falhas" value={0} description="Aguardando revisão" tone={tone} />);
    expect(html).toContain('data-tone="none"');
    expect(html).toContain(">0</div>");
  });
  it("renders absence, loading and error separately", () => {
    expect(render(<KpiCard label="Tempo" value={null} description="Hoje" />)).toContain("Sem medições");
    const loading = render(<KpiCard label="Tempo" value={3} description="Hoje" state="loading" />);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-label="Carregando Tempo"');
    expect(loading).not.toContain(">3</div>");
    const error = render(<KpiCard label="Tempo" value={3} description="Hoje" state="error" href="?reload=1" />);
    expect(error).toContain("Indisponível");
    expect(error).toContain("Não foi possível carregar.");
    expect(error).toContain("Tentar de novo");
    expect(error).not.toContain(">3</div>");
  });
  it("makes the whole KPI a link and caps the wide grid at six", () => {
    expect(render(<KpiCard label="Fila" value={1234} description="Agora" href="/notificacoes?aba=fila" />)).toMatch(/^<a /);
    const html = render(<KpiGrid>{Array.from({ length: 7 }, (_, key) => <KpiCard key={key} label="Fila" value={0} description="Agora" />)}</KpiGrid>);
    expect(html).toContain("--spec-kpi-columns:6");
  });
});

describe("spec Panel states", () => {
  it("renders ok, header actions, description and flush body", () => {
    const html = render(<Panel title="Fila" description="Mensagens" actions={<a href="/fila">Abrir</a>} flush><p>Conteúdo</p></Panel>);
    expect(html).toContain("Conteúdo");
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('data-flush="true"');
    expect(html).toContain("Mensagens");
  });
  it.each(["loading", "error", "empty"] as const)("renders %s without stale content", (state) => {
    const html = render(<Panel title="Fila" state={state} emptyMessage="Nenhum aviso." onRetry={() => {}}><p>Conteúdo antigo</p></Panel>);
    expect(html).not.toContain("Conteúdo antigo");
    expect(html).toContain(state === "loading" ? 'aria-busy="true"' : state === "error" ? "Indisponível" : "Nenhum aviso.");
    if (state === "error") expect(html).toContain("Tentar de novo");
  });
});

describe("spec Button", () => {
  it.each(["primary", "secondary", "ghost", "danger"] as const)("renders %s without overriding caller form semantics", (variant) => {
    const html = render(<Button variant={variant} size="sm" type="submit" icon={Send}>Aplicar</Button>);
    expect(html).toContain(`data-variant="${variant}"`);
    expect(html).toContain('type="submit"');
    expect(html).toContain('data-size="sm"');
    expect(html).not.toContain("disabled");
  });
  it("labels icon-only controls with a matching tooltip", () => {
    const html = render(<Button iconOnly icon={Send} aria-label="Enviar aviso para Titular" />);
    expect(html).toContain('aria-label="Enviar aviso para Titular"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("spec FilterBar", () => {
  const filters = [{ name: "situacao", label: "Situação", options: [{ value: "", label: "Todas" }, { value: "vencido", label: "Vencido" }] }, { name: "data", label: "Programado em", type: "date" as const }];
  it("renders visible labels, URL values, Enter-submit and active filter clearing", () => {
    const html = render(<FilterBar filters={filters} query="?situacao=vencido&aba=fila&page=2&busca=teste" search={{ placeholder: "Titular ou CNPJ" }} />);
    expect(html).toContain('method="get"');
    expect(html).toContain('type="submit"');
    expect(html).toContain(">Busca</label>");
    expect(html).toContain(">Situação</label>");
    expect(html).toContain(">Programado em</label>");
    expect(html).toContain('value="vencido" selected=""');
    expect(html).toContain('name="aba" value="fila"');
    expect(html).not.toContain('name="page"');
    expect(html).toContain('href="?aba=fila"');
    expect(html).toContain("Limpar filtros");
  });
  it("hides clear when there are no active filters including nonempty defaults", () => {
    expect(render(<FilterBar filters={filters} />)).not.toContain("Limpar filtros");
    expect(render(<FilterBar filters={[{ name: "situacao", label: "Situação", defaultValue: "todas", options: [{ value: "todas", label: "Todas" }] }]} />)).not.toContain("Limpar filtros");
  });
});

describe("spec DataTable", () => {
  const rows = [{ id: "1", name: "Titular de teste", document: "40.664.110/0001-72" }];
  const props = {
    label: "Certificados", rows, getRowKey: (row: typeof rows[number]) => row.id, getRowLabel: (row: typeof rows[number]) => row.name,
    columns: [{ key: "name", label: "Titular", sortable: true, render: (row: typeof rows[number]) => <TableText primary={row.name} secondary={row.document} /> }],
    mobile: (row: typeof rows[number]) => ({ primary: row.name, secondary: row.document }),
    details: () => [{ label: "Cliente vinculado", value: "Cliente completo" }],
    actions: () => null,
  };
  it("renders desktop and mobile summaries, title text and accessible expansion", () => {
    const html = render(<DataTable {...props} defaultExpanded={["1"]} sort={{ key: "name", direction: "asc" }} onSort={() => {}} />);
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('title="Titular de teste"');
    expect(html).toContain("Cliente completo");
    expect(html).toContain("Nenhuma ação disponível");
    expect(html).toContain('role="list"');
    expect(html).toContain('role="listitem"');
    expect(html).toContain("<dt>Cliente vinculado</dt>");
    expect(html).not.toContain(">-<");
  });
  it("links collapsed controls to distinct hidden desktop and mobile regions", () => {
    const html = render(<DataTable {...props} />);
    const targets = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(2);
    targets.forEach((target) => expect(html).toContain(`id="${target}"`));
    expect(html.match(/hidden=""/g)).toHaveLength(2);
  });
  it.each(["loading", "error", "empty"] as const)("renders %s without stale rows", (state) => {
    const html = render(<DataTable {...props} state={state} emptyMessage="Nenhum certificado." onRetry={() => {}} />);
    expect(html).not.toContain("Titular de teste");
    expect(html).toContain(state === "loading" ? "Carregando Certificados" : state === "error" ? "Tentar de novo" : "Nenhum certificado.");
  });
  it("handles empty data and pagination at 25 items with disabled boundaries", () => {
    expect(render(<DataTable {...props} rows={[]} />)).toContain("Nenhum item encontrado.");
    const html = render(<DataTable {...props} pagination={{ page: 2, total: 26, unit: "certificados", onPageChange: () => {} }} />);
    expect(html).toContain("Mostrando 26–26 de 26 certificados");
    expect(html).toContain("Página 2 de 2");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});

describe("remaining spec components", () => {
  it.each(["info", "warning", "danger"] as const)("renders AlertBanner %s with action", (tone) => {
    const html = render(<AlertBanner tone={tone} link={{ href: "?aba=falhas", label: "Ver falhas" }}><strong>3 envios com falha.</strong> Revise o motivo.</AlertBanner>);
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toContain("<strong>3 envios com falha.</strong>");
    expect(html).toContain("Ver falhas");
  });
  it("renders Tabs using URL navigation, counts, and active tone", () => {
    const html = render(<Tabs items={[{ value: "fila", label: "Na fila", count: 0 }, { value: "falhas", label: "Falhas", count: 3 }]} defaultValue="fila" query="?aba=falhas&canal=web&page=4" label="Avisos" />);
    expect(html).toContain('href="?aba=falhas&amp;canal=web" aria-current="page"');
    expect(html).toContain('data-tone="info">3');
    expect(html).toContain('data-tone="neutral">0');
    expect(queryHref("?aba=fila&canal=web&page=4", "aba", "falhas")).toBe("?aba=falhas&canal=web");
  });
  it("renders KeyValueList with semantic definition pairs and full-row links", () => {
    const html = render(<KeyValueList items={[{ id: "queue", label: "Na fila", value: 0, href: "?aba=fila" }, { id: "last", label: "Último envio", value: "20/11/2026 às 00:00", secondary: "há 3 dias" }]} />);
    expect(html).toContain("<dt>Na fila</dt>");
    expect(html).toContain('aria-label="Na fila: 0"');
    expect(html).toContain("há 3 dias");
    expect(html).not.toContain("<a><dt>");
  });
  it("renders StatInline with secondary description and optional link", () => {
    const html = render(<StatInline label="Na fila" value={0} description="Aguardando" href="?aba=fila" />);
    expect(html).toContain("Na fila");
    expect(html).toContain('href="?aba=fila">0');
    expect(html).toContain("Aguardando");
  });
  it("renders Disclosure closed by default and open when requested", () => {
    const closed = render(<Disclosure title="Homologação" description="Controlado" storageKey="test-homologacao"><p>Conteúdo</p></Disclosure>);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('hidden=""');
    expect(closed).toContain('aria-controls=');
    const open = render(<Disclosure title="Homologação" storageKey="test-homologacao" defaultOpen><p>Conteúdo</p></Disclosure>);
    expect(open).toContain('aria-expanded="true"');
    expect(open).not.toContain('hidden=""');
  });
  it("renders HelpTip with labelled button and collapsed associated popover", () => {
    const html = render(<HelpTip subject="Avisos">Regra de elegibilidade.</HelpTip>);
    expect(html).toContain('aria-label="Ajuda: Avisos"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('role="note" hidden=""');
    expect(html).toContain('width="14"');
    expect(html).toContain("Regra de elegibilidade.");
  });
});

describe("isolated spec stylesheet contract", () => {
  it("references exact semantic variables rather than legacy palette classes", () => {
    for (const token of ["surface", "surface-muted", "surface-hover", "border", "border-strong", "text", "text-2", "text-3", "primary", "primary-hover", "primary-soft", "success", "warning", "danger", "neutral"]) expect(css).toContain(`var(--${token}`);
    expect(css.match(/#[\da-fA-F]{3,8}/g)).toEqual(["#BFD3FE"]);
    expect(css).not.toContain(":root");
    expect(css).not.toContain("!important");
  });
  it("includes exact sizes, spacing, focus and responsive breakpoints", () => {
    for (const declaration of ["min-height: 112px", "height: 22px", "height: 36px", "height: 32px", "height: 40px", "height: 56px", "min-height: 44px", "font-size: 28px", "line-height: 34px", "white-space: nowrap", "outline: 2px solid var(--primary)", "outline-offset: 2px", "font-variant-numeric: tabular-nums", "gap: 16px", "top: 64px"]) expect(css).toContain(declaration);
    for (const breakpoint of [480, 768, 1024, 1280]) expect(css).toContain(`min-width: ${breakpoint}px`);
    expect(css).toContain("max-width: 767px");
    expect(css).toContain("0 1px 2px rgba(16, 24, 40, 0.05)");
    expect(css).toContain("0 8px 24px rgba(16, 24, 40, 0.12)");
  });
});
