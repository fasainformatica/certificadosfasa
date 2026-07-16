# Deploy

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Plataforma

O projeto esta preparado para Vercel com Next.js.

`vercel.json` agenda os crons:

```json
{
  "crons": [
    { "path": "/api/cron/certificados-vencimentos", "schedule": "0 14 * * *" },
    { "path": "/api/cron/euatendo-dispatch", "schedule": "5 13 * * *" }
  ]
}
```

A Vercel usa timezone UTC nos cron jobs. `0 14 * * *` equivale a 11:00 em `America/Sao_Paulo`.

Contas Hobby da Vercel aceitam apenas Cron Jobs diarios. Por isso o dispatcher euAtendo esta configurado como `5 13 * * *`, equivalente a 10:05 em `America/Sao_Paulo`. Para envio frequente, use plano Pro ou cron externo chamando `/api/cron/euatendo-dispatch` com `CRON_SECRET`.

## Variaveis obrigatorias

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CERT_ENCRYPTION_KEY=
CRON_SECRET=
EUATENDO_API_URL=
EUATENDO_API_TOKEN=
EUATENDO_INSTANCE_ID=
EUATENDO_PROVIDER_ENABLED=
EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN=3
```

`CRON_SECRET` deve existir no ambiente da Vercel. A Vercel envia automaticamente `Authorization: Bearer {CRON_SECRET}` nas chamadas dos Cron Jobs quando essa variavel esta configurada.

## Banco

1. Criar projeto Supabase.
2. Executar `database/schema/supabase_schema.sql` em banco novo ou migrations em banco existente.
3. Confirmar bucket privado `certificados-pfx`.
4. Criar usuario em Supabase Auth.
5. Promover usuario com `database/scripts/SUPABASE_PROMOVER_USUARIO_ADMIN.sql`.

## Cron Vercel

- `/api/cron/certificados-vencimentos`: agenda `0 14 * * *` em UTC.
- `/api/cron/euatendo-dispatch`: agenda `5 13 * * *` em UTC por compatibilidade com Vercel Hobby, equivalente a 10:05 em `America/Sao_Paulo`.

Ambas as rotas aceitam `GET` para Vercel Cron e `POST` para execucao manual, sempre com `Authorization: Bearer {CRON_SECRET}`.

## Validacao recomendada

```powershell
npm.cmd test
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
```

Validacao operacional:

1. Login admin.
2. Upload PFX de teste.
3. Gerar link publico e baixar uma vez.
4. Testar euAtendo em `/whatsapp`.
5. Enviar aviso manual.
6. Acessar `/api/admin/health/production` como admin.
7. Confirmar crons em `Settings > Cron Jobs` e nos runtime logs da Vercel.
