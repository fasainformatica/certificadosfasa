# WhatsApp euAtendo e extensao Chrome

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Estado atual

euAtendo e o provider oficial. A extensao Chrome `Fasa Certificados WhatsApp` pode ser usada como provider alternativo, sem remover a API euAtendo, quando `WHATSAPP_PROVIDER=whatsapp_extension`. Desktop Bot/QWEP nao deve ser usado para novas implementacoes.

## Arquivos

- `src/lib/whatsapp/euatendo/client.ts`
- `src/lib/whatsapp/euatendo/provider.ts`
- `src/lib/whatsapp/euatendo/dispatcher.ts`
- `src/lib/whatsapp/euatendo/config.ts`
- `src/lib/whatsapp/euatendo/schemas.ts`
- `src/lib/whatsapp/providers.ts`
- `src/lib/whatsapp/extension/config.ts`
- `src/lib/whatsapp/extension/dispatcher.ts`
- `src/app/api/whatsapp/euatendo/**`
- `src/app/sistema/api/whatsapp/**`
- `src/app/api/cron/euatendo-dispatch/route.ts`
- `vercel.json`

## Variaveis

```env
WHATSAPP_PROVIDER=euatendo

EUATENDO_API_URL=https://apicluster.euatendo.app
EUATENDO_API_TOKEN=
EUATENDO_INSTANCE_ID=
EUATENDO_PROVIDER_ENABLED=false
EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN=1

WHATSAPP_EXTENSION_ENABLED=false
WHATSAPP_EXTENSION_TOKEN=
CRON_SECRET=
```

Valores aceitos:

- `WHATSAPP_PROVIDER=euatendo`: eventos novos usam euAtendo.
- `WHATSAPP_PROVIDER=whatsapp_extension`: eventos novos usam a extensao Chrome.

`WHATSAPP_EXTENSION_TOKEN` e server-only e deve ser o mesmo token configurado nas opcoes da extensao. Nao use token com `:` para evitar ambiguidade no Basic Auth da extensao.

## Endpoints euAtendo usados

- `GET /list-instances`
- `POST /check-instance-status`
- `POST /check-number-whatsapp`
- `POST /send-text-message`

## Endpoints da extensao

A extensao chama o app em:

- `GET /sistema/api/whatsapp/validate`
- `POST /sistema/api/whatsapp/messages`
- `POST /sistema/api/whatsapp/status`
- `POST /sistema/api/whatsapp/received`

Contrato preservado:

- Autenticacao por `Authorization: Basic base64(numero:token:versao)`.
- `messages` recebe `{ status, acks }`, processa acks e retorna uma lista de no maximo 1 mensagem.
- Cada mensagem retornada usa `{ uuid, destino, texto, send_interval_seconds }`.
- `status` apenas processa acks/status e nao entrega nova mensagem.
- `received` retorna `null`; o fluxo de certificados nao responde mensagens recebidas.
- Eventos `manual_test` da extensao podem ser usados para homologacao com telefone direto. Eventos internos reais continuam exigindo `recipient_id` ativo.

A reserva da extensao usa `reserve_whatsapp_extension_notification_event`, `whatsapp_dispatcher_state` e `whatsapp_provider_logs`, sempre com `provider = 'whatsapp_extension'`.

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

O cron chama `dispatchEuAtendoNotificationBatch`. Em modo conservador, o dispatcher processa 1 evento por execucao e respeita `whatsapp_dispatcher_state.next_allowed_send_at`.

Na Vercel Hobby, o cron do dispatcher roda diariamente (`20 13 * * *`, 10:20 em `America/Sao_Paulo`) porque o plano nao aceita cron por minuto. Esse gatilho envia no maximo 1 mensagem. Para escoar fila no mesmo dia com seguranca, use Vercel Pro ou cron externo autenticado com `CRON_SECRET`, chamando a rota a cada 5 minutos durante a janela de envio.

O intervalo minimo absoluto entre mensagens e 180 segundos. O padrao usa janela aleatoria entre 180 e 300 segundos, mesmo que a configuracao salva esteja menor. Falhas definitivas nao disparam o proximo evento na mesma execucao para evitar rajada de rejeicoes.

Na extensao, o servidor tambem entrega no maximo 1 mensagem por chamada de `/messages`. A extensao so busca uma nova mensagem quando a fila local esta vazia e respeita `send_interval_seconds`, com minimo de 180 segundos e maximo de 3600 segundos. Esse duplo controle evita rajadas pelo navegador.

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
