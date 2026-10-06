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
5. PFX e salvo em Storage privado em `certificados/{cnpj}/{hash_arquivo}.pfx`.
6. RPC `registrar_upload_certificado` cria ou atualiza cliente/certificado.
7. Em renovacao, o registro do certificado passa a apontar para o novo `storage_path`; o arquivo antigo permanece na pasta do CNPJ, mas deixa de aparecer no sistema porque nao fica vinculado ao registro atual.
8. Rebuild de notificacoes recalcula eventos.

## Importacao em massa

1. Admin seleciona pacote de pastas em `/certificados/importar`.
2. API aceita no maximo 80 certificados por envio.
3. Cada pasta precisa conter PFX e arquivo `.txt` de senha.
4. Certificados duplicados por hash sao ignorados quando ja cadastrados.
5. Se `run_notifications` nao for `false`, rebuild e job do dia rodam ao final.

## Link publico

1. Admin gera link no detalhe do certificado.
2. Sistema invalida apenas links manuais anteriores do certificado, sem alterar links individuais enviados por WhatsApp.
3. Sistema gera token publico forte e senha unica.
4. Banco salva `token_hash` e `senha_hash`, origem, validade e hash da versao do certificado. Para links automaticos, guarda tambem as credenciais criptografadas necessarias ao retry de envio.
5. Usuario acessa `/download/[token]` e informa a senha.
6. Backend valida a senha e consome seu acesso, criando uma unica sessao em memoria e mostrando senha do PFX + botao de download.
7. O arquivo e transferido por proxy privado. A confirmacao do navegador bloqueia novas transferencias; a senha continua na pagina aberta. Em caso de falha, retry por ate 2 minutos do primeiro pedido, sem renovar prazo. Recarregar torna o link indisponivel.
8. Novas atualizacoes de certificados geram um link por destinatario no despacho somente se havia dois ou mais destinatarios ativos marcados para atualizacoes ao criar o aviso. Novos cadastros e comunicados gerais nao recebem link. Detalhes: `LINKS_ATUALIZACAO_CERTIFICADO.md`.

## Avisos

1. Configuracoes definem dias, templates, destinatarios e delays.
2. Rebuild cria eventos futuros em `notification_events`.
3. Job diario cria resumo de vencidos e libera reservas expiradas.
4. Dispatcher euAtendo consome eventos elegiveis.
5. Resultado vira `sent`, `retry` ou `failed`.

## Envio manual

1. Admin abre detalhe do certificado.
2. Botao de aviso manual chama `POST /api/certificados/[id]/aviso`.
3. API valida cliente, telefone, flag do cliente, situacao de renovacao e provider ativo.
4. Com `WHATSAPP_PROVIDER=euatendo`, o euAtendo faz health check, verificacao de numero, respeita a cadencia e envia a mensagem diretamente.
5. Com `WHATSAPP_PROVIDER=whatsapp_extension`, a API adiciona 1 evento `pending` na fila da extensao; o Chrome envia quando o WhatsApp Web conectado buscar a proxima mensagem.
6. Mensagem usa template `client_certificate_expiring`.
7. Tentativa e auditada em `audit_logs` e `whatsapp_provider_logs`.

## Cron

- `certificados-vencimentos`: agenda Vercel `0 14 * * *` em UTC, chama `GET /api/cron/certificados-vencimentos`.
- `euatendo-dispatch`: agenda Vercel diaria `20 13 * * *`, chama `GET /api/cron/euatendo-dispatch` as 10:20 em `America/Sao_Paulo` e envia no maximo 1 mensagem por execucao.
