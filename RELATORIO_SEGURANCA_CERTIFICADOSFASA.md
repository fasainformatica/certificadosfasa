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

## Etapa 3.1 - Signup e RPCs de seguranca

Status local: corrigido por migration.

Arquivo:

- `database/migrations/20260813103000_lock_public_signup_profiles_and_rpc_privileges.sql`

Problema encontrado:

- O gatilho `public.handle_new_user()` criava perfil em `user_profiles` com `active = true`.
- Se o signup publico estivesse ligado no Supabase, uma conta criada fora do fluxo administrativo poderia nascer como usuario interno ativo.

O que a migration faz:

- Redefine `handle_new_user()` para criar novos perfis com `active = false`.
- Mantem a criacao administrativa de usuarios em `/configuracoes` funcionando, porque a API admin faz o upsert posterior do cargo e do estado ativo.
- Revoga execucao publica/anonima de `handle_new_user()`.
- Revoga execucao publica/anonima dos helpers `current_user_role()`, `is_internal_user()`, `is_admin()` e `can_read_internal()`.
- Mantem `EXECUTE` para `authenticated` e `service_role` nos helpers usados por RLS, sem parametros externos e sempre baseados em `auth.uid()`.

Acao manual obrigatoria:

- Aplicar a migration no Supabase de producao.
- Desligar signup publico no painel Supabase.
- Auditar usuarios ja existentes em `user_profiles`; contas desconhecidas devem ser desativadas.

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

Status: mitigacao local criada; ainda requer acao manual.

Validar no Supabase:

- Signup publico desativado, salvo se houver fluxo controlado por convite.
- Confirmacao de e-mail ativada.
- MFA exigido para administradores, quando disponivel no plano.
- Rate limits de Auth revisados.
- JWT expiry reduzido para valor operacional razoavel.
- Usuarios antigos, desconhecidos ou inativos removidos/desativados.

Observacao:

- A migration nova impede que futuros signups virem perfis internos ativos automaticamente.
- Isso nao muda configuracoes globais do Auth, CAPTCHA, MFA, rate limits ou expiracao de JWT, que continuam dependendo do painel Supabase.

## Etapa 6 - Auditoria de dados

Status local: script criado.

Arquivo:

- `database/scripts/SECURITY_AUDIT_SUPABASE.sql`

Ele mostra:

- RLS por tabela.
- Grants para `anon` e `authenticated`.
- Politicas RLS.
- Funcoes `SECURITY DEFINER` no schema `public`.
- Permissoes de execucao de RPCs para `PUBLIC`, `anon` e `authenticated`.
- Definicao dos helpers `current_user_role`, `is_admin`, `is_internal_user`, `can_read_internal` e `handle_new_user`.
- Buckets e flag `public`.
- Grants em `storage.buckets` e `storage.objects`.
- Colunas sensiveis.
- Perfis agregados por cargo e estado ativo.
- Indicadores agregados de `auth.users`, sem listar e-mails.
- Acoes agregadas de `audit_logs`.
- Estado agregado dos links publicos.
- Total de objetos no bucket de certificados.

## Etapa 6.1 - Projeto Supabase mftvsgzrujkalssiriny

Status local: script separado criado.

Arquivo:

- `database/scripts/SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql`

Escopo:

- Esse arquivo e para o outro projeto Supabase citado no feedback, nao para o banco `certificadosfasa`.
- O script habilita RLS nas 13 tabelas informadas quando existirem e revoga grants diretos de `PUBLIC` e `anon`.
- Ele nao cria policies permissivas. O padrao apos o lockdown e `default deny` ate que policies especificas sejam escritas para cada fluxo real.

Acao manual obrigatoria:

- Conferir que o SQL Editor esta aberto no projeto `mftvsgzrujkalssiriny`.
- Executar o script somente nesse projeto.
- Rodar uma consulta de grants/policies depois para confirmar que `anon` nao possui `SELECT` direto.

## Etapa 6.2 - Superficie de API Routes

Status local: corrigido por auditoria automatizada.

Arquivo:

- `scripts/check-service-role-rbac.mjs`

O que foi reforcado:

- Rotas internas sem politica publica explicita precisam conter `requireApiUser`.
- Rotas que usam Supabase Admin continuam bloqueadas se criarem service role antes da autenticacao.
- Rotas de cron precisam conter validacao por `CRON_SECRET`.
- Rotas publicas de download precisam conter hash de token, verificacao de senha, controle de tentativas e URL assinada curta.
- Rotas da extensao WhatsApp precisam validar Basic Auth por `authenticateWhatsAppExtension`.
- Rota do notificador Windows precisa validar bearer token por `authenticateWindowsNotifier`.
- Excecoes publicas ficam documentadas no proprio script em vez de ficarem implicitas.

