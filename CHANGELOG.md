# Changelog

Todas as mudancas relevantes devem ser registradas aqui e refletidas tambem em `docs/SYSTEM_CONTEXT.md`.

## 2026-07-30

- Adicionada situacao de renovacao `Sem retorno` para certificados, com filtro na listagem, card de resumo e migration `20260730100000_add_certificate_no_response_status.sql`; o status fica fora do planejamento automatico.
- Removido o bloco `Resumo operacional` da `/dashboard`, mantendo KPIs, graficos, `Precisa de atencao` e `Avisos e WhatsApp`.
- Melhorado o UX de `/configuracoes` com resumo operacional de envio automatico, dias de aviso, janela, cadencia, limites WhatsApp e templates, alem de tratamento seguro para falha de rede em salvar, atualizar planejamento e destinatarios.
- Melhorado o UX de `/clientes` com cards de resumo operacional, badges de completude de contato, status humano de avisos ao cliente, ação `Novo certificado` e estado vazio com ação contextual.
- Melhorado o UX de `/certificados/[id]` com resumo operacional, grupos de cliente/certificado/renovação, dados técnicos separados, hash de arquivo reduzido na apresentação e feedback acessível em senha PFX, link de download, edição de cliente e exclusão.
- Melhorado o UX do upload individual em `/certificados/novo` com resumo do arquivo selecionado, mostrar/ocultar senha do PFX, labels associados aos campos, erro acessivel, estados disabled durante envio e texto de processamento `Enviando certificado`.
- Melhorado o UX da importacao em massa em `/certificados/importar` com progressbar por lote, mensagem de arquivos ignorados, botao `Limpar selecao`, erros padronizados e campos bloqueados durante processamento, sem alterar o contrato de importacao.

## 2026-07-29

- Melhorado o UX do login interno com indicação de painel, orientação de acesso, mensagens de erro sem detalhe técnico, mostrar/ocultar senha e atributos de acessibilidade nos campos.
- Melhorado o UX do download público com badge de disponibilidade, orientação de uso único, aviso de expiração em 60 segundos, erro acessível e texto claro sobre senha temporária.
- Ajustado feedback do aviso manual de certificado para diferenciar envio direto via euAtendo de aviso enfileirado pela extensão Chrome, com textos sem nomes de variáveis ou segredos.
- Adicionado resumo operacional na `/dashboard`, com leitura de prioridade, sinais de fila/cadência, pausa da automação, falhas, vencimentos e links de ação sem alterar envio, API ou banco.
- Melhorada a apresentação de situação de renovação em certificados: cards de resumo em `/certificados`, coluna operacional de renovação, painel de impacto no detalhe e helper compartilhado para descrição, próxima ação e impacto no planejamento.
- Melhorada a Central de avisos com bloco `Prioridade agora`, filtro rapido de nova tentativa, apresentacao compartilhada de status/acoes e mensagens de erro sanitizadas para falhas operacionais.
- Adicionado diagnostico de qualidade dos telefones em `/whatsapp`, com resumo de clientes prontos para envio, telefones ausentes, formatos invalidos, numeros repetidos e avisos bloqueados, sem disparar verificacao externa automatica.
- Adicionadas travas operacionais do WhatsApp: limite diario, limite por hora, pausa manual, pausa automatica apos falhas recentes, painel em `/whatsapp`, API `PATCH /api/whatsapp/automation` e helper compartilhado para euAtendo/extensao.
- Criada migration `20260729170000_add_whatsapp_operational_safety.sql` com campos de seguranca em `notification_settings`; o dispatcher bloqueia novas reservas quando a automacao esta pausada ou quando os limites sao atingidos.
- Adicionado provider alternativo `whatsapp_extension` para a extensao Chrome `Fasa Certificados WhatsApp`, com rotas `/sistema/api/whatsapp/{validate,messages,status,received}`, Basic Auth server-only, reserva transacional de 1 mensagem por chamada e processamento de acks.
- Criada migration `20260729153000_add_whatsapp_extension_provider.sql`, permitindo `whatsapp_extension` em `notification_events`, `whatsapp_dispatcher_state` e `whatsapp_provider_logs`, com indice proprio de fila e RPC `reserve_whatsapp_extension_notification_event`.
- Atualizados notification engine, Central de avisos, dashboard, pagina WhatsApp e readiness para reconhecer `WHATSAPP_PROVIDER=euatendo|whatsapp_extension`, mantendo euAtendo como padrao.
- Adicionada situacao operacional de renovacao em certificados, com filtro em `/certificados`, edicao no detalhe, API `PATCH /api/certificados/[id]/renovacao`, auditoria e cancelamento de avisos pendentes quando o cliente renovou fora, nao vai renovar ou esta inativo.
- Ajustados dashboard, notification engine e RPCs SQL para considerar apenas certificados em acompanhamento ou renovados pela Fasa no planejamento automatico e nas metricas operacionais.
- Criada migration `20260729120000_add_certificate_renewal_status.sql` e atualizado o schema consolidado com colunas `renovacao_status`, `renovacao_observacao`, `renovacao_atualizado_em` e `renovacao_atualizado_por`.

## 2026-07-27

- Ajustada matriz de permissoes: `financeiro` passa a ter permissao operacional completa em certificados, clientes e central de avisos, mantendo WhatsApp, Configuracoes e rotas `/api/admin/*` exclusivas para `admin`.
- Ajustado upload/renovacao de certificados para salvar cada PFX em `certificados/{cnpj}/{hash_arquivo}.pfx`, mantendo o arquivo antigo no Storage e exibindo no sistema apenas o certificado atual vinculado no banco.

## 2026-07-22

- Adicionado workflow GitHub Actions `.github/workflows/euatendo-dispatch-cron.yml` para chamar o dispatcher euAtendo a cada 5 minutos, mantendo 1 mensagem por execucao.
- Documentada a configuracao do cron externo em `docs/CRON_EXTERNO_EUATENDO_5_MIN.md`.
- Adicionado botao administrativo "Mostrar senha" no detalhe do certificado, com validacao de senha administrativa antes de revelar a senha PFX descriptografada.
- Criada rota `POST /api/certificados/[id]/senha`, restrita a admin, com auditoria e sem gravar senha digitada ou senha PFX em logs.
- Adicionada coluna `configuracoes_sistema.senha_admin_certificado_hash` e script `npm run security:hash-cert-admin-password` para gerar o hash a ser configurado no Supabase.

## 2026-07-16

- Ajustado `POST /api/clientes` para reconstruir apenas os avisos futuros do cliente alterado, evitando que edicoes de telefone aguardem o rebuild global de todos os certificados.
- Ajustado dispatcher euAtendo para modo conservador apos restricao de conta WhatsApp: 1 mensagem por execucao, intervalo minimo absoluto de 180 segundos e janela padrao de 180 a 300 segundos entre envios.
- Mantido cron Vercel Hobby as 10:20, mas envio de varias mensagens no mesmo dia passa a exigir cron externo recorrente ou Vercel Pro para chamar `/api/cron/euatendo-dispatch` sem formar rajada.

## 2026-07-15

- Ajustado cron `euatendo-dispatch` para `20 13 * * *`, equivalente a 10:20 em `America/Sao_Paulo`.
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
