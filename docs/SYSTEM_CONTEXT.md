# SYSTEM_CONTEXT

ATENCAO

Este documento e a documentacao oficial do projeto.

Sempre que qualquer implementacao relevante for concluida, este arquivo DEVE ser atualizado.

Nenhuma funcionalidade podera ser considerada concluida sem atualizar este documento.

Este arquivo deve refletir sempre o estado atual do projeto.

## Resumo executivo

O Fasa Certificados PFX e um sistema interno para administrar certificados digitais PFX de clientes da Fasa Informatica. Ele permite cadastrar clientes, importar ou subir certificados PFX, guardar o arquivo em Storage privado, criptografar a senha real do PFX, gerar links publicos de download de uso unico e controlar avisos de vencimento por WhatsApp.

O sistema atual usa Next.js App Router no frontend/backend, Supabase Auth/Postgres/Storage no banco e API euAtendo como unico canal oficial de WhatsApp. O antigo Desktop Bot/QWEP foi removido do runtime operacional. O codigo ainda preserva historico consultavel no banco quando aplicavel, mas novos envios devem usar `provider = 'euatendo'`.

Estado local desta consolidacao: o codigo, migrations e documentacao foram reorganizados para refletir o modelo atual. Nao foi assumido que as migrations ja foram aplicadas no Supabase remoto, nem que as credenciais euAtendo e crons Vercel estejam ativos no ambiente de producao.

## Arquitetura

### Frontend

- Next.js 16 App Router em `src/app`.
- Grupo autenticado em `src/app/(internal)`.
- Login em `src/app/(auth)/login`.
- Download publico em `src/app/download/[token]`.
- Componentes reutilizaveis em `src/components`.
- Tailwind CSS 4 e componentes de layout proprios.
- Refatoracao visual de 2026-07-15: o painel interno usa shell com sidebar responsiva, superficies neutras, hierarquia operacional por tarefas, cards de metricas, tabelas escaneaveis, estados vazios e mensagens em portugues do Brasil.
- Vocabulario principal: Visao geral, Certificados, Clientes, Central de avisos, Automacao do WhatsApp e Configuracoes do sistema.
- Status persistidos continuam tecnicos, mas a apresentacao converte para rotulos humanos como Valido, Vence em breve, Vencido, Na fila, Enviado, Falha no envio, Conectado e Envio automatico pausado.

### Backend

- API Routes em `src/app/api`.
- Runtime Node.js nos endpoints que usam PFX, criptografia, Supabase Admin ou euAtendo.
- Autorizacao por `requireApiUser` e RBAC em `src/lib/auth`.
- Supabase Admin server-only em `src/lib/supabase/admin.ts`.
- Regras de upload em `src/lib/certificados/upload-service.ts`.
- Notification engine em `src/lib/notifications/engine.ts`.
- Provider euAtendo em `src/lib/whatsapp/euatendo/`.

### Banco

- Supabase Postgres com RLS.
- Schema oficial em `database/schema/supabase_schema.sql`.
- Migrations incrementais em `database/migrations/`.
- Storage privado no bucket `certificados-pfx`.
- Tabelas de dominio: `clientes`, `certificados`, `links_download`, `audit_logs`, `configuracoes_sistema`.
- Tabelas de notificacao: `notification_settings`, `notification_templates`, `notification_recipients`, `notification_events`, `notification_runs`.
- Tabelas euAtendo: `whatsapp_dispatcher_state`, `whatsapp_provider_logs`.

### Fluxos

- Upload de PFX: frontend envia arquivo e senha, backend valida PFX, extrai dados, criptografa senha, grava Storage, registra banco por RPC e recalcula avisos.
- Download publico: admin gera link e senha unica, banco guarda hashes, usuario informa senha, backend gera signed URL curta e invalida o link apos uso.
- Avisos: engine planeja eventos em `notification_events`; dispatcher euAtendo reserva um evento por execucao, envia, registra sucesso/falha e aplica delay/retry.
- Crons: Vercel chama endpoints protegidos por `CRON_SECRET`.

## Estrutura de pastas

