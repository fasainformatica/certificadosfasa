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
- `whatsapp_dispatch_paused`
- `whatsapp_dispatch_pause_reason`
- `whatsapp_daily_limit`
- `whatsapp_hourly_limit`
- `whatsapp_auto_pause_enabled`
- `whatsapp_failure_pause_threshold`
- `whatsapp_failure_pause_window_minutes`

Os campos `whatsapp_*` controlam seguranca operacional do dispatcher: pausa manual, limites de volume e pausa automatica apos falhas recentes. Eles bloqueiam novas reservas de envio sem remover eventos ja planejados.

A tela `/configuracoes` apresenta essas regras com resumo operacional em `src/lib/configuracoes/presentation.ts`. Essa camada mostra envio automatico, dias de aviso, janela, cadencia, limites e templates em linguagem humana; nao altera a engine, a idempotencia, o provider nem as regras de envio.

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
8. Cria eventos para cliente quando o provider ativo suporta envio ao cliente (`euatendo` ou `whatsapp_extension`), telefone existe e cliente permite.

Certificados com `renovacao_status` em `renovou_externo`, `nao_renovar` ou `cliente_inativo` nao entram no planejamento automatico nem no resumo diario de vencidos. Ao marcar um certificado fora do acompanhamento, a API cancela eventos `certificate_expiring` ainda nao enviados daquele certificado.

`rebuildClientNotificationSchedule` usa a mesma regra de templates e idempotencia, mas remove e recria apenas eventos futuros reconstruiveis de um `cliente_id`. Ele e usado por `POST /api/clientes` para sincronizar mudancas de telefone/WhatsApp sem bloquear a tela com um rebuild global.

O diagnostico de qualidade dos telefones em `/whatsapp` apenas analisa os dados de `clientes` para indicar telefones ausentes, invalidos, repetidos ou avisos bloqueados. Ele nao altera planejamento, nao verifica numero no provider e nao adiciona eventos na fila.

## Job do dia

`runDueNotificationJob`:

1. Atualiza status.
2. Libera reservas expiradas.
3. Cria resumo diario de vencidos quando ativo.
4. Conta eventos elegiveis para envio.

O provider de novos eventos e definido por `WHATSAPP_PROVIDER`. O valor padrao e `euatendo`; quando `WHATSAPP_PROVIDER=whatsapp_extension`, a extensao Chrome consome os eventos por `/sistema/api/whatsapp/messages`.

## Idempotencia

Eventos usam chave unica por certificado, dia, destinatario e data de envio. Eventos de vencidos usam chave por data e destinatario.

## Retry e status

- Retryable: rate limit, timeout, provider indisponivel ou erro temporario.
- Backoff: 60, 300, 900 e 1800 segundos.
- Falha permanente ou limite de tentativas: `failed`.
- Sucesso: `sent`.

## Apresentacao operacional

`src/lib/notifications/event-presentation.ts` centraliza rotulos humanos, texto do aviso, proxima acao sugerida e sanitizacao de erro para a Central de avisos.

A tela `/notificacoes` mostra o bloco `Prioridade agora` para destacar falhas, novas tentativas, mensagens na fila e processamentos ativos. Esse bloco usa apenas leitura de `notification_events`; ele nao altera status, nao cria eventos e nao dispara mensagens.

Erros tecnicos vindos de provider, SQL ou reserva sao convertidos para mensagens humanas antes de aparecerem na interface. O erro bruto deve permanecer restrito a logs protegidos.

## Audiencias

- `internal`: destinatarios internos em `notification_recipients`.
- `client`: telefone do cliente, sem `recipient_id`.