Risco reduzido:

- Criar uma nova rota `/api/*` sem autenticacao agora quebra `npm.cmd test`.
- Ampliar uma rota publica sem os controles esperados tambem quebra a validacao local.

## Etapa 6.3 - Sanitizacao de erros e logs operacionais

Status local: corrigido.

Arquivos:

- `src/lib/security/sensitive-data.ts`
- `src/lib/whatsapp/euatendo/provider.ts`
- `src/lib/whatsapp/euatendo/dispatcher.ts`
- `src/lib/whatsapp/extension/dispatcher.ts`
- `src/app/api/certificados/[id]/aviso/route.ts`
- `src/app/api/whatsapp/euatendo/health/route.ts`
- `src/app/api/whatsapp/euatendo/check-number/route.ts`
- `src/app/api/whatsapp/euatendo/test-message/route.ts`
- `src/lib/notifications/engine.ts`
- `src/lib/storage/reconciliation.ts`

O que foi reforcado:

- Tokens Bearer/Basic, JWTs, nomes de secrets, storage paths e telefones completos sao mascarados por helper central.
- Erros SQL/RPC de reserva de mensagem viram mensagem operacional segura antes de retornar ao cron ou ir para `whatsapp_provider_logs`.
- Falhas de credencial, instancia, rate limit, timeout e numero invalido passam por mapeamento humano seguro.
- Homologacao do WhatsApp e envio manual nao gravam mais `error.message` bruto em `audit_logs`.
- `whatsapp_provider_logs.error_message` passa por redacao antes do insert nos dispatchers euAtendo e extensao.
- Sanitizadores antigos de notification engine e reconciliacao de Storage agora usam o helper central.
- `npm.cmd run security:audit` passou a escanear arquivos novos nao ignorados, alem dos rastreados pelo Git.

Risco residual:

- Logs tecnicos ja existentes no banco antes desta fase podem conter mensagens antigas. A etapa seguinte criou auditoria e limpeza controlada para esse historico.

## Etapa 7 - Auditoria e limpeza de logs historicos

Status: implementado localmente; aplicacao no Supabase requer execucao manual.

Arquivos criados:

- `database/scripts/SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql`
- `database/scripts/SECURITY_SANITIZE_LEGACY_LOGS.sql`

O que foi reforcado:

- Auditoria read-only para `audit_logs.metadata`, `storage_reconciliation_jobs.last_error/metadata`, `notification_events.error_message/provider_response/payload` e `whatsapp_provider_logs.error_message/metadata`.
- Exemplos de evidencia retornam com tokens, JWTs, nomes de secrets, paths de Storage e telefones mascarados.
- Script de limpeza controlada substitui erro tecnico por mensagem operacional segura e reduz metadados brutos a amostra mascarada.
- O script de limpeza termina com `ROLLBACK` por padrao; para aplicar, o operador precisa revisar o resumo e trocar manualmente para `COMMIT`.
- Payloads tecnicos novos de `notification_events` passam a gravar telefone do cliente mascarado, sem alterar `telefone_destino` nem `mensagem_renderizada`.

Risco residual:

- A limpeza historica ainda nao foi aplicada no Supabase nesta fase. Rode a auditoria, revise contadores/amostras e aplique somente depois de backup.

## Etapa 8 - Tokens auxiliares

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

## Etapa 9 - Evidencias locais

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
2. Aplicar `database/migrations/20260813103000_lock_public_signup_profiles_and_rpc_privileges.sql` no Supabase.
3. Rodar `database/scripts/SECURITY_AUDIT_SUPABASE.sql` no SQL Editor.
4. Configurar `SUPABASE_SECRET_KEY` na Vercel.
5. Rotacionar/revogar chaves antigas no Supabase.
6. Atualizar GitHub Actions/Vercel com novo `CRON_SECRET`, se ele vazou.
7. Revisar Auth no Supabase: signup, e-mail, MFA, rate limit e JWT expiry.
8. Auditar usuarios ativos em `user_profiles` e desativar contas desconhecidas.
9. Executar `database/scripts/SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql` apenas no projeto Supabase `mftvsgzrujkalssiriny`, se esse projeto ainda estiver exposto.
10. Manter `npm.cmd test` como gate obrigatorio antes de deploy, porque ele valida RBAC e classificacao de rotas API.
11. Rodar `database/scripts/SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql` e, se houver achados, aplicar `database/scripts/SECURITY_SANITIZE_LEGACY_LOGS.sql` trocando o `ROLLBACK` final por `COMMIT` somente depois de revisar o resumo.
12. Fazer redeploy na Vercel.
13. Validar headers do dominio publicado.
14. Rodar fluxo funcional de login, certificados, download publico, notificacoes e WhatsApp.
