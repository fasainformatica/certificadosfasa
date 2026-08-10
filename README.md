# Fasa Certificados PFX

Sistema interno para gestao segura de certificados digitais PFX da Fasa Informatica. O sistema controla clientes, certificados, links publicos de download de uso unico, avisos de vencimento e envio automatico por WhatsApp via API euAtendo.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- Supabase Auth, Postgres e Storage
- `node-forge` para leitura de PFX/PKCS#12
- Criptografia AES-256-GCM nativa do Node para senha real do PFX
- API euAtendo como provider oficial de WhatsApp
- Vercel Cron Jobs para cron

## Documentacao

Leia nesta ordem antes de implementar:

1. [`docs/SYSTEM_CONTEXT.md`](docs/SYSTEM_CONTEXT.md)
2. [`docs/INDEX.md`](docs/INDEX.md)
3. O documento especifico do modulo alterado.

`docs/SYSTEM_CONTEXT.md` e a fonte oficial da verdade do projeto. Relatorios antigos ficam em `docs/archive/` apenas como historico.

## Instalacao Local

```powershell
cd C:\Users\User\certificadosfasa
npm.cmd install
npm.cmd run dev
```

Acesse `http://localhost:3000`.

## Variaveis

Crie `.env` com base em `.env.example`.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CERT_ENCRYPTION_KEY=
CRON_SECRET=
EUATENDO_API_URL=https://apicluster.euatendo.app
EUATENDO_API_TOKEN=
EUATENDO_INSTANCE_ID=
EUATENDO_PROVIDER_ENABLED=false
EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN=3
WINDOWS_NOTIFIER_ENABLED=false
WINDOWS_NOTIFIER_TOKEN=
WINDOWS_NOTIFIER_ROLE=financeiro
```

`SUPABASE_SERVICE_ROLE_KEY`, `CERT_ENCRYPTION_KEY`, `CRON_SECRET`, `EUATENDO_API_TOKEN` e `WINDOWS_NOTIFIER_TOKEN` sao server-only.

Para pop-ups em computadores Windows, veja [`tools/windows-notifier/README.md`](tools/windows-notifier/README.md).

## Banco de Dados

- Schema oficial para projeto novo: [`database/schema/supabase_schema.sql`](database/schema/supabase_schema.sql)
- Migrations incrementais: [`database/migrations/`](database/migrations/)
- Scripts manuais uteis: [`database/scripts/`](database/scripts/)
- SQL antigo/historico: [`database/archive/`](database/archive/)

Para banco novo, execute o schema oficial completo no SQL Editor do Supabase. Para banco existente, aplique as migrations em ordem cronologica.

## Execucao

```powershell
npm.cmd run dev
npm.cmd test
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
```

## Estrutura

```text
src/app              Rotas, telas e APIs Next.js
src/components       Componentes visuais reutilizaveis
src/lib              Regras de negocio, Supabase, PFX, Storage, notificacoes e euAtendo
vercel.json          Agendamento dos crons da Vercel
database/schema      Schema SQL oficial
database/migrations  Migrations versionadas
database/scripts     Scripts operacionais manuais
docs                 Documentacao oficial
docs/archive         Historico documental
docs/reference       Referencias externas preservadas
tools/windows-notifier Cliente leve de pop-ups Windows
```

## Links Principais

- [`docs/SYSTEM_CONTEXT.md`](docs/SYSTEM_CONTEXT.md)
- [`docs/01_ARQUITETURA.md`](docs/01_ARQUITETURA.md)
- [`docs/03_BANCO_DE_DADOS.md`](docs/03_BANCO_DE_DADOS.md)
- [`docs/04_NOTIFICACOES.md`](docs/04_NOTIFICACOES.md)
- [`docs/05_WHATSAPP_EUATENDO.md`](docs/05_WHATSAPP_EUATENDO.md)
- [`CHANGELOG.md`](CHANGELOG.md)