```text
src/app
  Rotas, telas e APIs Next.js.

src/app/(internal)
  Dashboard e telas autenticadas: clientes, certificados, avisos, configuracoes e Canal WhatsApp.

src/app/api
  APIs internas, crons, download publico e endpoints euAtendo.

src/components
  Layout, navegacao, UI reutilizavel, padroes de dados e marca Fasa.

src/lib
  Regras de negocio, Supabase, PFX, Storage, notificacoes, validacoes, seguranca e WhatsApp.

vercel.json
  Agendamento dos crons da Vercel.

database/schema
  Schema SQL oficial para banco novo.

database/migrations
  Migrations incrementais para banco existente.

database/scripts
  Scripts manuais ainda uteis.

database/archive
  SQL antigo, substituido ou historico.

docs
  Documentacao oficial.

docs/archive
  Relatorios e documentos substituidos. Nao sao fonte da verdade.

docs/reference
  Material externo preservado, especialmente API euAtendo.
```

## Frontend e UX

### Hierarquia visual

- As telas internas priorizam situacoes que exigem acao, estado operacional, indicadores principais, dados de apoio e historico.
- O fundo geral e neutro e levemente frio; superficies principais sao brancas com bordas suaves e sombras discretas.
- Azul permanece como cor de acao principal. Verde indica sucesso/operacao normal, amarelo/ambar indica atencao e vermelho indica falha, bloqueio ou risco.
- O shell principal mantem a identidade Fasa, reduz peso visual da sidebar e usa `aria-current="page"` para o item ativo.
- Em mobile, a navegacao vira drawer com botao de abrir/fechar, overlay e suporte a Escape.

### Componentes compartilhados

- `SectionHeader`: cabecalho padrao de pagina com titulo, subtitulo e acoes.
- `StatCard`: card de KPI com icone, valor, contexto e tom visual.
- `StatusBadge` e `Badge`: status de certificados, eventos e operacao.
- `DataTable`: tabela com cabecalho sticky, `scope="col"`, hover sutil e foco visivel.
- `FilterBar`: busca, filtros, contagem e acoes de limpeza/aplicacao.
- `EmptyState`: estados vazios especificos com suporte a acao.
- `LoadingSkeleton`: skeletons para cards e tabelas.
- `PaginationBar`: paginacao acessivel com labels em portugues.

### Telas refatoradas

- `/dashboard`: resumo operacional com KPIs, atencoes, distribuicao de certificados, vencimentos e estado de avisos/WhatsApp.
- `/certificados`: busca por titular/cliente/CNPJ, cards responsivos no mobile e tabela agrupando titular, cliente, vencimento, status e acoes.
- `/clientes`: visualizacao orientada a cliente, contato, permissao de avisos, responsavel e atualizacao.
- `/notificacoes`: Central de avisos com metricas, categorias operacionais, status humanos e tabela responsiva.
- `/whatsapp`: Automacao do WhatsApp com status de integracao, instancia, fila, enviados, falhas, tempo medio e ferramentas de homologacao.
- `/configuracoes`: Configuracoes do sistema em secoes Geral, WhatsApp, Mensagens, Destinatarios e Seguranca, incluindo chips para dias de antecedencia.
- `/certificados/novo`, `/certificados/importar`, `/certificados/[id]`, `/login` e `/download/[token]`: textos revisados, superficies alinhadas e estados de erro/carregamento mais claros.

### Responsividade e acessibilidade

- Layouts usam grids responsivos e cards em telas pequenas para evitar tabela comprimida.
- Controles interativos mantem foco visivel, labels textuais, area de toque adequada e feedback de carregamento local.
- Feedbacks assincronos usam `role="alert"` ou `role="status"` quando aplicavel.
- A interface nao deve depender apenas de cor para status: badges e descricoes textuais acompanham os tons.
- Logs tecnicos sensiveis do WhatsApp devem ser sanitizados na apresentacao; erros SQL/provider brutos nao devem aparecer para usuario comum.

## Banco de dados

### Principais tabelas

- `user_profiles`: perfil interno e role do usuario autenticado.
- `clientes`: dados do cliente, CNPJ, contato, WhatsApp e flag `whatsapp_notifications_enabled`.
- `certificados`: metadados do PFX, validade, status, senha criptografada e `storage_path`.
- `links_download`: links publicos com `token_hash`, `senha_hash`, uso unico, bloqueio por tentativas e auditoria de uso.
- `audit_logs`: trilha de auditoria de acoes administrativas e publicas relevantes.
- `storage_reconciliation_jobs`: controle de reconciliacao quando Storage e banco podem divergir.
- `configuracoes_sistema`: configuracoes gerais do sistema.
- `notification_settings`: configuracoes globais dos avisos.
- `notification_templates`: templates permitidos.
- `notification_recipients`: destinatarios internos.
- `notification_events`: outbox idempotente de mensagens.
- `notification_runs`: historico de execucoes do engine.
- `whatsapp_dispatcher_state`: lock e cadencia persistente do dispatcher euAtendo.
- `whatsapp_provider_logs`: logs sanitizados dos envios euAtendo.

