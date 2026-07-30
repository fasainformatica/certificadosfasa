import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { SectionHeader } from "@/components/ui/section-header";
import { requireOperationalUser } from "@/lib/auth/rbac";

import { BulkImportCertificatesForm } from "./bulk-import-certificates-form";

export default async function ImportarCertificadosPage() {
  await requireOperationalUser();

  return (
    <section>
      <SectionHeader
        title="Importar certificados"
        description="Envie pastas com certificados PFX e arquivos TXT de senha, mantendo a validação e o armazenamento seguro."
        actions={
          <Link href="/certificados" className={buttonClass("secondary")}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Voltar
          </Link>
        }
      />
      <BulkImportCertificatesForm />
    </section>
  );
}
