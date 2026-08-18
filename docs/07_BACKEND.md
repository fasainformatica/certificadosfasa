# Backend

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## APIs de certificados

- `GET /api/certificados`
- `POST /api/certificados/upload`
- `POST /api/certificados/importar`
- `GET /api/certificados/[id]`
- `DELETE /api/certificados/[id]`
- `POST /api/certificados/[id]/link`
- `PATCH /api/certificados/[id]/link`
- `POST /api/certificados/[id]/aviso`

## APIs de clientes

- `GET /api/clientes`
- `POST /api/clientes`

## APIs de notificacao

- `GET/PUT /api/notifications/settings`
- `GET /api/notifications/templates`
- `PUT /api/notifications/templates/[id]`
- `GET/POST /api/notifications/recipients`
- `PATCH/DELETE /api/notifications/recipients/[id]`
- `GET /api/notifications/events`
- `POST /api/notifications/events/[id]/retry`
- `PUT /api/notifications/configuration-bundle`
- `POST /api/notifications/check-expiring`
- `GET /api/internal-notifications`
- `GET /api/internal-notifications/summary`
- `GET /api/internal-notifications/windows/summary`
- `GET /api/internal-notifications/windows/[id]/certificate-file`
- `POST /api/internal-notifications/[id]/read`
- `POST /api/internal-notifications/[id]/dismiss`

## APIs euAtendo

- `GET /api/whatsapp/euatendo/health`
- `POST /api/whatsapp/euatendo/check-number`
- `POST /api/whatsapp/euatendo/test-message`

## APIs administrativas

- `GET /api/admin/health/production`: healthcheck protegido por admin para env, schema, bucket, admin ativo, tabelas euAtendo e configuracao do provider.

## APIs publicas e cron

- `POST /api/download/[token]/validar`
- `GET/POST /api/cron/certificados-vencimentos`
- `GET/POST /api/cron/euatendo-dispatch`

## Autorizacao

Rotas administrativas usam `requireApiUser(["admin"])` quando a acao exige admin. Rotas cron exigem `CRON_SECRET`. Download publico nao exige login, mas exige token e senha validos. Os endpoints do cliente Windows exigem `WINDOWS_NOTIFIER_TOKEN`; o resumo nao altera dados e o download de PFX so retorna arquivo para notificacao de certificado visivel ao cargo configurado.

`npm test` executa `scripts/check-service-role-rbac.mjs`, que falha quando uma nova API route usa `createSupabaseAdminClient` sem validacao de autenticacao/autorizacao antes da operacao.

## Jobs

- `rebuildNotificationSchedule`
- `runDueNotificationJob`
- `dispatchNextEuAtendoNotification`
- `dispatchEuAtendoNotificationBatch`

## Erros

APIs devem responder com `jsonError` quando possivel. Mensagens nao devem vazar segredos, caminho interno de Storage, token, headers ou senha.
