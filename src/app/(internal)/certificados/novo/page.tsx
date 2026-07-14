import { SectionHeader } from "@/components/ui/section-header";
import { requireAdmin } from "@/lib/auth/rbac";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { UploadCertificateForm } from "./upload-certificate-form";

type NovoCertificadoPageProps = {
  searchParams: Promise<{
    cliente_id?: string;
  }>;
};

export default async function NovoCertificadoPage({ searchParams }: NovoCertificadoPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: clients } = await supabase
    .from("clientes")
    .select("id, nome_razao_social, cnpj, email, telefone, whatsapp, responsavel, observacoes")
    .order("nome_razao_social", { ascending: true });

  return (
    <section>
      <SectionHeader
        title="Novo certificado"
        description="Envie o certificado e cadastre os dados do cliente em um único fluxo seguro."
      />
      <UploadCertificateForm clients={clients ?? []} initialClientId={params.cliente_id ?? ""} />
    </section>
  );
}
