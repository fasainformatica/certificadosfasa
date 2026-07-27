# Banco de Dados

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Localizacao

- Schema oficial: [`../database/schema/supabase_schema.sql`](../database/schema/supabase_schema.sql)
- Migrations: [`../database/migrations/`](../database/migrations/)
- Scripts manuais: [`../database/scripts/`](../database/scripts/)
- Archive SQL: [`../database/archive/`](../database/archive/)

## Tabelas de dominio

- `user_profiles`: role e ativacao do usuario.
- `clientes`: CNPJ, razao social, contatos e preferencia de WhatsApp.
- `certificados`: metadados do PFX, validade, senha criptografada e Storage.
- `links_download`: link publico, hash de token, hash de senha e uso unico.
- `audit_logs`: eventos de auditoria.
- `storage_reconciliation_jobs`: reconciliacao entre banco e Storage.
- `configuracoes_sistema`: configuracoes gerais.

## Tabelas de notificacao

- `notification_settings`: configuracao global.
- `notification_templates`: templates ativos.
- `notification_recipients`: destinatarios internos.
- `notification_events`: outbox idempotente.
- `notification_runs`: execucoes de rebuild/job.

## Tabelas WhatsApp

- `whatsapp_dispatcher_state`: lock e proximo envio permitido do provider.
- `whatsapp_provider_logs`: logs sanitizados do provider.

## Funcoes principais

- `registrar_upload_certificado`: cria/atualiza cliente e certificado.
- `excluir_certificado_com_cliente`: remove certificado e sincroniza cliente quando cabivel.
- `refresh_certificado_statuses`: recalcula status por data.
- `release_expired_notification_reservations`: libera reservas expiradas.
- `get_dashboard_metrics`: metricas agregadas.
- `reserve_euatendo_notification_event`: reserva um evento elegivel para envio.

## Regras importantes

- Bucket `certificados-pfx` deve ser privado.
- Cada PFX atual usa `storage_path` versionado por hash em `certificados/{cnpj}/{hash_arquivo}.pfx`.
- Em renovacoes, arquivos PFX antigos podem permanecer na pasta do CNPJ no Storage, mas nao aparecem no sistema porque o registro `certificados.storage_path` aponta apenas para a versao atual.
- Token publico nunca e salvo em claro.
- Senha real do PFX nunca e salva em claro.
- `notification_events.idempotency_key` evita duplicidade.
- `provider` operacional novo deve ser `euatendo`.
- Historico legado pode existir, mas novos eventos `whatsapp_desktop` sao bloqueados pela migration final.

## Aplicacao

Banco novo:

```sql
-- Executar database/schema/supabase_schema.sql no SQL Editor do Supabase.
```

Banco existente:

```text
Aplicar os arquivos de database/migrations/ em ordem cronologica.
```
