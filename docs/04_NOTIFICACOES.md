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

Certificados com `renovacao_status` em `renovou_externo`, `nao_renovar`, `sem_retorno` ou `cliente_inativo` nao entram no planejamento automatico nem no resumo diario de vencidos. Ao marcar um certificado fora do acompanhamento, a API cancela eventos `certificate_expiring` ainda nao enviados daquele certificado.

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

## Notificacoes internas do painel

`internal_notifications` e `internal_notification_reads` sao a base da central interna do painel, dos pop-ups do navegador e do cliente leve do Windows para alertar operadores sobre eventos do sistema, como atualizacao de certificado.

Essa base e separada de `notification_events`: ela nao entra na fila de WhatsApp, nao envia mensagens para clientes, nao reserva dispatcher e nao altera o planejamento automatico. A escrita deve ser feita por API server-side com RBAC; clientes autenticados comuns recebem apenas leitura das notificacoes visiveis para seu usuario/cargo e podem marcar seu proprio estado como lido ou dispensado.

Endpoints disponiveis na Etapa 2:

- `GET /api/internal-notifications`: lista notificacoes internas com paginacao, filtros de tipo/severidade/estado e `unread_count`.
- `GET /api/internal-notifications/summary`: retorna `total_count`, `active_count`, `unread_count` e a ultima notificacao ativa.
- `POST /api/internal-notifications/[id]/read`: marca a notificacao como lida para o usuario atual.
- `POST /api/internal-notifications/[id]/dismiss`: dispensa a notificacao para o usuario atual sem apagar o registro global.
- `GET /api/internal-notifications/windows/summary`: endpoint read-only para o cliente Windows, protegido por `WINDOWS_NOTIFIER_TOKEN`.

Essas rotas exigem usuario interno com cargo `admin` ou `financeiro`, validam RBAC antes do uso de service role e reaplicam a visibilidade por usuario/cargo antes de retornar ou alterar qualquer item.

Geracao automatica na Etapa 3:

- `registerCertificateUpload` cria `certificate_created` quando o PFX gera um novo certificado no sistema.
- `registerCertificateUpload` cria `certificate_updated` quando o PFX substitui o certificado atual do cliente.
- A importacao em massa usa a mesma funcao, entao segue a mesma regra.
- A falha ao criar a notificacao interna nao cancela o upload/importacao ja concluido.
- O payload da notificacao interna nao inclui senha PFX, link publico, token, service role, `storage_path` ou resposta bruta de provider.

Interface disponivel na Etapa 4:

- `InternalNotificationsMenu` fica no header interno e consulta o resumo a cada 60 segundos quando a aba esta visivel.
- Ao abrir o popover, ele lista ate 6 notificacoes ativas, mostra estado vazio, loading local e mensagens de erro seguras.
- Acoes disponiveis: `Ver certificado`, `Marcar lida` e `Dispensar`.
- A dispensa altera apenas o estado do usuario atual em `internal_notification_reads`; nao apaga a notificacao global.
- A interface do painel nao precisa estar aberta para o cliente Windows, mas o servidor precisa estar acessivel e o script precisa estar em execucao na bandeja.

Central completa disponivel na Etapa 5:

- `/notificacoes-internas` e acessada pelo link `Ver central completa` no sininho, sem entrar na sidebar para nao confundir com `/notificacoes`, que continua sendo a Central de avisos do WhatsApp.
- A pagina autentica com `requireInternalUser`, consulta com service role apenas depois da validacao e reaplica a visibilidade por usuario/cargo usando os mesmos filtros da API.
- A tela mostra KPIs de notificacoes ativas, nao lidas, com atencao e dispensadas.
- Filtros disponiveis: estado, tipo, prioridade e busca por titulo/conteudo.
- A visualizacao usa tabela no desktop, cards no mobile, estado vazio especifico e paginacao acessivel.
- Acoes por item: `Ver certificado`, `Marcar lida` e `Dispensar`.
- A apresentacao nao exibe `dedupe_key`, `storage_path`, service role, resposta bruta de provider ou outros detalhes tecnicos sensiveis.

Pop-ups do navegador disponiveis na Etapa 6:

- O sininho exibe a acao `Ativar pop-ups`. A permissao do navegador so e solicitada depois do clique do usuario.
- Quando ativado e permitido pelo navegador, o painel consulta o resumo tambem quando a aba nao esta visivel para identificar nova `latest_notification`.
- A primeira notificacao encontrada vira apenas linha de base para evitar avisar historico antigo.
- Uma nova notificacao gera popup nativo apenas se o painel nao estiver em foco; se o usuario ja estiver olhando para o painel, apenas o contador/lista sao atualizados.
- O clique no popup abre o certificado quando existe `href`; caso contrario, abre `/notificacoes-internas`.
- O estado fica em `localStorage` do navegador. Isso nao cria processo em segundo plano e nao funciona com o navegador fechado.

Cliente Windows disponivel na Etapa 7:

- Arquivos em `tools/windows-notifier`.
- `FasaInternalNotifier.ps1` roda em PowerShell com `NotifyIcon`, consulta o servidor por intervalo configuravel e mostra popup para novas notificacoes.
- `INICIAR_NOTIFICADOR_FASA.bat` inicia o cliente em janela oculta.
- `TESTAR_NOTIFICADOR_FASA.bat` faz uma consulta unica para validar token, URL e rota.
- `config.local.json` fica fora do Git e deve conter `baseUrl`, `token` e `intervalSeconds`.
- A primeira notificacao encontrada vira linha de base para evitar avisar historico antigo.
- O cliente nao altera banco, nao marca notificacao como lida, nao envia WhatsApp e nao recebe `SUPABASE_SERVICE_ROLE_KEY`.
- O endpoint Windows nao retorna `dedupe_key`, `storage_path`, service role ou resposta bruta de provider.

## Audiencias

- `internal`: destinatarios internos em `notification_recipients`.
- `client`: telefone do cliente, sem `recipient_id`.
