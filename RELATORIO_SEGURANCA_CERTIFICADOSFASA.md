# Relatorio de Seguranca - certificadosfasa

Data: 2026-08-13

## Resumo

O feedback foi tratado como incidente de seguranca. As correcoes locais endurecem o codigo, o build, a auditoria e o schema/migrations. A rotacao de chaves e ajustes de Auth continuam obrigatorios no Supabase, Vercel e GitHub, porque dependem dos paineis dos provedores.

## Etapa 1 - Secrets e Git

Status local: corrigido/auditado.

- `.env` real nao esta rastreado pelo Git local.
- Historico local consultado para `.env` e `.env.*`: apenas `.env.example` apareceu.
- Criado `npm.cmd run security:audit` para repetir a verificacao.
- O scan local procura JWT/API key hardcoded, `sb_secret_*`, private key e `NEXT_PUBLIC_*SERVICE_ROLE*`.

Acao manual obrigatoria:

- Se a chave circulou por chat, print, GitHub, Vercel, computador de terceiros ou qualquer arquivo compartilhado, considere comprometida mesmo sem aparecer neste Git local.
- Rotacione a chave no Supabase e atualize Vercel/GitHub antes de revogar a antiga.

## Etapa 2 - Supabase Admin Key

Status local: corrigido.

- `SUPABASE_SECRET_KEY` passou a ser a variavel preferencial.
- `SUPABASE_SERVICE_ROLE_KEY` continua aceito apenas como fallback legado.
- `src/lib/supabase/admin.ts` e `src/lib/supabase/env.ts` usam `server-only`.
- `.env.example`, readiness e script de Storage foram atualizados.

Acao manual obrigatoria:

- Criar/copiar a nova secret key no Supabase.
- Configurar `SUPABASE_SECRET_KEY` na Vercel.
- Remover/revogar a chave antiga quando todos os ambientes estiverem usando a nova.

## Etapa 3 - RLS, grants e Storage

Status local: corrigido por migration.

Arquivo:

- `database/migrations/20260813100000_security_incident_hardening.sql`

O que a migration faz:

- Garante RLS nas tabelas operacionais.
- Revoga acesso direto do pseudo-role `public` e de `anon` ao schema `public`.
- Revoga grants amplos de `public` e `anon`.
- Concede acesso explicito ao role `service_role` para preservar APIs server-side.
- Mantem grants minimos para `authenticated` somente nas leituras usadas por Server Components.
- Nao concede leitura de `senha_ciphertext`, `senha_iv`, `senha_auth_tag` ou `storage_path`.
- Garante bucket `certificados-pfx` como privado.
- Revoga acesso direto de `public`, `anon` e `authenticated` em `storage.buckets` e `storage.objects`.

Acao manual obrigatoria:

- Aplicar a migration no Supabase de producao.
- Rodar `database/scripts/SECURITY_AUDIT_SUPABASE.sql` depois e revisar os resultados.

## Etapa 4 - Next.js e Vercel

Status local: corrigido.

- Next atualizado para `16.3.0`.
- `@next/bundle-analyzer` e `eslint-config-next` atualizados para `16.3.0`.
- `postcss` travado via override em `8.5.26`.
- `npm audit` completo ficou sem vulnerabilidades.
- `productionBrowserSourceMaps: false`.
- `poweredByHeader: false`.
- Headers adicionados:
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Cross-Origin-Opener-Policy`
  - `X-DNS-Prefetch-Control`

Acao manual obrigatoria:

- Atualizar variaveis na Vercel.
- Fazer redeploy depois da rotacao.
- Validar com `curl -I https://certificadosfasa.vercel.app`.

## Etapa 5 - Auth Supabase

Status: requer acao manual.

Validar no Supabase:

- Signup publico desativado, salvo se houver fluxo controlado por convite.
- Confirmacao de e-mail ativada.
- MFA exigido para administradores, quando disponivel no plano.
- Rate limits de Auth revisados.
- JWT expiry reduzido para valor operacional razoavel.
- Usuarios antigos, desconhecidos ou inativos removidos/desativados.

## Etapa 6 - Auditoria de dados

Status local: script criado.

Arquivo:

- `database/scripts/SECURITY_AUDIT_SUPABASE.sql`

Ele mostra:

- RLS por tabela.
- Grants para `anon` e `authenticated`.
- Politicas RLS.
- Buckets e flag `public`.
- Grants em `storage.buckets` e `storage.objects`.
- Colunas sensiveis.
- Indicadores agregados de `auth.users`, sem listar e-mails.
- Acoes agregadas de `audit_logs`.
- Estado agregado dos links publicos.
- Total de objetos no bucket de certificados.

## Etapa 7 - Tokens auxiliares

Status: requer acao manual se houve vazamento do `.env`.

Rotacionar tambem:

- `CRON_SECRET`
- `EUATENDO_API_TOKEN`
- `WHATSAPP_EXTENSION_TOKEN`
- `WINDOWS_NOTIFIER_TOKEN`
- Senha administrativa de revelar senha PFX
- `CERT_ENCRYPTION_KEY`, se ela tambem vazou

Observacao sobre `CERT_ENCRYPTION_KEY`:

- Rotacionar essa chave exige plano de recriptografia ou reimportacao dos certificados, porque ela protege a senha PFX armazenada.

## Etapa 8 - Evidencias locais

Comandos executados nesta etapa:

```powershell
npm.cmd run security:audit
npm.cmd audit --omit=dev
npm.cmd audit
npx.cmd next start -p 3100
```

Resultados:

- `security:audit`: sem falhas locais.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm audit`: 0 vulnerabilidades apos atualizacao.
- Smoke test local em `/login`: headers `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy` presentes.

## Pendencias obrigatorias

1. Aplicar `database/migrations/20260813100000_security_incident_hardening.sql` no Supabase.
2. Rodar `database/scripts/SECURITY_AUDIT_SUPABASE.sql` no SQL Editor.
3. Configurar `SUPABASE_SECRET_KEY` na Vercel.
4. Rotacionar/revogar chaves antigas no Supabase.
5. Atualizar GitHub Actions/Vercel com novo `CRON_SECRET`, se ele vazou.
6. Revisar Auth no Supabase: signup, e-mail, MFA, rate limit e JWT expiry.
7. Fazer redeploy na Vercel.
8. Validar headers do dominio publicado.
9. Rodar fluxo funcional de login, certificados, download publico, notificacoes e WhatsApp.
