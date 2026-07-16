# Changelog

Todas as mudancas relevantes devem ser registradas aqui e refletidas tambem em `docs/SYSTEM_CONTEXT.md`.

## 2026-07-15

- Ajustado cron `euatendo-dispatch` para `5 14 * * *`, compatível com Vercel Hobby; envio frequente exige Vercel Pro ou cron externo autenticado com `CRON_SECRET`.
- Refatorado visualmente o painel administrativo com nova hierarquia operacional, sidebar responsiva, cabecalhos padronizados, tabelas mais escaneaveis, cards de metricas, estados vazios e mensagens de erro/carregamento revisadas.
- Padronizado UX writing das rotas internas: Visao geral, Central de avisos, Automacao do WhatsApp, Configuracoes do sistema, Validar conexao, Verificar numero, Enviar mensagem de teste, Aplicar filtros e Limpar filtros.
- Corrigido encoding/acentuacao em telas, APIs, templates de notificacao, mensagens euAtendo e documentos arquivados.
- Adicionados testes `tests/ui-formatting.test.ts` para nomes importados, prazos de vencimento e labels de status.
- Criados entregaveis `RELATORIO_REFATORACAO_VISUAL_UX.md`, `UX_WRITING_MAP.md` e `CHECKLIST_UI_UX.md`.
- Adicionada suite `npm test` com Vitest cobrindo upload PFX, download publico, engine de notificacoes, dispatcher euAtendo e readiness de ambiente.
- Adicionada checagem `scripts/check-service-role-rbac.mjs` para impedir novas API routes com service role sem RBAC.
- Criado healthcheck admin `GET /api/admin/health/production` para validar env, schema, bucket privado, admin ativo, tabelas euAtendo e configuracao do provider.
- Dispatcher euAtendo passou a usar lote configuravel por `EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN`, com migration `20260715150000_add_euatendo_dispatch_batching.sql`.
- Adicionado `vercel.json` com Cron Jobs e suporte `GET` nas rotas de cron para compatibilidade com Vercel.
- Corrigida RPC `reserve_euatendo_notification_event` para evitar `FOR UPDATE` sobre `LEFT JOIN`, via migration `20260715151000_fix_euatendo_reserve_outer_join.sql`.
- Consolidacao completa da documentacao do projeto.
- Criado `docs/SYSTEM_CONTEXT.md` como fonte oficial da verdade.
- Criado `docs/INDEX.md` como indice principal.
- Reescrito `README.md` para conter apenas visao geral, stack, instalacao, execucao, estrutura e links.
- Reorganizada documentacao antiga em `docs/archive/`.
- Movida referencia bruta da API euAtendo para `docs/reference/euatendo-api/`.
- Reorganizados SQLs em `database/schema/`, `database/migrations/`, `database/scripts/` e `database/archive/`.

## 2026-07-15 - Remocao do Desktop Bot

- Desktop Bot/QWEP removido do runtime operacional.
- Rotas antigas de `whatsapp-bot` e gerenciamento local de dispositivos deixaram de ser a integracao oficial.
- Provider oficial de notificacoes passou a ser exclusivamente `euatendo`.
- Migration final preserva historico consultavel, migra pendencias elegiveis para `euatendo` e bloqueia novos eventos no provider legado.

## 2026-07-15 - WhatsApp Automatico via euAtendo

- Implementado dispatcher server-side para enviar eventos de `notification_events`.
- Criada fila com reserva via RPC `reserve_euatendo_notification_event`.
- Criado estado persistente em `whatsapp_dispatcher_state`.
- Criados logs sanitizados em `whatsapp_provider_logs`.
- Criados templates para mensagens ao cliente.
- Criado envio manual de aviso pelo detalhe do certificado.
- Criado cron `POST /api/cron/euatendo-dispatch`, posteriormente ajustado para `GET/POST` e Vercel Cron Jobs.

## 2026-07-14

- Adicionado suporte inicial ao provider euAtendo.
- Criadas rotas de homologacao do Canal WhatsApp:
  - `GET /api/whatsapp/euatendo/health`
  - `POST /api/whatsapp/euatendo/check-number`
  - `POST /api/whatsapp/euatendo/test-message`
- Criada camada `src/lib/whatsapp/euatendo/` com client, provider, schemas, tipos, erros e configuracao.

## 2026-07-14

- Corrigida renovacao de certificados para atualizar o certificado existente do cliente sem duplicar registros.
- Ajustada RPC `registrar_upload_certificado`.
- Mantida reconciliacao de Storage para casos de falha entre upload e registro no banco.

## 2026-07-10

- Implementadas otimizacoes de performance em dashboard, indices, buscas e funcoes agregadas.
- Criada/ajustada RPC `get_dashboard_metrics`.
- Corrigidas metricas de certificados vencendo/vencidos e avisos no dashboard.
- Corrigida ordem de substituicao de certificados renovados.
- Ajustados cron e digest de reservas expiradas.

## 2026-07-08

- Aplicadas correcoes criticas pos-auditoria.
- Hardened download publico: token salvo como hash e senha de liberacao com hash.
- Adicionada protecao contra templates contendo segredos ou campos internos.
- Corrigidos avisos de vencidos e templates com telefone do cliente.

## 2026-07-07

- Criado schema inicial e schema completo com WhatsApp.
- Criadas tabelas principais: `clientes`, `certificados`, `links_download`, `audit_logs`, `notification_*`.
- Criado bucket privado `certificados-pfx`.
- Criadas policies RLS e funcoes base.
