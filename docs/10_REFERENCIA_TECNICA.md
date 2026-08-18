# Referencia Tecnica

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Comandos

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
```

## Arquivos criticos

- `src/lib/certificados/upload-service.ts`
- `src/lib/certificados/status.ts`
- `src/lib/notifications/engine.ts`
- `src/lib/notifications/validation.ts`
- `src/lib/internal-notifications/windows-notifier.ts`
- `src/app/api/internal-notifications/windows/[id]/certificate-file/route.ts`
- `src/lib/whatsapp/euatendo/client.ts`
- `src/lib/whatsapp/euatendo/provider.ts`
- `src/lib/whatsapp/euatendo/dispatcher.ts`
- `src/lib/operations/production-readiness.ts`
- `src/lib/supabase/admin.ts`
- `src/lib/supabase/database.types.ts`
- `database/schema/supabase_schema.sql`
- `scripts/check-service-role-rbac.mjs`
- `tools/windows-notifier/FasaInternalNotifier.ps1`

## Validacoes manuais rapidas

- Confirmar `.env`.
- Confirmar login admin.
- Confirmar bucket `certificados-pfx` privado.
- Confirmar templates em `/configuracoes`.
- Confirmar status euAtendo em `/whatsapp`.
- Confirmar `/api/admin/health/production` como admin.
- Confirmar `notification_events` apos upload.
- Confirmar `whatsapp_provider_logs` apos teste/envio.
- Confirmar `tools/windows-notifier/TESTAR_NOTIFICADOR_FASA.bat` quando usar pop-ups Windows.

## Regras de manutencao

- Mudanca funcional relevante exige update em `docs/SYSTEM_CONTEXT.md`.
- Mudanca de banco exige schema oficial e migration quando aplicavel.
- Mudanca de envio exige documentar status, retry, delay e logs.
- Nova API route com service role deve passar pela checagem `npm test`.
- Mudanca de tela exige conferir responsividade e texto.
- Nunca usar relatorio arquivado como fonte operacional sem comparar com codigo.
