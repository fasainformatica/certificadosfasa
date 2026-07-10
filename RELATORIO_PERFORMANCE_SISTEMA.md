# RELATORIO DE PERFORMANCE DO SISTEMA

Projeto analisado: `C:\Users\User\fasa-certificados`

Data da analise: 2026-07-10

Escopo: Next.js App Router, Supabase, PostgreSQL, APIs, dashboard, tabelas, notificacoes, WhatsApp Bot desktop, bundle client e consultas principais.

Regra seguida: esta etapa nao implementou correcoes, nao refatorou codigo e nao alterou regras de negocio. O unico arquivo gerado foi este relatorio solicitado.

## Indice

1. [Resumo executivo](#1-resumo-executivo)
2. [Principais causas provaveis da lentidao](#2-principais-causas-provaveis-da-lentidao)
3. [Paginas mais criticas](#3-paginas-mais-criticas)
4. [APIs mais criticas](#4-apis-mais-criticas)
5. [Queries mais criticas](#5-queries-mais-criticas)
6. [Componentes mais pesados](#6-componentes-mais-pesados)
7. [Problemas com Client Components](#7-problemas-com-client-components)
8. [Problemas com animacoes e motion](#8-problemas-com-animacoes-e-motion)
9. [Problemas com graficos](#9-problemas-com-graficos)
10. [Problemas de banco e Supabase](#10-problemas-de-banco-e-supabase)
11. [Problemas de paginacao e listagens](#11-problemas-de-paginacao-e-listagens)
12. [Problemas de bundle e dependencias](#12-problemas-de-bundle-e-dependencias)
13. [Riscos de travamento em producao](#13-riscos-de-travamento-em-producao)
14. [Otimizacoes recomendadas](#14-otimizacoes-recomendadas)
15. [Plano de correcao priorizado](#15-plano-de-correcao-priorizado)
16. [Checklist de validacao pos-correcao](#16-checklist-de-validacao-pos-correcao)
17. [Grau de confianca da analise](#17-grau-de-confianca-da-analise)

## 1. Resumo executivo

O sistema esta funcional e o build de producao passa, mas ha sinais claros de lentidao por tres fontes principais:

1. Excesso de round-trips ao Supabase em paginas e APIs que deveriam agregar dados em uma unica RPC ou consulta paralelizada.
2. Bundle client maior que o necessario em todas as paginas internas, principalmente porque o botao de logout carrega o client do Supabase no AppShell inteiro e porque Framer Motion fica no layout interno.
3. Polling do WhatsApp Bot muito verboso: cada ciclo pode autenticar via QWEP, gravar rate limit/nonce, consultar mensagens, consultar estatisticas e atualizar heartbeat, gerando muitas leituras/escritas pequenas no banco.

Medições executadas:

| Comando | Resultado |
|---|---|
| `npm.cmd run lint` | Passou |
| `npm.cmd --prefix desktop-bot run lint` | Passou |
| `npm.cmd run build` | Passou |
| Build Next.js | Compilacao 12.7s, TypeScript 9.3s, paginas estaticas 325ms |
| Chunks estaticos `.next/static` | 37 arquivos, 1.57 MB nao comprimidos |
| Maior chunk client | 356.1 KB com Recharts |
| Chunk Supabase client | 239.9 KB, incluido em login e paginas internas |
| Chunk misto motion/supabase | 76.6 KB |

Conclusao objetiva: o gargalo mais provavel percebido pelo usuario esta mais no backend/Supabase e no excesso de dados/consultas do que em CSS. O frontend tambem contribui pelo bundle client, principalmente em paginas internas e dashboard.

## 2. Principais causas provaveis da lentidao

| Prioridade | Area | Problema | Evidencia | Impacto | Correcao recomendada |
|---|---|---|---|---|---|
| Critica | Middleware/API | O middleware chama `supabase.auth.getUser()` antes de saber se a rota e protegida. Isso afeta tambem APIs publicas, bot e cron. | `middleware.ts:13-45`, `middleware.ts:47-64` | Todo request nao estatico pode pagar uma validacao Supabase desnecessaria, inclusive polling frequente do bot. | Calcular `isProtected`/`isAuthRoute` antes de criar client Supabase e chamar `getUser()` somente nessas rotas. Excluir `/api/whatsapp-bot`, `/api/cron` e download publico do custo de auth do middleware. |
| Critica | Dashboard | Dashboard faz muitas consultas sequenciais e calcula agregados no JS a partir de `limit(500)`. | `src/app/(internal)/dashboard/page.tsx:37-90`, `:93-115` | Latencia soma consulta por consulta; acima de 500 certificados os numeros podem ficar incompletos. | Criar RPC unica `get_dashboard_metrics()` com agregados, status, fila, ultimo envio e bot. Executar uma chamada. |
| Critica | Bot WhatsApp | `/api/whatsapp-bot/messages/stats` faz 8 contagens sequenciais com `count exact`. | `src/app/api/whatsapp-bot/messages/stats/route.ts:21-39` | Se o bot consulta a cada poucos segundos, isso gera dezenas/centenas de contagens por minuto. | Trocar por uma RPC agregada com `count(*) filter (...)` em uma query. Reduzir frequencia de stats. |
| Critica | QWEP | Autenticacao QWEP faz delete de rate limit e delete de nonces expirados em toda requisicao, alem de buscar dispositivo. | `src/lib/qwep/auth.ts:76-115`, `:118-136`, `:186-240` | Polling/heartbeat viram muitas escritas pequenas no banco. Em bot ativo, isso pode ser um gargalo constante. | Separar limpeza de expirados para job periodico, reduzir writes por request, usar RPC atomica para rate limit/nonce/device. |
| Alta | Notificacoes | `rebuildNotificationSchedule` remove eventos e cria novos eventos um a um em loops aninhados. | `src/lib/notifications/engine.ts:529-548`, `:837-868` | Com 1.000 certificados, 3 dias e 5 destinatarios, pode gerar 15.000 inserts sequenciais. | Mover rebuild para RPC set-based ou batch insert/upsert com chunks e uma unica transacao logica. |
| Alta | Configuracoes | Salvar configuracoes chama settings e dois templates em sequencia; cada endpoint executa rebuild. | `src/app/(internal)/configuracoes/configuracoes-form.tsx:137-181`, `src/app/api/notifications/settings/route.ts:61-64`, `src/app/api/notifications/templates/[id]/route.ts:71-74` | Um clique pode recalcular toda a agenda duas ou tres vezes. | Criar endpoint unico `PUT /api/notifications/configuration-bundle` que salva tudo e dispara um rebuild ao final. |
| Alta | Listagens/busca | Busca usa `ilike` com `%termo%` sem evidencia de `pg_trgm`/GIN. | `src/app/(internal)/certificados/page.tsx:64-65`, `src/app/(internal)/clientes/page.tsx:36-40`, `src/app/(internal)/notificacoes/page.tsx:162` e ausencia de `pg_trgm` em `supabase_schema.sql` | Busca em bases maiores tende a fazer scan, principalmente em `mensagem_renderizada`. | Adicionar `pg_trgm` e indices GIN nos campos textuais buscados, ou trocar por busca normalizada/exata quando possivel. |
| Alta | Status certificados | `refreshCertificateStatuses` pode atualizar certificados em acessos de dashboard/listagem/API. | `src/app/(internal)/dashboard/page.tsx:42`, `src/app/(internal)/certificados/page.tsx:50`, `src/app/api/certificados/route.ts:34`, `supabase_schema.sql:1149-1184` | Primeiro acesso do dia ou apos mudanca pode executar update em massa e travar resposta. | Rodar no cron/rebuild ou calcular status por view/RPC sem update por request. |
| Alta | Bundle client | Supabase client entra nas paginas internas por causa do `LogoutButton`. | `src/components/layout/logout-button.tsx:1-16`; build mostra chunk Supabase 239.9 KB em paginas internas. | Mais JS para baixar, parsear e hidratar em telas que nao precisam de Supabase no browser. | Fazer logout por rota/server action ou form POST server-side. Manter Supabase client apenas no login, se continuar necessario. |
| Media | Graficos | Dashboard carrega Recharts em chunk de 356.1 KB. | `src/components/ui/charts.tsx:1-13`; build `.next/static/chunks/2iiv54r5njhd0.js` 356.1 KB com Recharts | Dashboard demora mais para hidratar e renderizar em maquinas fracas. | Dynamic import dos graficos, skeleton leve, ou grafico SVG/CSS proprio para agregados simples. |
| Media | Motion | Framer Motion e usado no menu e transicao de pagina do layout interno. | `src/components/layout/app-navigation.tsx:1-12`, `src/components/layout/page-transition.tsx:1-17` | Toda area interna recebe custo de motion para microinteracoes simples. | Substituir animacoes simples por CSS ou importar motion dinamicamente apenas onde agrega valor. |

## 3. Paginas mais criticas

| Pagina | Prioridade | Evidencia | Diagnostico |
|---|---|---|---|
| `/dashboard` | Critica | `src/app/(internal)/dashboard/page.tsx:37-90` | Faz settings, refresh status, lista ate 500 certificados, seis contagens em `notification_events`, busca ultimo envio e busca dispositivo, tudo sequencial. |
| `/notificacoes` | Alta | `src/app/(internal)/notificacoes/page.tsx:131-143`, `:162` | Consulta eventos com joins, `count exact`, ordenacao e busca `ilike` em mensagem/telefone. Boa paginacao, mas query pode pesar com 10.000 eventos. |
| `/configuracoes` | Alta | `src/app/(internal)/configuracoes/page.tsx:13-31`, `configuracoes-form.tsx:137-181` | Load faz ensure de templates e tres consultas; salvar pode disparar multiplos rebuilds. |
| `/certificados` | Media/Alta | `src/app/(internal)/certificados/page.tsx:45-68` | Refresh de status por acesso, `count exact`, `ilike` e join com cliente. |
| `/clientes` | Media | `src/app/(internal)/clientes/page.tsx:32-40` | Paginacao existe, mas busca textual sem indice trigram pode ficar lenta. |
| `/whatsapp` | Media | `src/app/(internal)/whatsapp/page.tsx:11-16` | Lista todos dispositivos sem paginacao. Provavelmente pequeno, mas pode crescer com historico. |
| `/certificados/novo` | Media | `src/app/(internal)/certificados/novo/page.tsx:11-13` | Carrega todos os clientes para selecao manual. Com muitos clientes, vira payload grande. |

## 4. APIs mais criticas

| Rota | Prioridade | Gargalo observado | Evidencia | Recomendacao |
|---|---|---|---|---|
| `GET /api/whatsapp-bot/messages/stats` | Critica | 8 contagens sequenciais por status. | `src/app/api/whatsapp-bot/messages/stats/route.ts:26-39` | Uma RPC agregada com `count(*) filter`. Cache curto de 5-15s se aceitavel. |
| `GET /api/whatsapp-bot/messages/pending` | Critica | QWEP + settings + RPC + fallback possivel + log. | `src/app/api/whatsapp-bot/messages/pending/route.ts:187-230`; fallback `:52-184` | Garantir RPC sempre funcional, remover fallback no caminho quente ou deixar somente para emergencia com alerta. |
| `POST /api/whatsapp-bot/status/heartbeat` | Alta | QWEP + update dispositivo + possivel insert log + settings. | `src/app/api/whatsapp-bot/status/heartbeat/route.ts:26-92` | Nao retornar settings completas em todo heartbeat; cachear config no bot e atualizar por versao. |
| `PUT /api/notifications/settings` | Alta | Salva configuracao e executa rebuild completo. | `src/app/api/notifications/settings/route.ts:42-66` | Salvar settings e enfileirar rebuild async ou endpoint bundle unico. |
| `PUT /api/notifications/templates/[id]` | Alta | Cada template salvo dispara rebuild completo. | `src/app/api/notifications/templates/[id]/route.ts:52-76` | Debounce/rebuild unico depois de salvar todos os templates. |
| `POST/PATCH/DELETE /api/notifications/recipients` | Alta | Cada alteracao de destinatario dispara rebuild. | `src/app/api/notifications/recipients/route.ts:71-76`, `recipients/[id]/route.ts:72-100` | Rebuild assinc/agrupado; batch de alteracoes. |
| `GET /api/certificados` | Media/Alta | Refresh status + count exact + busca ilike. | `src/app/api/certificados/route.ts:29-53` | Remover refresh por request; indice de busca; count estimado/opcional. |
| `GET /api/notifications/events` | Alta | Joins + count exact + busca em mensagem renderizada. | `src/app/api/notifications/events/route.ts:108-135` | Indices trigram, filtros obrigatorios por data/status para grandes volumes, endpoint resumido. |
| `POST /api/admin/storage/reconcile` | Media | Verifica Storage sequencialmente arquivo por arquivo. | `src/lib/storage/reconciliation.ts:140-156` | Manter manual/admin; se virar rotina, usar manifests/batch e limitar escopo. |

## 5. Queries mais criticas

| Query/fluxo | Tabelas | Problema | Evidencia | Risco |
|---|---|---|---|---|
| Dashboard contagens de avisos | `notification_events` | Multiplas contagens `count exact`, sequenciais. | `dashboard/page.tsx:50-76` | Lento com 10.000+ eventos. |
| Dashboard certificados | `certificados`, `clientes` | Busca ate 500 e calcula agregados em memoria. | `dashboard/page.tsx:43-47`, `:93-115` | Incompleto acima de 500; processamento server desnecessario. |
| Busca certificados | `certificados` | `nome_titular.ilike.%termo%` sem trigram. | `certificados/page.tsx:64-65`, `api/certificados/route.ts:49-50` | Scan em bases maiores. |
| Busca clientes | `clientes` | `nome_razao_social.ilike.%termo%` sem trigram. | `clientes/page.tsx:36-40`, `api/clientes/route.ts:36-37` | Scan em bases maiores. |
| Busca avisos | `notification_events` | `mensagem_renderizada.ilike.%termo%` pode ser campo grande. | `notificacoes/page.tsx:162`, `api/notifications/events/route.ts:134` | Muito caro com historico grande. |
| Rebuild eventos | `notification_events`, `certificados`, `notification_recipients` | Inserts sequenciais em loops aninhados. | `engine.ts:837-868` | Tempo cresce linearmente por certificado x dias x destinatarios. |
| QWEP auth | `qwep_rate_limit_buckets`, `qwep_seen_nonces`, `whatsapp_devices` | Delete/insert/update por request. | `qwep/auth.ts:89-113`, `:131-133`, `:221-222` | Write amplification constante. |
| Status certificados | `certificados` | Update em massa acionado por pagina/API. | `supabase_schema.sql:1169-1180`; chamadas em `dashboard`, `certificados`, `api/certificados` | Latencia e locks em horario de uso. |

## 6. Componentes mais pesados

Arquivos mais longos e com maior potencial de custo de manutencao/hidratacao:

| Arquivo | Linhas aproximadas | Observacao |
|---|---:|---|
| `src/lib/notifications/engine.ts` | 859 | Concentracao alta de regras de notificacao, rebuild, cron e templates. Custo maior no backend. |
| `src/app/(internal)/configuracoes/configuracoes-form.tsx` | 614 | Maior Client Component; muitos estados e varias chamadas fetch sequenciais. |
| `src/app/(internal)/notificacoes/page.tsx` | 340 | Server page com query pesada, filtros e renderizacao de tabela/cards. |
| `src/app/api/certificados/upload/route.ts` | 269 | Upload, parsing, Storage e rebuild. Naturalmente pesado, mas e fluxo administrativo. |
| `src/app/(internal)/dashboard/page.tsx` | 264 | Principal pagina critica por consultas sequenciais e graficos. |
| `src/app/(internal)/whatsapp/whatsapp-devices-panel.tsx` | 252 | Client Component medio; aceitavel se lista de dispositivos for pequena. |
| `src/app/api/whatsapp-bot/messages/pending/route.ts` | 252 | Caminho quente do bot; precisa ser muito eficiente. |

## 7. Problemas com Client Components

Client Components encontrados:

- `src/app/(auth)/login/login-form.tsx`
- `src/app/(internal)/configuracoes/configuracoes-form.tsx`
- `src/app/(internal)/whatsapp/whatsapp-devices-panel.tsx`
- `src/app/(internal)/certificados/novo/upload-certificate-form.tsx`
- `src/app/(internal)/certificados/[id]/download-link-manager.tsx`
- `src/app/(internal)/certificados/[id]/client-edit-form.tsx`
- `src/app/(internal)/certificados/[id]/delete-certificate-button.tsx`
- `src/app/(internal)/notificacoes/retry-event-button.tsx`
- `src/app/download/[token]/download-form.tsx`
- `src/components/layout/app-navigation.tsx`
- `src/components/layout/logout-button.tsx`
- `src/components/layout/page-transition.tsx`
- `src/components/ui/charts.tsx`
- `src/lib/supabase/client.ts`

Analise:

| Componente | Precisa ser client? | Problema de performance | Recomendacao |
|---|---|---|---|
| `logout-button.tsx` | Nao necessariamente | Carrega Supabase browser client em todas as paginas internas. | Trocar por rota/server action de logout. |
| `app-navigation.tsx` | Sim para active path, mas pode ser leve | Usa Framer Motion para indicador simples. | CSS transition ou client menor sem Framer. |
| `page-transition.tsx` | Opcional | Usa Framer Motion no wrapper de todas as paginas internas. | Remover ou trocar por CSS; manter apenas se ganho visual justificar. |
| `charts.tsx` | Sim, por Recharts | 356.1 KB no dashboard. | Dynamic import, lazy load ou grafico mais leve. |
| `configuracoes-form.tsx` | Sim | Grande e faz fetchs sequenciais; salvar dispara rebuilds multiplos. | Separar formularios por aba e endpoint unico para salvar. |

## 8. Problemas com animacoes e motion

Evidencias:

- `AppNavigation` importa `LazyMotion`, `domAnimation`, `m` e `useReducedMotion` em `src/components/layout/app-navigation.tsx:11`.
- `PageTransition` importa Framer Motion em `src/components/layout/page-transition.tsx:3`.
- O CSS global respeita `prefers-reduced-motion` em `src/app/globals.css:67-78`.

Diagnostico:

- As animacoes nao parecem ser a causa principal da lentidao de rede/backend.
- O custo esta mais no bundle e hidratacao: Framer Motion entra em todas as paginas internas para animacoes simples.
- `prefers-reduced-motion` esta presente, o que e positivo, mas nao evita download/parse do pacote.

Recomendacao:

1. Remover Framer Motion do AppShell global.
2. Manter transicoes via CSS para sidebar, hover e page fade simples.
3. Se for manter Framer, isolar em componentes que so carregam onde necessario.

## 9. Problemas com graficos

Evidencias:

- `src/components/ui/charts.tsx:1-13` importa `Bar`, `BarChart`, `Cell`, `Pie`, `PieChart`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis` de `recharts`.
- Build identificou `.next/static/chunks/2iiv54r5njhd0.js` com 356.1 KB e conteudo Recharts.
- Dashboard importa `DonutChart` e `ExpirationBarChart` em `src/app/(internal)/dashboard/page.tsx:13-14`.

Impacto:

- O dashboard precisa hidratar Recharts mesmo para poucos dados.
- Em maquinas mais fracas, o custo de parse/hidratacao pode ser percebido como travamento inicial.

Recomendacao:

- Usar `next/dynamic` para carregar graficos depois da estrutura principal.
- Exibir cards e lista primeiro; grafico em lazy.
- Considerar SVG server-rendered ou componente leve proprio para donut/barra, ja que os graficos sao simples.

## 10. Problemas de banco e Supabase

### Indices existentes positivos

O schema ja tem indices importantes:

- `certificados_cnpj_idx`, `certificados_data_vencimento_idx`, `certificados_status_idx` em `supabase_schema.sql:195-198`.
- `notification_events_send_date_status_idx`, `notification_events_pending_idx`, `notification_events_reservation_idx` em `supabase_schema.sql:1063-1080`.
- `whatsapp_devices_token_hash_idx` em `supabase_schema.sql:1087-1088`.

### Lacunas de indice

| Tabela | Campo/consulta | Problema | Indice recomendado |
|---|---|---|---|
| `clientes` | `nome_razao_social ilike '%termo%'` | Sem trigram, possivel scan. | `gin (nome_razao_social gin_trgm_ops)` |
| `clientes` | `cnpj ilike '%digitos%'` | Btree ajuda igualdade, nao `%...%`. | Normalizar busca para igualdade quando 14 digitos, ou trigram se busca parcial for necessaria. |
| `certificados` | `nome_titular ilike '%termo%'` | Sem trigram. | `gin (nome_titular gin_trgm_ops)` |
| `notification_events` | `mensagem_renderizada ilike '%termo%'` | Campo potencialmente grande e historico alto. | Evitar busca nesse campo por padrao; se mantiver, trigram e filtros obrigatorios por data/status. |
| `notification_events` | ultimo envio `status='sent' order by sent_at desc` | Nao ha indice especifico em `sent_at`. | Parcial `(sent_at desc) where status='sent'` ou `(status, sent_at desc)`. |
| `whatsapp_devices` | primary sender nao revogado ordenado por updated_at | Existe unique parcial de primary, mas consulta tambem filtra status e ordena. | Parcial `(updated_at desc) where is_primary_sender=true and status <> 'revoked'`. |

### RLS e policies

As policies usam funcoes `public.can_read_internal()` e `public.is_admin()` em tabelas sensiveis:

- Funcoes em `supabase_schema.sql:289-336`.
- Policies em `supabase_schema.sql:546-574` e `:1436-1464`.

Isso esta correto para seguranca. Do ponto de vista de performance, o impacto principal observado nao e a RLS isolada, mas sim a repeticao de consultas de auth/perfil e o volume de queries.

## 11. Problemas de paginacao e listagens

Pontos positivos:

- `src/lib/pagination.ts` limita `pageSize` a 100.
- Certificados, clientes e avisos usam `.range(...)`.
- UI tem `PaginationBar`.

Pontos ainda problematicos:

| Area | Problema | Evidencia | Recomendacao |
|---|---|---|---|
| Dashboard | Nao usa paginacao nem agregacao real; carrega ate 500 certificados. | `dashboard/page.tsx:43-47` | RPC agregada, sem trazer lista completa para contar. |
| Listagens | `count: exact` em todas as paginas principais. | `certificados/page.tsx:53-58`, `clientes/page.tsx:32-37`, `notificacoes/page.tsx:136-143` | Count opcional, cacheado, estimado ou separado por filtros. |
| Busca | Sem debounce porque usa submit, isso e bom. Mas query textual e pesada. | `*.page.tsx` com `ilike` | Indices e filtros mais especificos. |
| Certificado novo | Seleciona todos os clientes para upload manual. | `src/app/(internal)/certificados/novo/page.tsx:11-13` | Busca remota/autocomplete paginado se houver muitos clientes. |
| WhatsApp | Lista todos dispositivos. | `src/app/(internal)/whatsapp/page.tsx:11-16` | Paginacao ou limite/historico se crescer. |

## 12. Problemas de bundle e dependencias

Dependencias principais:

- `@supabase/ssr`, `@supabase/supabase-js`
- `framer-motion`
- `lucide-react`
- `recharts`
- `node-forge`
- `zod`

Analise do build:

| Chunk | Tamanho nao comprimido | Conteudo detectado | Paginas afetadas |
|---|---:|---|---|
| `2iiv54r5njhd0.js` | 356.1 KB | Recharts | Dashboard |
| `16j2vvm7_g-5q.js` | 239.9 KB | Supabase client | Login e paginas internas |
| `2v1t_dhlmx68h.js` | 76.6 KB | Framer Motion/Supabase detectados | Paginas internas |
| `2qo6-o95bf43z.css` | 54.8 KB | CSS | Global |
| `2mn08t6dptl88.js` | 26.9 KB | Lucide | Varias paginas |

Problemas objetivos:

1. Supabase browser client nao deveria ser necessario em todas as paginas internas apenas para logout.
2. Framer Motion no layout interno aumenta o JS base.
3. Recharts e pesado para graficos simples e deve ser lazy.
4. Nao existe script `analyze` no `package.json`; a analise de bundle ainda e manual.

## 13. Riscos de travamento em producao

### Com 10 certificados

- Sistema deve funcionar bem.
- Lentidao percebida provavelmente vem de dev server, rede Supabase ou bot polling.

### Com 100 certificados

- Dashboard ainda funciona, mas ja faz consultas sequenciais.
- Rebuild de notificacoes pode ser perceptivel ao salvar configuracoes.

### Com 1.000 certificados

- Dashboard fica incompleto por `limit(500)`.
- Rebuild pode tentar criar milhares de eventos em loops sequenciais.
- Busca `ilike` sem trigram passa a pesar.

### Com 10.000 eventos de notificacao

- `/api/whatsapp-bot/messages/stats` fica caro por fazer 8 contagens sequenciais.
- `/notificacoes` pode ficar lenta com joins + count exact + ordenacao + busca textual.
- Dashboard conta `notification_events` varias vezes.

### Bot offline por varios dias

- Muitos eventos podem acumular.
- Ao reconectar, o bot processa um por vez, o que e correto para seguranca, mas stats/pending continuam fazendo consultas frequentes.
- Retry e reservas podem aumentar writes em `notification_events`.

### Varios usuarios internos

- Cada navegacao interna aciona middleware `getUser`, layout `getUser` + profile e queries da pagina.
- Dashboard aberta por varios usuarios multiplica as contagens.

## 14. Otimizacoes recomendadas

| Prioridade | Area | Otimizacao | Arquivos envolvidos | Ganho esperado | Risco |
|---|---|---|---|---|---|
| Critica | Middleware | Evitar `getUser()` para rotas que nao precisam de sessao. | `middleware.ts` | Reduz latencia de todas APIs do bot/publicas/cron. | Baixo se matcher for testado. |
| Critica | Dashboard | Criar RPC agregada para metricas do dashboard. | `dashboard/page.tsx`, `supabase_schema.sql` | Maior ganho perceptivel no painel. | Medio, exige validar contagens. |
| Critica | Bot stats | Substituir loop por RPC agregada e reduzir frequencia. | `messages/stats/route.ts`, `desktop-bot/lib/message-queue.js` | Menos carga constante no Supabase. | Baixo/medio. |
| Critica | QWEP | Reduzir writes por request em rate limit/nonce. | `src/lib/qwep/auth.ts`, SQL | Menos travamento com polling. | Medio por envolver seguranca. |
| Alta | Rebuild | Transformar rebuild em operacao set-based/batch. | `engine.ts`, SQL/RPC | Evita timeout ao salvar configs/upload. | Alto, precisa testes. |
| Alta | Configuracoes | Endpoint unico para salvar settings + templates e disparar um rebuild. | `configuracoes-form.tsx`, APIs notifications | Evita rebuild triplo. | Medio. |
| Alta | Busca | Adicionar `pg_trgm`/GIN ou busca normalizada. | `supabase_schema.sql`, listagens/APIs | Melhora busca com volume. | Baixo/medio. |
| Alta | Status | Remover refresh de status por pagina/API. | `certificados/status.ts`, dashboard/listagens, cron | Menos writes em request de usuario. | Medio. |
| Media | Bundle | Logout server-side para remover Supabase client do AppShell. | `logout-button.tsx`, nova rota/server action | Reduz JS base interno em ~240 KB nao comprimidos. | Baixo/medio. |
| Media | Graficos | Dynamic import/lazy para Recharts ou grafico leve proprio. | `charts.tsx`, `dashboard/page.tsx` | Dashboard mais rapido para interagir. | Baixo. |
| Media | Motion | Remover Framer do layout global. | `app-navigation.tsx`, `page-transition.tsx` | Menos JS e hidratacao. | Baixo. |
| Baixa | Bundle analyzer | Adicionar script `analyze`. | `package.json`, `next.config.ts` | Medicao recorrente. | Baixo. |

## 15. Plano de correcao priorizado

| Ordem | Otimizacao | Arquivos envolvidos | Ganho esperado | Risco | Como validar |
|---:|---|---|---|---|---|
| 1 | Corrigir middleware para nao autenticar rotas desnecessarias | `middleware.ts` | Reduz overhead em todas APIs do bot e rotas publicas. | Baixo | Testar login, rotas internas, download publico, cron e bot. |
| 2 | Criar RPC de dashboard agregada | `supabase_schema.sql`, `dashboard/page.tsx` | Dashboard deixa de fazer 10+ round-trips. | Medio | Comparar numeros antes/depois com base de teste. |
| 3 | Trocar `/messages/stats` para uma query/RPC agregada | `messages/stats/route.ts`, SQL | Reduz carga continua do bot. | Baixo | Medir tempo da rota com 10k eventos. |
| 4 | Reduzir QWEP write amplification | `qwep/auth.ts`, SQL | Menos writes por polling/heartbeat. | Medio/alto | Testar replay, nonce duplicado, rate limit e bot online. |
| 5 | Unificar salvamento de Configuracoes e rebuild unico | `configuracoes-form.tsx`, APIs `notifications/*` | Evita rebuild duplicado/triplo. | Medio | Salvar settings+templates e confirmar 1 `notification_run`. |
| 6 | Rebuild set-based/batch | `engine.ts`, SQL/RPC | Garante escala para 1.000+ certificados. | Alto | Testar 1k certificados x 5 destinatarios x 3 dias. |
| 7 | Adicionar indices de busca | `supabase_schema.sql`, migrations | Melhora listagens com busca. | Baixo | `EXPLAIN ANALYZE` das buscas. |
| 8 | Mover refresh de status para cron/view/RPC agregada | `certificados/status.ts`, paginas/APIs | Menos writes em navegacao. | Medio | Certificado vencido hoje aparece correto sem update por request. |
| 9 | Remover Supabase client do AppShell | `logout-button.tsx`, auth/logout route | Reduz bundle inicial interno. | Medio | Build e checar chunks, logout funcionando. |
| 10 | Lazy load Recharts e reduzir Motion global | `charts.tsx`, `dashboard/page.tsx`, layout | Menos JS/hidratacao. | Baixo | Comparar chunks e Lighthouse/manual. |

## 16. Checklist de validacao pos-correcao

### Medicoes tecnicas

- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd --prefix desktop-bot run lint`
- [ ] Medir tamanho de `.next/static/chunks` antes/depois.
- [ ] Confirmar que Supabase client nao entra em paginas internas sem necessidade.
- [ ] Medir tempo de `/dashboard` com dados reais.
- [ ] Medir tempo de `/api/whatsapp-bot/messages/stats` com 10k eventos.
- [ ] Medir tempo de `/api/whatsapp-bot/messages/pending` com muitos eventos pendentes.
- [ ] Rodar `EXPLAIN ANALYZE` nas buscas de certificados/clientes/avisos.

### Fluxos funcionais que nao podem quebrar

- [ ] Login e logout.
- [ ] Protecao de rotas internas.
- [ ] RBAC admin/financeiro.
- [ ] Dashboard com contagens corretas.
- [ ] Listagem de certificados com filtros e paginacao.
- [ ] Listagem de clientes com busca e paginacao.
- [ ] Avisos com filtros, status e paginacao.
- [ ] Configuracoes salvando settings, templates e destinatarios.
- [ ] Rebuild de notificacoes sem duplicidade.
- [ ] Cron diario.
- [ ] Bot autentica, heartbeat, pending, ACK e stats.
- [ ] Bot envia uma mensagem por vez.
- [ ] Delay minimo de 30 segundos permanece.
- [ ] Download publico continua funcionando.

### Testes de carga manuais sugeridos

- [ ] 100 certificados, dashboard abaixo de 1s no servidor local/Supabase proximo.
- [ ] 1.000 certificados, dashboard sem carregar lista inteira.
- [ ] 10.000 eventos, `/messages/stats` abaixo de 200-500ms em ambiente remoto razoavel.
- [ ] Configuracoes com 1.000 certificados e 5 destinatarios nao causa timeout.
- [ ] Bot offline por 3 dias e depois online nao trava o backend.

## 17. Grau de confianca da analise

Grau de confianca: 88%.

O que foi confirmado com evidencia:

- Build e lint passam.
- Bundle estatico tem chunks grandes de Recharts, Supabase client e Motion.
- Dashboard faz varias consultas sequenciais.
- Middleware chama Supabase Auth para requests que nao necessariamente precisam de auth.
- Bot stats faz contagens sequenciais.
- QWEP faz multiplas operacoes de banco por request.
- Rebuild cria eventos em loops sequenciais.
- Listagens ja possuem paginacao basica, mas usam `count exact` e `ilike` sem trigram.

Limitacoes:

- Nao foi feita medicao com sessao autenticada em navegador porque isso exigiria usar cookies reais do usuario.
- Nao foi executado `EXPLAIN ANALYZE` no Supabase real, pois o ambiente local nao tem acesso direto ao banco com dados de producao.
- Nao foi criado bundle analyzer formal porque nao existe script `analyze` no projeto.
- Os tempos reais podem variar por regiao do Supabase, plano do banco, latencia de rede e volume de dados real.

Conclusao final: a ordem mais eficiente para deixar o sistema mais rapido e fluido e corrigir primeiro o middleware, dashboard e APIs do bot. Depois atacar rebuild e indices de busca. Por ultimo otimizar bundle client com logout server-side, lazy load de graficos e remocao de Framer Motion global.