### Relacionamentos

- `certificados.cliente_id` aponta para `clientes.id`.
- `links_download.certificado_id` aponta para `certificados.id`.
- `notification_events.cliente_id` pode apontar para `clientes.id`.
- `notification_events.certificado_id` pode apontar para `certificados.id`.
- `notification_events.recipient_id` aponta para `notification_recipients.id` quando `audience = 'internal'`.
- `whatsapp_provider_logs.event_id` pode apontar para `notification_events.id`.

### Status de certificados

- `ativo`: certificado ainda fora da janela de aviso.
- `vencendo`: certificado vence dentro da maior janela configurada em `dias_aviso_vencimento`.
- `vencido`: data de vencimento anterior ao dia atual na timezone configurada.
- `invalido`: certificado removido/inutilizado logicamente.

### Status de eventos

Eventos de notificacao passam por `pending`, `reserved`, `processing`, `sent`, `retry`, `failed`, `cancelled` ou `skipped`. O dispatcher euAtendo consome apenas eventos `pending` ou `retry`, com `provider = 'euatendo'`, `send_date <= hoje` e `next_retry_at` nulo ou vencido.

## Fluxo completo do sistema

### Cadastrar cliente

Clientes podem ser criados manualmente em `/clientes` via `POST /api/clientes` ou automaticamente durante upload/importacao de certificado. O CNPJ e unico. O telefone/WhatsApp alimenta exibicao, envio manual e eventos automaticos para cliente quando permitido.

### Cadastrar certificado

1. Admin acessa `/certificados/novo`.
2. Frontend envia arquivo `.pfx`, senha e dados do cliente para `POST /api/certificados/upload`.
3. Backend valida extensao, tamanho, assinatura inicial e senha do PFX.
4. `node-forge` extrai CNPJ, titular, emissao e vencimento quando disponivel.
5. Senha real do PFX e criptografada com `CERT_ENCRYPTION_KEY`.
6. Arquivo e salvo no bucket privado `certificados-pfx`.
7. RPC `registrar_upload_certificado` cria ou atualiza cliente/certificado.
8. Se ja existir certificado para o cliente, o registro e atualizado sem duplicar.
9. Sistema registra auditoria e job de reconciliacao de Storage.
10. Notification engine recalcula agenda e eventos do dia.

### Planejamento

O planejamento dos avisos acontece em `rebuildNotificationSchedule`. Ele carrega configuracoes, atualiza status dos certificados, remove eventos futuros ainda nao enviados e recria eventos planejados para cada dia configurado.

### Fila

`notification_events` e a fila/outbox. Cada evento tem data planejada, destinatario, template renderizado, provider, audience, tentativas, status, chave de idempotencia e payload sanitizado.

### Dispatcher

O dispatcher esta em `src/lib/whatsapp/euatendo/dispatcher.ts`. Ele:

1. Confere `EUATENDO_PROVIDER_ENABLED`.
2. Confere `notification_settings.enabled`.
3. Chama RPC `reserve_euatendo_notification_event`.
4. Marca o evento como `processing`.
5. Envia texto pela euAtendo.
6. Marca `sent`, `retry` ou `failed`.
7. Atualiza `whatsapp_dispatcher_state.next_allowed_send_at`.
8. Registra tentativa em `whatsapp_provider_logs`.

O cron usa `dispatchEuAtendoNotificationBatch` e processa ate `EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN` eventos por execucao, com limite interno de 100. A primeira reserva respeita `next_allowed_send_at`; reservas seguintes da mesma execucao podem ignorar essa janela para reduzir backlog controladamente.

### API euAtendo

O client chama:

- `GET /list-instances`
- `POST /check-instance-status`
- `POST /check-number-whatsapp`
- `POST /send-text-message`

A URL padrao e `https://apicluster.euatendo.app`, configuravel por `EUATENDO_API_URL`.

### WhatsApp

WhatsApp automatico depende de:

- `EUATENDO_API_TOKEN`
- `EUATENDO_INSTANCE_ID`
- `EUATENDO_PROVIDER_ENABLED=true`
- `EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN` opcional, padrao 50
- `CRON_SECRET`
- cron Vercel `euatendo-dispatch` ativo
- banco com migrations euAtendo aplicadas

