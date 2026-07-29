# Cron externo euAtendo a cada 5 minutos

Este documento explica como manter o envio do WhatsApp em cadencia segura:

```text
1 execucao do cron = 1 mensagem enviada
```

Com o workflow deste projeto, o GitHub Actions chama o dispatcher a cada 5 minutos. O dispatcher continua respeitando a fila, `next_allowed_send_at`, retries e o limite conservador de 1 mensagem por execucao.

## Por que nao usar apenas Vercel Hobby

No plano Hobby, a Vercel aceita Cron Jobs diarios. Por isso o `vercel.json` mantem o cron diario de compatibilidade:

```text
20 13 * * *
```

Para escoar a fila no mesmo dia sem Vercel Pro, este projeto usa um cron externo pelo GitHub Actions.

## Workflow criado

Arquivo:

```text
.github/workflows/euatendo-dispatch-cron.yml
```

Agenda:

```yaml
cron: "2-59/5 * * * *"
```

Isso roda aproximadamente nos minutos:

```text
00:02, 00:07, 00:12, 00:17 ...
```

O deslocamento de 2 minutos evita os horários mais concorridos do GitHub Actions.

## Endpoint chamado

O workflow chama:

```text
POST /api/cron/euatendo-dispatch
```

URL padrao:

```text
https://certificadosfasa.vercel.app/api/cron/euatendo-dispatch
```

## Secret obrigatorio no GitHub

Crie este secret no repositorio GitHub:

```text
CRON_SECRET
```

Ele deve ter o mesmo valor configurado no ambiente da Vercel.

Nao coloque o valor do `CRON_SECRET` em arquivos do projeto.

## Variavel opcional no GitHub

Se quiser trocar a URL base sem editar o workflow, crie esta repository variable:

```text
CERTIFICADOSFASA_BASE_URL
```

Exemplo:

```text
https://certificadosfasa.vercel.app
```

Se essa variavel nao existir, o workflow usa `https://certificadosfasa.vercel.app`.

## Como configurar no GitHub

1. Abra o repositorio no GitHub.
2. Va em `Settings`.
3. Va em `Secrets and variables`.
4. Clique em `Actions`.
5. Em `Repository secrets`, crie `CRON_SECRET`.
6. Opcionalmente, em `Repository variables`, crie `CERTIFICADOSFASA_BASE_URL`.

## Como testar manualmente

Depois que o workflow estiver no GitHub, abra:

```text
Actions > euAtendo dispatcher cron > Run workflow
```

O resultado esperado e HTTP 200 ou 207.

Exemplos de resultado:

- Sem mensagens prontas: o dispatcher retorna que nao havia evento elegivel.
- Com mensagem na fila: envia 1 mensagem.
- Com erro temporario: registra retry ou falha conforme a regra do dispatcher.

## Como fica a cadencia

Com 8 mensagens na fila:

```text
00:02 envia 1
00:07 envia 1
00:12 envia 1
00:17 envia 1
00:22 envia 1
00:27 envia 1
00:32 envia 1
00:37 envia 1
```

Tempo aproximado:

```text
8 mensagens x 5 minutos = 40 minutos
```

## Observacoes importantes

- O GitHub Actions pode atrasar alguns minutos em horarios de alta carga.
- O workflow so roda automaticamente quando estiver no branch padrao do GitHub.
- Se o repositorio estiver sem atividade por muito tempo, o GitHub pode pausar workflows agendados em repositorios publicos.
- O dispatcher nao envia lote. Ele processa 1 evento por execucao.
- O envio automatico depende de `EUATENDO_PROVIDER_ENABLED=true` na Vercel.
