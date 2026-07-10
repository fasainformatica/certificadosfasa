# Relatorio de Otimizacoes de Performance Implementadas

Projeto: `C:\Users\User\fasa-certificados`

Data: 2026-07-10

Base utilizada: `RELATORIO_PERFORMANCE_SISTEMA.md`

## 1. Resumo das otimizacoes implementadas

Foram implementadas as correcoes prioritarias de performance sem redesign e sem alterar regras de negocio:

- Middleware deixou de chamar Supabase Auth em rotas publicas, bot, cron e download.
- Dashboard passou a usar RPC agregada `get_dashboard_metrics()`.
- Endpoint de stats do bot passou a usar RPC agregada `get_whatsapp_bot_message_stats()` com cache curto.
- Polling de mensagens pendentes passou a usar TTL calculado pelo backend e deixou de executar fallback pesado quando a RPC retorna lote vazio.
- QWEP deixou de limpar nonces/rate-limit expirados em toda requisicao.
- Configuracoes passaram a salvar settings e templates em endpoint bundle com apenas um rebuild.
- Rebuild de notificacoes passou a inserir eventos em lotes.
- Buscas ganharam indices `pg_trgm` e filtros mais seletivos para CNPJ/telefone.
- Listagens de certificados deixaram de atualizar status em massa durante request.
- Logout passou a ser backend, removendo Supabase browser client do AppShell.
- Framer Motion foi removido do layout global.
- Graficos da dashboard passaram para wrapper client lazy.
- Script `npm run analyze` foi adicionado.

## 2. Arquivos alterados

Principais arquivos:

- `middleware.ts`
- `supabase_schema.sql`
- `supabase/migrations/20260710120000_performance_optimizations.sql`
- `src/app/(internal)/dashboard/page.tsx`
- `src/app/api/whatsapp-bot/messages/stats/route.ts`
- `src/app/api/whatsapp-bot/messages/pending/route.ts`
- `src/lib/qwep/auth.ts`
- `src/lib/notifications/engine.ts`
- `src/app/api/notifications/configuration-bundle/route.ts`
- `src/app/(internal)/configuracoes/configuracoes-form.tsx`
- `src/app/(internal)/certificados/page.tsx`
- `src/app/api/certificados/route.ts`
- `src/app/(internal)/clientes/page.tsx`
- `src/app/api/clientes/route.ts`
- `src/app/(internal)/notificacoes/page.tsx`
- `src/app/api/notifications/events/route.ts`
- `src/components/layout/logout-button.tsx`
- `src/app/api/auth/logout/route.ts`
- `src/components/layout/app-navigation.tsx`
- `src/components/layout/page-transition.tsx`
- `src/components/ui/lazy-dashboard-charts.tsx`
- `src/lib/supabase/database.types.ts`
- `desktop-bot/lib/message-queue.js`
- `next.config.ts`
- `package.json`
- `package-lock.json`
- `README.md`

## 3. SQL/RPCs adicionadas

Adicionado em `supabase_schema.sql` e na migration:

- `create extension if not exists "pg_trgm";`
- `get_dashboard_metrics()`
- `get_whatsapp_bot_message_stats()`
- `cleanup_qwep_operational_tables()`
- `reserve_pending_notification_events(uuid, integer, integer)` com TTL recebido do backend

Indices adicionados:

- `clientes_nome_razao_social_trgm_idx`
- `clientes_cnpj_trgm_idx`
- `certificados_cnpj_trgm_idx`
- `certificados_nome_titular_trgm_idx`
- `notification_events_sent_at_idx`
- `notification_events_mensagem_renderizada_trgm_idx`
- `notification_events_telefone_destino_trgm_idx`
- `whatsapp_devices_primary_sender_status_idx`

## 4. Como aplicar o SQL no Supabase

Para banco existente, execute no SQL Editor:

```sql
-- arquivo:
supabase/migrations/20260710120000_performance_optimizations.sql
```

Para projeto novo, execute o `supabase_schema.sql` completo.

## 5. O que mudou no middleware

Antes, qualquer request que passasse pelo matcher podia criar Supabase server client e chamar `auth.getUser()`.

Agora o middleware calcula primeiro:

- rota protegida
- rota de login
- rota publica
- rota bot
- rota cron
- rota download
- asset estatico

Somente rotas internas e login fazem validação Supabase no middleware.

## 6. O que mudou na dashboard

Antes, a dashboard:

- lia configuracoes;
- executava refresh de status;
- carregava ate 500 certificados;
- executava varias contagens sequenciais em `notification_events`;
- calculava graficos em JavaScript.

Agora:

- chama `get_dashboard_metrics()` uma vez;
- recebe contagens, dados dos graficos, status do bot e lista de atencao agregados;
- calcula status por data no banco, sem `limit(500)`;
- nao atualiza status em massa durante navegacao.

## 7. O que mudou no bot/stats/QWEP

`GET /api/whatsapp-bot/messages/stats`:

- deixou de fazer uma contagem por status;
- usa `get_whatsapp_bot_message_stats()`;
- aplica cache curto de 5 segundos apos autenticar.

`GET /api/whatsapp-bot/messages/pending`:

- passa `reservation_ttl_seconds_input` para a RPC;
- nao executa fallback backend quando a RPC retorna vazio sem erro;
- fallback permanece somente para falha da RPC.

QWEP:

- removeu deletes de `qwep_seen_nonces` e `qwep_rate_limit_buckets` do caminho quente;
- continua validando Bearer token, HMAC, nonce, timestamp, body hash e rate limit;
- limpeza de expirados fica em `cleanup_qwep_operational_tables()`, chamada pelo cron.

Desktop Bot:

- `desktop-bot/lib/message-queue.js` limita refresh de stats a no minimo 10 segundos.

## 8. O que mudou nas configuracoes/rebuild

Novo endpoint:

```http
PUT /api/notifications/configuration-bundle
```

Ele salva:

- `notification_settings`
- template `certificate_expiring`
- template `certificate_expired`

Depois executa apenas um `rebuildNotificationSchedule()`.

O rebuild agora monta eventos futuros e insere em chunks de 500 registros. Se houver conflito raro de idempotencia, cai para fallback individual preservando a regra de nao duplicar eventos.

## 9. O que mudou nas buscas/indices

Buscas por CNPJ completo em certificados/clientes usam igualdade (`eq`) em vez de `ilike`.

Buscas por telefone em avisos, quando o termo tem pelo menos 10 digitos, filtram `telefone_destino` diretamente e evitam buscar dentro de `mensagem_renderizada`.

Campos textuais principais receberam indices trigram para busca parcial.

## 10. O que mudou no bundle client

Logout:

- antes: `LogoutButton` importava Supabase browser client no AppShell;
- agora: formulario POST para `/api/auth/logout`, com logout server-side.

Motion:

- `app-navigation.tsx` e `page-transition.tsx` nao importam mais `framer-motion`.

Graficos:

- `lazy-dashboard-charts.tsx` isola Recharts em dynamic import client.
- Manifest da dashboard nao referencia Supabase client nem Framer Motion.
- Recharts continua existindo como chunk separado para a dashboard, mas nao fica no AppShell.

## 11. Metricas antes/depois quando disponiveis

Baseline do relatorio anterior:

- `.next/static`: 37 arquivos, aproximadamente 1.57 MB nao comprimidos.
- maior chunk Recharts: 356.1 KB.
- chunk Supabase client: 239.9 KB.
- chunk Motion/Supabase detectado: 76.6 KB.
- build: compilacao 12.7s, TypeScript 9.3s.

Depois das otimizacoes:

- `.next/static`: 37 arquivos, 1534.1 KB nao comprimidos.
- maior chunk Recharts: 356.1 KB, agora isolado para grafico/dashboard.
- chunk Supabase client: 241.7 KB, presente no login.
- build final: compilacao 10.0s, TypeScript 8.7s.
- manifest interno da dashboard nao mostrou `supabase` nem `framer-motion`.

Observacao: o tamanho total de `.next/static` nao representa o payload inicial de cada rota, pois chunks lazy e chunks de login continuam no diretorio estatico.

## 12. Testes executados

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd --prefix desktop-bot run lint
```

Resultados:

- lint do app: passou.
- build do app: passou.
- lint/syntax check do desktop-bot: passou.

Tambem foram conferidos:

- chunks estaticos finais;
- manifest da dashboard;
- uso restante de `createBrowserSupabaseClient` apenas no login;
- uso restante de `refreshCertificateStatuses` apenas no engine/cron/rebuild.

## 13. Riscos residuais

- As RPCs novas precisam ser aplicadas no Supabase antes do deploy da versao atual.
- Nao foi executado `EXPLAIN ANALYZE` no banco real; indices foram adicionados com base nas queries encontradas.
- O rebuild em batch ainda calcula mensagens renderizadas no backend TypeScript; para volumes muito altos, uma RPC set-based completa pode ser uma proxima evolucao.
- `count: exact` ainda existe em listagens paginadas; o maior problema foi reduzido, mas bases muito grandes podem exigir contagens estimadas ou cache.
- O QWEP ainda grava rate limit e nonce por request, mas removeu limpezas pesadas e reduziu round-trips em stats. Uma RPC atomica completa de auth QWEP pode ser evolucao futura.
- O envio via WhatsApp Web continua sujeito a latencia e instabilidade do proprio WhatsApp Web.

## 14. Proximas otimizacoes recomendadas

1. Medir `EXPLAIN ANALYZE` das buscas em Supabase real apos aplicar indices.
2. Criar RPC atomica completa para QWEP se o bot escalar para muitos dispositivos.
3. Trocar `count: exact` das listagens por contagem estimada/cache quando houver dezenas de milhares de registros.
4. Avaliar grafico SVG proprio se quiser remover Recharts completamente.
5. Medir com `npm.cmd run analyze` antes de novas alteracoes visuais.