## Fluxo das notificacoes

### Como cria eventos

- Upload individual chama rebuild e job do dia.
- Importacao em massa chama rebuild e job do dia quando `run_notifications` nao e `false`.
- Alteracao de configuracoes, templates ou destinatarios chama rebuild.
- Endpoint manual `POST /api/notifications/check-expiring` chama rebuild e job do dia.
- Cron diario `GET /api/cron/certificados-vencimentos` pela Vercel chama `runDueNotificationJob`.

### Como calcula dias

`calculateDaysUntilExpiration` e `calculateSendDate` trabalham com data pura e timezone configurada, por padrao `America/Sao_Paulo`. Para cada certificado e cada dia em `dias_aviso_vencimento`, o engine calcula `send_date = data_vencimento - dias`.

### Como evita duplicidade

Cada evento usa `idempotency_key` unica. Exemplos:

- Interno: `certificado:{id}:dias:{dias}:recipient:{recipient_id}:send:{sendDate}`
- Cliente: `certificado:{id}:dias:{dias}:client:{cliente_id}:send:{sendDate}`
- Vencidos diarios: `expired:date:{today}:recipient:{recipient_id}`

O banco tem indice unico para `idempotency_key` quando ela existe.

### Como faz retry

Falhas retryable da euAtendo usam backoff: 60, 300, 900 e 1800 segundos. Falhas permanentes ou tentativas acima de `max_attempts` viram `failed`.

### Como faz delay

O dispatcher aplica delay aleatorio entre `delay_minimo_segundos` e `delay_maximo_segundos`, com minimo absoluto de 30 segundos. O estado persistente fica em `whatsapp_dispatcher_state`, entao o delay sobrevive a serverless cold start.

### Como envia

Na Vercel Hobby, `GET /api/cron/euatendo-dispatch` esta configurado como cron diario (`20 13 * * *`, 10:20 em `America/Sao_Paulo`) porque a plataforma nao aceita frequencia maior nesse plano. Cada execucao processa um lote configuravel por `EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN`; o padrao atual e 50 eventos por execucao, limitado internamente a 100. Para envio frequente ou filas maiores, usar plano Pro ou cron externo chamando a rota com `CRON_SECRET`.

## Configuracoes

### Avisos Ativos

`notification_settings.enabled` controla se o sistema cria/consome avisos automaticos. Se estiver desligado, o rebuild registra skip e o dispatcher retorna disabled.

### Certificados vencidos

`expired_notifications_enabled` controla o resumo diario de certificados vencidos para destinatarios internos.

### Dias

`dias_aviso_vencimento` define as janelas de aviso. Valores validos sao inteiros positivos entre 1 e 365.

### Delay e tentativas

- `delay_minimo_segundos`: minimo 30.
- `delay_maximo_segundos`: deve ser maior ou igual ao minimo.
- `max_attempts`: 1 a 10.
- `polling_interval_seconds`: legado visual/compatibilidade, 5 a 25.

### Janela e timezone

`send_window_start`, `send_window_end` e `timezone` ficam no banco. A timezone padrao e `America/Sao_Paulo`.

### Templates

Tipos atuais:

- `certificate_expiring`: aviso interno de certificado a vencer.
- `certificate_expired`: resumo interno de certificados vencidos.
- `client_certificate_expiring`: aviso ao cliente.
- `client_certificate_expired`: template futuro ao cliente, criado inativo por padrao.
- `manual_test`: teste controlado.

Templates nao podem conter senha, link publico, download, `storage_path`, `CERT_ENCRYPTION_KEY` ou termos equivalentes.

### Destinatarios

`notification_recipients` guarda ate 5 destinatarios internos ativos. Telefones sao normalizados para formato brasileiro.

### Cliente

`clientes.whatsapp_notifications_enabled = false` bloqueia eventos destinados ao cliente, mas nao bloqueia avisos internos.

### WhatsApp

O Canal WhatsApp em `/whatsapp` permite testar conexao, verificar numero e enviar mensagem de teste. Os testes possuem rate limit e registram auditoria sem vazar token.

### Cron

Crons usam `Authorization: Bearer {CRON_SECRET}` ou header `x-cron-secret`.

## Integracao euAtendo

### Arquitetura

`EuAtendoClient` encapsula HTTP e validacao de resposta. `EuAtendoWhatsAppProvider` adapta o client para a interface de envio do sistema. `dispatchNextEuAtendoNotification` coordena reserva, envio, status e logs.

