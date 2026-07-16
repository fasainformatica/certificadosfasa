# Fluxo Completo

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Cliente

1. Admin cadastra cliente em `/clientes` ou informa dados durante upload.
2. API grava em `clientes`.
3. CNPJ e unico.
4. `whatsapp_notifications_enabled` controla envio ao cliente.

## Certificado

1. Admin envia `.pfx` e senha em `/certificados/novo`.
2. API `POST /api/certificados/upload` valida formulario e arquivo.
3. `registerCertificateUpload` valida PFX, extrai dados e calcula status.
4. Senha e criptografada com AES-256-GCM.
5. PFX e salvo em Storage privado.
6. RPC `registrar_upload_certificado` cria ou atualiza cliente/certificado.
7. Rebuild de notificacoes recalcula eventos.

## Importacao em massa

1. Admin seleciona pacote de pastas em `/certificados/importar`.
2. API aceita no maximo 80 certificados por envio.
3. Cada pasta precisa conter PFX e arquivo `.txt` de senha.
4. Certificados duplicados por hash sao ignorados quando ja cadastrados.
5. Se `run_notifications` nao for `false`, rebuild e job do dia rodam ao final.

## Link publico

1. Admin gera link no detalhe do certificado.
2. Sistema invalida link ativo anterior do certificado.
3. Sistema gera token publico forte e senha unica.
4. Banco salva apenas `token_hash` e `senha_hash`.
5. Usuario acessa `/download/[token]` e informa a senha.
6. Backend valida hash, cria signed URL de 60 segundos e marca link como usado.

## Avisos

1. Configuracoes definem dias, templates, destinatarios e delays.
2. Rebuild cria eventos futuros em `notification_events`.
3. Job diario cria resumo de vencidos e libera reservas expiradas.
4. Dispatcher euAtendo consome eventos elegiveis.
5. Resultado vira `sent`, `retry` ou `failed`.

## Envio manual

1. Admin abre detalhe do certificado.
2. Botao de aviso manual chama `POST /api/certificados/[id]/aviso`.
3. API valida cliente, telefone, flag do cliente e provider.
4. Provider faz health check e verificacao de numero.
5. Mensagem usa template `client_certificate_expiring`.
6. Tentativa e auditada em `audit_logs` e `whatsapp_provider_logs`.

## Cron

- `certificados-vencimentos`: agenda Vercel `0 14 * * *` em UTC, chama `GET /api/cron/certificados-vencimentos`.
- `euatendo-dispatch`: agenda Vercel diaria `20 13 * * *`, chama `GET /api/cron/euatendo-dispatch` as 10:20 em `America/Sao_Paulo`.
