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
5. Carrega destinatarios ativos com `notify_general = true`.
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

Essa base continua separada de `notification_events` para leitura, visibilidade e estados do painel/Windows. Desde 2026-10-01, novas notificacoes `certificate_updated` e comunicados manuais globais `system_notice` tambem geram eventos na fila do WhatsApp para destinatarios ativos com `notify_certificate_updates = true`. Nao sao enviados para clientes e nao alteram o planejamento de vencimentos. A escrita continua server-side com RBAC; usuarios comuns apenas leem notificacoes visiveis e alteram seu proprio estado de leitura.

## Preferencias por destinatario (2026-10-01)

- `notify_general`: avisos de vencimento e resumo de vencidos; padrao `true`, preservando destinatarios existentes.
- `notify_certificate_updates`: certificados atualizados e comunicados manuais da central interna; padrao `false`.
- As duas opcoes sao independentes. `ativo = false` impede novos avisos de ambas as categorias.
- O servidor inclui o canal ativo em `metadata.whatsapp_provider`. O trigger `queue_internal_notification_whatsapp` grava os eventos junto com a notificacao interna, na mesma transacao.
- Cada novo evento tem `internal_notification_id` e chave `internal_notification:{id}:recipient:{recipient_id}`. O texto persistido nao inclui senha PFX, arquivo, token ou link de download. Desde 2026-10-06, o dispatcher pode acrescentar link e senha temporaria apenas ao texto enviado, conforme a regra descrita abaixo.

### Download em avisos de atualizacao (2026-10-06)

- `snapshot_certificate_delivery` registra se havia mais de um destinatario ativo com `notify_certificate_updates` quando a notificacao foi criada. Um unico destinatario continua recebendo o aviso textual, sem link automatico.
- A metadata inclui o hash da versao do PFX, nunca sua senha. Nao ha replay para avisos anteriores sem essa metadata.
- `prepareCertificateDownloadMessage` e compartilhado por euAtendo e extensao. Emite um link por evento/destinatario imediatamente antes do despacho, reaproveitando a mesma credencial criptografada em retries. Nao muda a cadencia nem o limite de uma mensagem por execucao.
- O corpo enviado informa cliente/titular, CNPJ, novo vencimento, URL, senha temporaria e uso unico. A senha real do PFX so aparece na pagina apos validacao. Respostas de provider para atualizacoes nao sao persistidas como payload bruto.
- Opt-out/inativacao e versao do certificado sao revalidados na emissao e no acesso. Link manual nao invalida automaticos e vice-versa. Comunicados gerais permanecem textuais.
- Aplicacao e limites em [`LINKS_ATUALIZACAO_CERTIFICADO.md`](LINKS_ATUALIZACAO_CERTIFICADO.md).
- Eventos `certificate_updated` e `internal_notice` usam titulo e corpo da notificacao; nao dependem dos templates de vencimento. `dias_restantes = 0` e apenas compatibilidade com a coluna obrigatoria, nunca apresentado como "vence hoje".
- O rebuild nao remove nem recria esses dois novos tipos. Selecionar a opcao nao reproduz notificacoes antigas; `certificate_created` continua apenas no painel/Windows.
- Desmarcar uma categoria cancela seus eventos `pending/retry`. Reservados, em processamento e enviados nao sao alterados. Telefone de eventos ainda na fila acompanha a alteracao do destinatario.
- Ambos os RPCs reaplicam as preferencias na reserva. Comunicados expirados, removidos ou privados nao podem ser enviados; reenvio manual tambem passa pelo guard de preferencias.
- Novos avisos podem ficar na fila com a automacao pausada. O envio continua sujeito a enabled, pausas, janela, limites, intervalo e canal operacional. Nao ha envio direto pelo upload ou formulario.
- Instalacao e teste controlado: [`DESTINATARIOS_TIPOS_DE_AVISO.md`](DESTINATARIOS_TIPOS_DE_AVISO.md).

Endpoints disponiveis na Etapa 2:

- `GET /api/internal-notifications`: lista notificacoes internas com paginacao, filtros de tipo/severidade/estado e `unread_count`.
- `GET /api/internal-notifications/summary`: retorna `total_count`, `active_count`, `unread_count` e a ultima notificacao ativa.
- `POST /api/internal-notifications/[id]/read`: marca a notificacao como lida para o usuario atual.
- `POST /api/internal-notifications/[id]/dismiss`: dispensa a notificacao para o usuario atual sem apagar o registro global.
- `GET /api/internal-notifications/windows/summary`: endpoint read-only para o cliente Windows, protegido por `WINDOWS_NOTIFIER_TOKEN`.
- `GET /api/internal-notifications/windows/[id]/certificate-file`: endpoint do cliente Windows para baixar o PFX de uma notificacao de certificado, protegido por `WINDOWS_NOTIFIER_TOKEN`.

As rotas do painel exigem usuario interno com cargo `admin` ou `financeiro`, validam RBAC antes do uso de service role e reaplicam a visibilidade por usuario/cargo antes de retornar ou alterar qualquer item. As rotas do cliente Windows nao usam sessao do navegador; elas exigem bearer token dedicado, reaplicam a visibilidade por cargo e nao retornam senha PFX, signed URL antecipada ou `storage_path`.

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

- Cliente principal em `tools/windows-notifier-app`, com WPF, tray icon, instalador unico e inicializacao automatica por usuario.
- Fallback legado em `tools/windows-notifier`, com PowerShell e `NotifyIcon`.
- O app consulta o servidor por intervalo configuravel e mostra popup para novas notificacoes.
- `TESTAR_NOTIFICADOR_FASA.bat` faz uma consulta unica para validar token, URL e rota.
- `config.local.json` fica fora do Git e deve conter `baseUrl`, `token` e `intervalSeconds`.
- A primeira notificacao encontrada vira linha de base para evitar avisar historico antigo.
- Em notificacoes de certificado, o botao `Baixar certificado` salva o PFX direto em `Downloads` usando endpoint protegido por `WINDOWS_NOTIFIER_TOKEN`; esse endpoint gera uma signed URL curta no servidor e o app segue o redirecionamento sem abrir navegador.
- O cliente nao altera banco, nao marca notificacao como lida, nao envia WhatsApp e nao recebe `SUPABASE_SERVICE_ROLE_KEY`.
- O endpoint Windows nao retorna `dedupe_key`, `storage_path`, service role ou resposta bruta de provider.

## Audiencias

- `internal`: destinatarios internos em `notification_recipients`.
- `client`: telefone do cliente, sem `recipient_id`.
