import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { STATUS_LABELS, getStatusLabel, getStatusPresentation, type StatusSelection, type StatusValue } from "@/lib/status-labels";
import { StatusBadge } from "@/components/ui/spec/status-badge";

const expected = {
  validade: [["em_dia", "Em dia", "success"], ["vence_em_breve", "Vence em breve", "warning"], ["vencido", "Vencido", "danger"]],
  renovacao: [["em_acompanhamento", "Em acompanhamento", "neutral"], ["renovado_fasa", "Renovado com a Fasa", "success"], ["renovado_fora", "Renovado fora", "neutral"], ["sem_retorno", "Sem retorno", "warning"], ["pausado", "Pausado", "warning"], ["inativo", "Inativo", "neutral"]],
  aviso: [["na_fila", "Na fila", "info"], ["processando", "Enviando", "info"], ["nova_tentativa", "Nova tentativa", "warning"], ["enviado", "Enviado", "success"], ["falha", "Falha no envio", "danger"], ["cancelado", "Cancelado", "neutral"]],
  cliente: [["avisos_permitidos", "Avisos permitidos", "success"], ["sem_whatsapp", "Sem WhatsApp", "warning"], ["avisos_desativados", "Avisos desativados", "neutral"]],
  canal: [["configurado", "Configurado", "success"], ["nao_configurado", "Não configurado", "danger"]],
  conexao: [["verificada", "Conectada", "success"], ["nao_verificada", "Ainda não verificada", "warning"], ["falhou", "Falha na conexão", "danger"]],
  automacao: [["habilitada", "Habilitada", "neutral"], ["desligada", "Desligada", "neutral"]],
  envio: [["liberado", "Envio liberado", "neutral"], ["pausado", "Envio pausado", "warning"]],
} as const;

describe("spec section 6.2 status map", () => {
  it("contains exactly the specified domains and 27 statuses", () => {
    expect(Object.keys(STATUS_LABELS)).toEqual(Object.keys(expected));
    expect(Object.values(STATUS_LABELS).reduce((total, values) => total + Object.keys(values).length, 0)).toBe(27);
  });
  for (const [domain, entries] of Object.entries(expected)) {
    for (const [status, label, tone] of entries) {
      it(`renders ${domain}.${status} with its exact label and tone`, () => {
        const selection = { domain, status } as StatusSelection;
        expect(getStatusPresentation(selection)).toEqual({ label, tone });
        const html = renderToStaticMarkup(<StatusBadge {...selection} />);
        expect(html).toContain(`data-tone="${tone}"`);
        expect(html).toContain(`>${label}</span>`);
      });
    }
  }
  it("keeps connection verification independent from configuration and automation", () => {
    expect(getStatusLabel("canal", "configurado").tone).toBe("success");
    expect(getStatusLabel("automacao", "habilitada").tone).toBe("neutral");
    expect(getStatusLabel("conexao", "nao_verificada")).toEqual({ label: "Ainda não verificada", tone: "warning" });
    expectTypeOf<StatusValue<"conexao">>().toEqualTypeOf<"verificada" | "nao_verificada" | "falhou">();
    expectTypeOf<{ domain: "conexao"; status: "habilitada" }>().not.toExtend<StatusSelection>();
  });
});
