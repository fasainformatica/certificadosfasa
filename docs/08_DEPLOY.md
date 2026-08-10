# Deploy

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Plataforma

O projeto esta preparado para Vercel com Next.js.

`vercel.json` agenda os crons:

```json
{
  "crons": [
    { "path": "/api/cron/certificados-vencimentos", "schedule": "0 14 * * *" },
    { "path": "/api/cron/euatendo-dispatch", "schedule": "20 13 * * *" }
  ]
}
```

A Vercel usa timezone UTC nos cron jobs. `0 14 * * *` equivale a 11:00 em `America/Sao_Paulo`.

Contas Hobby da Vercel aceitam apenas Cron Jobs diarios. Por isso o dispatcher euAtendo esta configurado como `20 13 * * *`, equivalente a 10:20 em `America/Sao_Paulo`. Em modo conservador, esse cron envia no maximo 1 mensagem e agenda a proxima permissao de envio para 180 a 300 segundos depois.

Para escoar fila no mesmo dia sem Vercel Pro, o projeto inclui um cron externo por GitHub Actions em `.github/workflows/euatendo-dispatch-cron.yml`. Ele chama `/api/cron/euatendo-dispatch` a cada 5 minutos com `CRON_SECRET`, mantendo 1 mensagem por execucao. Veja [`CRON_EXTERNO_EUATENDO_5_MIN.md`](CRON_EXTERNO_EUATENDO_5_MIN.md).

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
EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN=1
WINDOWS_NOTIFIER_ENABLED=false
WINDOWS_NOTIFIER_TOKEN=
WINDOWS_NOTIFIER_ROLE=financeiro
```

`CRON_SECRET` deve existir no ambiente da Vercel. A Vercel envia automaticamente `Authorization: Bearer {CRON_SECRET}` nas chamadas dos Cron Jobs quando essa variavel esta configurada.

`WINDOWS_NOTIFIER_*` e opcional. Use apenas se for rodar `tools/windows-notifier` em computadores internos. Gere o token com:

```powershell
npm.cmd run security:generate-windows-notifier-token
```

O mesmo valor de `WINDOWS_NOTIFIER_TOKEN` deve estar no servidor e no `config.local.json` do cliente Windows. Nao publique esse token em frontend, print, chat ou commit.

## Banco

1. Criar projeto Supabase.
2. Executar `database/schema/supabase_schema.sql` em banco novo ou migrations em banco existente.
3. Confirmar bucket privado `certificados-pfx`.
4. Criar usuario em Supabase Auth.
5. Promover usuario com `database/scripts/SUPABASE_PROMOVER_USUARIO_ADMIN.sql`.

## Cron Vercel

- `/api/cron/certificados-vencimentos`: agenda `0 14 * * *` em UTC.
- `/api/cron/euatendo-dispatch`: agenda `20 13 * * *` em UTC por compatibilidade com Vercel Hobby, equivalente a 10:20 em `America/Sao_Paulo`; para fila recorrente, chamar externamente a cada 5 minutos com `CRON_SECRET`.

Ambas as rotas aceitam `GET` para Vercel Cron e `POST` para execucao manual, sempre com `Authorization: Bearer {CRON_SECRET}`.

## Cron externo GitHub Actions

- Workflow: `.github/workflows/euatendo-dispatch-cron.yml`.
- Agenda: `2-59/5 * * * *`.
- Secret obrigatorio no GitHub: `CRON_SECRET`, com o mesmo valor da Vercel.
- Variavel opcional: `CERTIFICADOSFASA_BASE_URL`, padrao `https://certificadosfasa.vercel.app`.
- Comportamento: cada execucao chama o dispatcher uma vez; o dispatcher envia no maximo 1 mensagem.

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
8. Se usar cliente Windows, executar `tools/windows-notifier/TESTAR_NOTIFICADOR_FASA.bat` em um computador interno.
