# WhatsApp euAtendo

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Estado atual

euAtendo e o provider oficial. Desktop Bot/QWEP nao deve ser usado para novas implementacoes.

## Arquivos

- `src/lib/whatsapp/euatendo/client.ts`
- `src/lib/whatsapp/euatendo/provider.ts`
- `src/lib/whatsapp/euatendo/dispatcher.ts`
- `src/lib/whatsapp/euatendo/config.ts`
- `src/lib/whatsapp/euatendo/schemas.ts`
- `src/app/api/whatsapp/euatendo/**`
- `src/app/api/cron/euatendo-dispatch/route.ts`
- `vercel.json`

## Variaveis

```env
EUATENDO_API_URL=https://apicluster.euatendo.app
EUATENDO_API_TOKEN=
EUATENDO_INSTANCE_ID=
EUATENDO_PROVIDER_ENABLED=false
EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN=50
CRON_SECRET=
```

## Endpoints euAtendo usados

- `GET /list-instances`
- `POST /check-instance-status`
- `POST /check-number-whatsapp`
- `POST /send-text-message`

## Homologacao

1. Configurar URL, token e instancia.
2. Manter `EUATENDO_PROVIDER_ENABLED=false` se o disparo automatico ainda nao deve rodar.
3. Acessar `/whatsapp`.
4. Testar conexao.
5. Verificar numero.
6. Enviar mensagem de teste.
7. Validar logs.
8. Ativar `EUATENDO_PROVIDER_ENABLED=true`.
9. Confirmar cron `euatendo-dispatch` nos logs da Vercel.

## Dispatcher

O cron chama `dispatchEuAtendoNotificationBatch`. O padrao processa ate 50 eventos por execucao, configuravel por `EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN` e limitado internamente a 100.

Na Vercel Hobby, o cron do dispatcher roda diariamente (`20 13 * * *`, 10:20 em `America/Sao_Paulo`) porque o plano nao aceita cron por minuto. O lote foi ampliado para drenar a fila no mesmo disparo diario quando o volume couber no limite configurado. Para envio frequente ou filas maiores, use Vercel Pro ou cron externo autenticado com `CRON_SECRET`.

A primeira reserva respeita `whatsapp_dispatcher_state.next_allowed_send_at`. Reservas seguintes da mesma execucao podem ignorar essa janela para drenar backlog controladamente. Falhas definitivas de uma mensagem nao bloqueiam os eventos seguintes; se houver `waiting`, `locked`, `disabled`, erro sistemico ou retry temporario, o lote para.

## Logs

`whatsapp_provider_logs` guarda:

- provider
- event_id quando existir
- audience
- operation
- telefone mascarado
- status
- attempt_count
- error_code
- error_message limitado
- request_id
- response_id
- metadata sanitizado

Tokens, headers sensiveis e telefones completos nao devem aparecer em logs.

## Envio manual

`POST /api/certificados/[id]/aviso` envia aviso direto ao cliente com validacao de health, numero e template. Essa rota exige admin e respeita rate limit.