### Provider

`getActiveNotificationProvider()` retorna sempre `euatendo`. O Desktop Bot nao e provider oficial.

### Endpoints usados

- `/list-instances`
- `/check-instance-status`
- `/check-number-whatsapp`
- `/send-text-message`

### Como testar

1. Configure `EUATENDO_API_URL`, `EUATENDO_API_TOKEN` e `EUATENDO_INSTANCE_ID`.
2. Mantenha `EUATENDO_PROVIDER_ENABLED=false` durante homologacao se nao quiser disparo automatico.
3. Acesse `/whatsapp`.
4. Use testar conexao.
5. Use verificar numero.
6. Use mensagem de teste.
7. Depois da homologacao, defina `EUATENDO_PROVIDER_ENABLED=true` e valide o cron.

### Variaveis necessarias

- `EUATENDO_API_URL`
- `EUATENDO_API_TOKEN`
- `EUATENDO_INSTANCE_ID`
- `EUATENDO_PROVIDER_ENABLED`
- `CRON_SECRET`

## Frontend

### Dashboard

`/dashboard` mostra metricas agregadas de certificados e avisos, usando RPC `get_dashboard_metrics` quando disponivel e dados do dispatcher euAtendo.

### Clientes

`/clientes` lista e cadastra clientes. O cadastro tambem pode ser automatico pelo upload de certificado.

### Certificados

`/certificados` lista certificados com filtros, status e acoes. O detalhe permite editar cliente, gerar link publico, invalidar link, baixar metadados, excluir certificado e enviar aviso manual ao cliente.

### Avisos

`/notificacoes` exibe eventos, status, filtros, destinatarios e configuracoes relacionadas a notificacoes.

### Configuracoes

`/configuracoes` centraliza avisos ativos, dias, delays, templates e destinatarios internos.

### Canal WhatsApp

`/whatsapp` mostra estado do provider euAtendo, logs sanitizados, filas e ferramentas de homologacao.

## Backend

### APIs principais

- `GET/POST /api/clientes`
- `GET /api/certificados`
- `POST /api/certificados/upload`
- `POST /api/certificados/importar`
- `GET/DELETE /api/certificados/[id]`
- `POST/PATCH /api/certificados/[id]/link`
- `POST /api/certificados/[id]/aviso`
- `POST /api/download/[token]/validar`
- `GET/PUT /api/notifications/settings`
- `GET/PUT /api/notifications/templates`
- `GET/POST/PATCH/DELETE /api/notifications/recipients`
- `GET /api/notifications/events`
- `POST /api/notifications/events/[id]/retry`
- `PUT /api/notifications/configuration-bundle`
- `POST /api/notifications/check-expiring`
- `GET /api/whatsapp/euatendo/health`
- `POST /api/whatsapp/euatendo/check-number`
- `POST /api/whatsapp/euatendo/test-message`
- `GET /api/admin/health/production`
- `GET/POST /api/cron/certificados-vencimentos`
- `GET/POST /api/cron/euatendo-dispatch`

### Jobs

- `runDueNotificationJob`: atualiza status, libera reservas expiradas, cria resumo diario de vencidos e conta eventos elegiveis.
- `rebuildNotificationSchedule`: recria eventos planejados.
- `dispatchNextEuAtendoNotification`: envia o proximo evento elegivel.
- `dispatchEuAtendoNotificationBatch`: drena lote configuravel de eventos euAtendo por execucao de cron.

## Historico tecnico

- Schema inicial criado com Supabase Auth, Storage privado e tabelas de certificados.
- Download publico endurecido com token hash, senha hash, uso unico e signed URL curta.
- Auditoria profunda identificou riscos de duplicidade, performance e vazamento de segredos.
- Correcoes pos-auditoria endureceram templates, reservas e Storage.
- Performance foi melhorada com indices, RPC de dashboard e ajustes de listagens.
- Renovacao foi corrigida para substituir certificado do cliente sem duplicar.
- Integração euAtendo foi implementada como provider server-side.
- Envio automatico por euAtendo foi implementado com dispatcher, lock e logs.
- Desktop Bot/QWEP foi removido do runtime operacional.
- Documentacao foi consolidada em `docs/SYSTEM_CONTEXT.md`.
- Suite automatizada foi adicionada com Vitest cobrindo validacao de upload PFX, download publico, engine de notificacoes, dispatcher euAtendo, prontidao de ambiente e guarda service-role/RBAC.
- Dispatcher euAtendo passou a processar lote configuravel por cron.
- Healthcheck administrativo de producao foi criado em `/api/admin/health/production`.

