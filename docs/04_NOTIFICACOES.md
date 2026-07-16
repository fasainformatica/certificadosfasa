# Notificacoes

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Componentes

- Engine: `src/lib/notifications/engine.ts`
- Validacao: `src/lib/notifications/validation.ts`
- Busca de eventos: `src/lib/notifications/event-search.ts`
- APIs: `src/app/api/notifications/**`
- Cron diario: `src/app/api/cron/certificados-vencimentos/route.ts`

## Configuracoes

`notification_settings` controla:

- `enabled`
- `expired_notifications_enabled`
- `dias_aviso_vencimento`
- `delay_minimo_segundos`
- `delay_maximo_segundos`
- `max_attempts`
- `polling_interval_seconds`
- `send_window_start`
- `send_window_end`
- `timezone`

## Templates

Tipos atuais:

- `certificate_expiring`
- `certificate_expired`
- `client_certificate_expiring`
- `client_certificate_expired`
- `manual_test`

Variaveis permitidas ficam em `src/lib/notifications/validation.ts`. Templates com segredos, senha, link publico, download ou `storage_path` sao rejeitados.

## Rebuild

`rebuildNotificationSchedule`:

1. Registra `notification_runs`.
2. Carrega settings.
3. Atualiza status dos certificados.
4. Remove eventos futuros reconstruiveis.
5. Carrega destinatarios ativos.
6. Garante templates padrao.
7. Cria eventos internos.
8. Cria eventos para cliente quando provider e `euatendo`, telefone existe e cliente permite.

`rebuildClientNotificationSchedule` usa a mesma regra de templates e idempotencia, mas remove e recria apenas eventos futuros reconstruiveis de um `cliente_id`. Ele e usado por `POST /api/clientes` para sincronizar mudancas de telefone/WhatsApp sem bloquear a tela com um rebuild global.

## Job do dia

`runDueNotificationJob`:

1. Atualiza status.
2. Libera reservas expiradas.
3. Cria resumo diario de vencidos quando ativo.
4. Conta eventos elegiveis para envio.

## Idempotencia

Eventos usam chave unica por certificado, dia, destinatario e data de envio. Eventos de vencidos usam chave por data e destinatario.

## Retry e status

- Retryable: rate limit, timeout, provider indisponivel ou erro temporario.
- Backoff: 60, 300, 900 e 1800 segundos.
- Falha permanente ou limite de tentativas: `failed`.
- Sucesso: `sent`.

## Audiencias

- `internal`: destinatarios internos em `notification_recipients`.
- `client`: telefone do cliente, sem `recipient_id`.
