import { Plus, Upload } from "lucide-react";
import Link from "next/link";
import { CertificateList } from "./certificate-list";
import styles from "./certificates.module.css";
import spec from "@/components/ui/spec/spec.module.css";
import { KpiCard, KpiGrid } from "@/components/ui/spec/kpi-card";
import { SectionHeader } from "@/components/ui/section-header";
import { canManageOperationalData } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { wasCertificateRenewed } from "@/lib/certificados/renewal";
import { applyCertificateRenewal, applyCertificateSituation, parseCertificateListParams, type CertificateListParams } from "@/lib/certificados/list-presentation";
import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { formatCount } from "@/lib/format";
import { parsePagination } from "@/lib/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

async function loadRenewalSummary(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const read = async (renewal: Parameters<typeof applyCertificateRenewal>[1]) => {
    const result = await applyCertificateRenewal(supabase.from("certificados").select("id", { count: "exact", head: true }), renewal);
    return result.error ? null : result.count;
  };
  const [operational, renewedFasa, renewedExternal, noResponse, paused, inactive] = await Promise.all([
    read("em_acompanhamento"), read("renovado_fasa"), read("renovado_fora"), read("sem_retorno"), read("pausado"), read("inativo"),
  ]);
  return { operational, renewedFasa, renewedExternal, noResponse, paused, inactive };
}

export default async function CertificadosPage({ searchParams }: { searchParams: Promise<CertificateListParams> }) {
  const user = await requireInternalUser();
  const filters = parseCertificateListParams(await searchParams);
  const pagination = parsePagination(new URLSearchParams(filters.query));
  const supabase = await createServerSupabaseClient();
  const { data: settings, error: settingsError } = await supabase.from("notification_settings")
    .select("dias_aviso_vencimento, timezone").eq("id", SETTINGS_ID).maybeSingle();
  const warningDays = settings?.dias_aviso_vencimento ?? [30, 15, 7];
  const timezone = settings?.timezone ?? "America/Sao_Paulo";
  const { today, warningDate } = getCertificateStatusReferenceDates(warningDays, timezone);
  let query = supabase.from("certificados").select(
    "id, cnpj, nome_titular, data_emissao, data_vencimento, status, renovacao_status, renovacao_observacao, renovacao_atualizado_em, nome_arquivo_original, ultimo_upload_em, created_at, updated_at, clientes(nome_razao_social, cnpj)",
    { count: "exact" },
  ).order("data_vencimento", { ascending: filters.direction === "asc" }).order("id", { ascending: true })
    .range(pagination.from, pagination.to);
  query = applyCertificateSituation(query, filters.situation, today, warningDate);
  query = applyCertificateRenewal(query, filters.renewal);
  let searchError = false;
  if (filters.search) {
    // Search linked names without hiding certificates that only match the holder.
    const { data: clients, error } = await supabase.from("clientes").select("id").ilike("nome_razao_social", `%${filters.search}%`);
    searchError = Boolean(error);
    const digits = filters.search.replace(/\D/g, "");
    const clauses = [`nome_titular.ilike.%${filters.search}%`, `cnpj.ilike.%${digits || filters.search}%`];
    if (clients?.length) clauses.push(`cliente_id.in.(${clients.map((client) => client.id).join(",")})`);
    query = query.or(clauses.join(","));
  }
  const [{ data: certificados, count, error }, summary] = await Promise.all([query, loadRenewalSummary(supabase)]);
  const canManage = canManageOperationalData(user.role);
  const rows = (certificados ?? []).map((certificate) => ({
    ...certificate,
    status: certificate.status === "invalido" ? certificate.status : calculateCertificateStatus(certificate.data_vencimento, warningDays, timezone),
    renovacao_status: certificate.renovacao_status ?? "em_acompanhamento",
    renovado: wasCertificateRenewed(certificate.created_at, certificate.ultimo_upload_em),
    dias_restantes: Math.round((Date.parse(`${certificate.data_vencimento}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
  }));
  const pausedInactive = summary.paused === null || summary.inactive === null ? null : summary.paused + summary.inactive;
  const cards = [
    { label: "Em acompanhamento", value: summary.operational, description: "Entram na visão geral e nos avisos automáticos", href: "em_acompanhamento" },
    { label: "Renovados com a Fasa", value: summary.renewedFasa, description: "Seguem no próximo ciclo de acompanhamento", href: "renovado_fasa" },
    { label: "Renovados fora", value: summary.renewedExternal, description: "Renovaram com outra empresa", href: "renovado_fora" },
    { label: "Sem retorno", value: summary.noResponse, description: "Cliente não respondeu ao aviso", href: "sem_retorno", tone: "warning" as const },
    { label: "Pausados ou inativos", value: pausedInactive, description: `${formatCount(summary.paused)} pausados · ${formatCount(summary.inactive)} inativos`, href: "pausado_inativo" },
  ];
  return <section className={styles.page}>
    <SectionHeader title="Certificados" description="Validade, renovação e avisos de cada certificado." actions={canManage ? <>
      <Link href="/certificados/importar" className={`${spec.root} ${spec.button}`} data-variant="secondary"><Upload size={16} aria-hidden="true" />Importar certificados</Link>
      <Link href="/certificados/novo" className={`${spec.root} ${spec.button}`} data-variant="primary"><Plus size={16} aria-hidden="true" />Novo certificado</Link>
    </> : null} />
    <KpiGrid>{cards.map((card) => <KpiCard key={card.href} {...card} href={`/certificados?renovacao=${card.href}`} state={card.value === null ? "error" : "ok"} />)}</KpiGrid>
    <div className={styles.tableSection}>
      <p className={styles.summaryNote}>Os indicadores de renovação podem se sobrepor e não formam um total.</p>
      <CertificateList rows={rows} filters={filters} canManage={canManage} error={Boolean(error || settingsError || searchError)} page={pagination.page} pageSize={pagination.pageSize} total={count ?? 0} />
    </div>
  </section>;
}