## Estado atual

### Pronto no codigo local

- Login e RBAC interno.
- Cadastro/listagem de clientes.
- Upload individual de PFX.
- Importacao em massa de PFX.
- Armazenamento privado em Supabase Storage.
- Criptografia da senha do PFX.
- Renovacao sem duplicar certificado do cliente.
- Links publicos de download com uso unico.
- Dashboard interno.
- Configuracoes de avisos, templates e destinatarios.
- Outbox `notification_events`.
- Envio manual ao cliente pelo detalhe do certificado.
- Canal WhatsApp euAtendo.
- Dispatcher automatico euAtendo.
- Crons Vercel configurados em `vercel.json`.
- Suite `npm test` com testes automatizados e checagem service-role/RBAC.
- Healthcheck admin de prontidao de producao.
- Documentacao consolidada.

### Funcionamento depende de ambiente

- Supabase remoto com schema/migrations aplicadas.
- Bucket privado `certificados-pfx`.
- Usuario admin em `user_profiles`.
- Variaveis server-only corretas.
- Instancia euAtendo conectada.
- Vercel Cron ativo.
- `EUATENDO_PROVIDER_ENABLED=true` para envio automatico.
- As migrations `20260715150000_add_euatendo_dispatch_batching.sql` e `20260715151000_fix_euatendo_reserve_outer_join.sql` aplicadas para lote do dispatcher.

### Em homologacao ou a confirmar

- Credenciais euAtendo reais e instancia conectada no ambiente final.
- Aplicacao das migrations no Supabase de producao.
- Execucao efetiva dos crons Vercel no site publicado.
- Volume real de mensagens e limites da conta euAtendo.

## Bugs conhecidos

Nenhum bug funcional confirmado nesta consolidacao documental. Nao listar aqui bugs ja corrigidos em relatorios antigos. Pendencias de validacao operacional devem ficar em "Estado atual" ou "Riscos tecnicos" ate serem confirmadas como bug.

## Riscos tecnicos

- Migrations podem nao estar aplicadas no Supabase remoto; usar `/api/admin/health/production` para confirmar schema e bucket.
- Rate limit real da euAtendo precisa ser confirmado em producao antes de aumentar `EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN`.
- Importacao em massa pode ser custosa com muitos PFX; limite atual e 80 certificados por envio.
- Cron Vercel ainda precisa ser confirmado nos logs reais da plataforma.
- Documentacao voltara a divergir se `SYSTEM_CONTEXT.md` nao for atualizado a cada implementacao relevante.

## Proximos passos recomendados

1. Aplicar ou confirmar migrations em ambiente Supabase alvo.
2. Validar `EUATENDO_API_TOKEN` e `EUATENDO_INSTANCE_ID` em `/whatsapp`.
3. Executar envio de teste e envio manual por certificado.
4. Ativar `EUATENDO_PROVIDER_ENABLED=true` somente apos homologacao.
5. Acessar `/api/admin/health/production` como admin e corrigir qualquer check critico.
6. Confirmar crons Vercel em logs reais.
7. Monitorar backlog de `notification_events` e ajustar `EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN` com base no limite real da conta euAtendo.

## Como iniciar o desenvolvimento

Toda nova IA ou desenvolvedor deve seguir este fluxo:

1. Leia completamente `docs/SYSTEM_CONTEXT.md`.
2. Leia `docs/INDEX.md`.
3. Abra o documento especifico do modulo que sera alterado.
4. Confira o codigo atual antes de acreditar em qualquer relatorio arquivado.
5. Considere o codigo e as migrations atuais como fonte principal quando houver conflito.
6. Implemente a menor mudanca segura.
7. Rode `npm.cmd test`, `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint` e demais validacoes cabiveis.
8. Atualize `docs/SYSTEM_CONTEXT.md` e `CHANGELOG.md` se a mudanca for relevante.
9. Nenhuma funcionalidade relevante esta concluida sem documentacao atualizada.

ATENCAO

Este documento e a documentacao oficial do projeto.

Sempre que qualquer implementacao relevante for concluida, este arquivo DEVE ser atualizado.

Nenhuma funcionalidade podera ser considerada concluida sem atualizar este documento.

Este arquivo deve refletir sempre o estado atual do projeto.
