# Fasa Certificados PFX

Sistema interno para gestao segura de certificados digitais PFX da Fasa Informatica, com painel administrativo, link publico de uso unico e bot desktop para avisos internos de vencimento via WhatsApp Web.

## Stack

- Next.js App Router com TypeScript strict
- Tailwind CSS
- Recharts para graficos operacionais do painel
- Supabase Auth, Postgres e Storage
- `node-forge` para parsing PKCS#12 em runtime Node.js
- AES-256-GCM nativo do Node para senha real do PFX
- Senha de link publico com hash `scrypt`
- Token publico de download armazenado somente como `token_hash`
- QWEP: Bearer token, HMAC SHA-256, nonce, timestamp e body hash para o Desktop Bot
- Electron Desktop Bot para WhatsApp Web
- Bucket Supabase Storage privado

## Variaveis de ambiente

Crie `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CERT_ENCRYPTION_KEY=
CRON_SECRET=
```

Para gerar `CERT_ENCRYPTION_KEY` no PowerShell:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

`CRON_SECRET` e uma senha aleatoria forte usada no header `Authorization: Bearer ...` da rota `/api/cron/certificados-vencimentos`.

## Instalar e executar

```powershell
cd C:\Users\User\fasa-certificados
npm.cmd install
npm.cmd run dev
```

Abra `http://localhost:3000`.

## Como executar o schema no Supabase

1. Acesse `https://supabase.com/dashboard`.
2. Abra o projeto Supabase.
3. No menu lateral, clique em `SQL Editor`.
4. Clique em `New query`.
5. Abra o arquivo `supabase_schema.sql`.
6. Copie todo o conteudo.
7. Cole no SQL Editor.
8. Clique em `Run`.

O SQL cria/atualiza tabelas, enums, indices, triggers, RLS, policies, grants de colunas, configuracao singleton, tabelas do bot WhatsApp, reconciliacao Storage/Postgres e bucket privado `certificados-pfx`.

Tambem existem migrations versionadas em `supabase/migrations/`. Para bancos existentes, aplique a migration mais recente `20260710120000_performance_optimizations.sql` ou cole novamente o `supabase_schema.sql` completo.

## Storage

O schema tenta criar o bucket privado `certificados-pfx`. Se o bucket nao aparecer:

1. No menu lateral do Supabase, clique em `Storage`.
2. Clique em `New bucket`.
3. Nome: `certificados-pfx`.
4. Marque como privado.
5. Defina limite de arquivo de 10 MB se a interface permitir.

O frontend nunca acessa arquivos PFX diretamente. Upload, exclusao e download passam pelo backend. Operacoes criticas de Storage registram jobs em `storage_reconciliation_jobs`, permitindo auditoria de arquivos orfaos, registros sem arquivo e falhas pendentes.

## Padrao visual

O sistema usa uma interface administrativa limpa, responsiva e baseada em azul:

- Azul principal `#2563EB`, fundo `#F8FAFC`, cards brancos e bordas `#E2E8F0`.
- Status usam verde para valido/enviado, amarelo para atencao e vermelho para vencido/falha.
- Cards, tabelas, filtros, formularios e estados vazios seguem componentes reutilizaveis em `src/components/ui`.
- A linguagem da interface evita termos tecnicos. A tela `Avisos` exibe status como `Aguardando envio`, `Tentando novamente`, `Aviso enviado` e `Falha no envio`.
- O dashboard usa graficos responsivos para distribuicao por status e vencimentos por periodo.
- O bot continua recebendo somente telefone interno e mensagem pronta; segredos e chaves permanecem fora do frontend.

## Primeiro administrador

Crie o usuario em `Authentication > Users > Add user`. Depois promova:

```sql
insert into public.user_profiles (id, role, active)
values ('COLE_O_USER_UID_AQUI', 'admin', true)
on conflict (id) do update
set role = 'admin', active = true;
```

## Fluxos principais

Upload:

1. Entre como admin.
2. Abra `Certificados`.
3. Clique em `Novo upload`.
4. Preencha os dados do cliente na mesma tela: razao social, WhatsApp, responsavel, e-mail opcional, telefone e observacoes.
5. Envie o `.pfx` e informe a senha real.
6. O backend valida o PFX, extrai CNPJ/titular/datas, cria ou atualiza o cliente pelo CNPJ, salva o arquivo no bucket privado e grava a senha criptografada.
7. Apos registrar o certificado, o backend executa o Notification Rebuild Service e planeja os avisos futuros conforme os dias configurados, destinatarios internos ativos e `send_date`.

Carga em massa de certificados antigos:

1. Entre como admin.
2. Abra `Certificados`.
3. Clique em `Carga em massa`.
4. Selecione a pasta principal que contem as pastas dos clientes.
5. Estrutura esperada: `certificados/Cliente ABC/certificado.pfx` e `certificados/Cliente ABC/123456.txt`.
6. O arquivo `.txt` deve ficar na mesma pasta do `.pfx`. A senha sera lida pelo nome do arquivo `.txt`, sem a extensao. Exemplos aceitos: `123456.txt`, `senha-123456.txt`, `senha 123456.txt`.
7. Subpastas dentro da pasta do cliente sao ignoradas; somente o `.pfx` e o `.txt` da camada do cliente sao processados.
8. Nesta carga historica, WhatsApp/telefone do cliente nao e obrigatorio. O nome do cliente e preenchido pelo nome do arquivo do certificado quando nao houver cadastro previo.
9. Cada PFX e validado no backend, a senha e criptografada, o arquivo vai para o bucket privado e certificados duplicados por hash sao ignorados com relatorio.
10. Ao final, o backend executa um unico rebuild de notificacoes e mostra quantos certificados foram importados, ignorados ou falharam.

Cliente:

1. O cadastro do cliente acontece no fluxo `Certificados > Novo upload`.
2. A tela `Clientes` e apenas uma consulta/listagem dos clientes vinculados a certificados.
3. Para editar o cliente, abra o detalhe do certificado vinculado e use o bloco `Cliente vinculado`.
4. O WhatsApp e normalizado para `55 + DDD + numero`, por exemplo `(11) 99999-9999` vira `5511999999999`.

Link publico:

1. Abra o detalhe de um certificado como admin.
2. Clique em `Criar link de download`.
3. O sistema gera token publico forte e senha aleatoria forte.
4. O token puro aparece apenas na URL retornada no momento da criacao; o banco salva somente `token_hash`.
5. A senha aparece uma unica vez.
6. `Atualizar senha do link` invalida a senha anterior e exibe uma nova senha uma unica vez.
7. Apos um download bem-sucedido, o link fica usado/invalido.

Links criados antes da migracao para `token_hash` sao invalidados por seguranca e devem ser recriados.

Exclusao:

1. Abra o detalhe do certificado.
2. Clique em `Excluir certificado`.
3. O backend tenta remover o arquivo do Storage.
4. Em seguida, uma funcao transacional remove certificado, links vinculados e cliente sem outros certificados.

## Bot WhatsApp

Configuracao no painel:

1. Abra `Configuracoes`.
2. Ative ou desative o envio automatico.
3. Defina dias de aviso, por exemplo `30,15,1`.
4. Defina delay minimo/maximo. O minimo nunca pode ser menor que `30` segundos; o padrao e `30` a `60` segundos.
5. Defina maximo de tentativas, polling entre `5` e `25` segundos, heartbeat e janela de envio.
6. Cadastre ate 5 destinatarios internos em `Destinatarios de Avisos`.
7. Edite o template `certificado a vencer` usando variaveis permitidas:
   `{cliente_nome}`, `{cliente_telefone}`, `{cnpj}`, `{certificado_nome}`, `{data_vencimento}`, `{dias}`.
8. Edite o template `certificados vencidos` usando variaveis permitidas:
   `{data_hoje}`, `{total_vencidos}`, `{lista_certificados_vencidos}`, `{cliente_telefone}`.
9. Use `Avisos de vencidos` para ativar/desativar o resumo diario consolidado de certificados vencidos.

Destinatarios:

- O bot envia somente para os destinatarios internos ativos cadastrados em `Configuracoes`.
- O bot nao envia aviso automatico para o WhatsApp do cliente.
- O WhatsApp do cliente aparece apenas no corpo da mensagem para orientar a equipe interna no contato.
- Cada telefone e normalizado para `55 + DDD + numero`, por exemplo `(11) 99999-9999` vira `5511999999999`.
- Financeiro pode visualizar os destinatarios; somente admin pode cadastrar, editar, desativar ou remover.

Dispositivo:

1. Abra `WhatsApp Bot`.
2. Clique em `Criar dispositivo`.
3. Copie `token` e `signing secret` no momento da criacao. Eles nao aparecem novamente.
4. Marque o dispositivo como principal se necessario.
5. Instale/execute o bot em `desktop-bot`.

Rodar o bot:

```powershell
cd C:\Users\User\fasa-certificados\desktop-bot
npm.cmd install
npm.cmd run start
```

No bot:

1. Informe a URL do sistema.
2. Cole token e signing secret.
3. Clique em `Testar conexao`.
4. Abra o WhatsApp Web e escaneie o QR Code.
5. Clique em `Iniciar`.

O bot nunca recebe service role key, anon key do Supabase, senha real do certificado, senha de link, storage path ou dados criptograficos internos.

## Cron diario

Configure uma chamada diaria para:

```http
POST /api/cron/certificados-vencimentos
Authorization: Bearer SEU_CRON_SECRET
```

Na Vercel, use um Cron Job diario chamando essa rota. Fora da Vercel, use o agendador do provedor ou `pg_cron`/`pg_net` chamando o backend.

Fluxo de certificados a vencer (`certificate_expiring`):

1. Le `notification_settings`.
2. Le destinatarios internos ativos.
3. Le certificados vigentes (`ativo` ou `vencendo`).
4. Remove eventos futuros ainda nao enviados.
5. Calcula `send_date = data_vencimento - dias_configurado`.
6. Cria um evento `pending` para cada certificado, dia configurado e destinatario ativo quando `send_date` for hoje ou futura.
7. Salva a mensagem ja renderizada no evento.
8. Usa idempotencia por `certificado:{certificado_id}:dias:{dias}:recipient:{recipient_id}:send:{send_date}`.

Esse fluxo e recalculado pelo Notification Rebuild Service quando ocorre:

- cadastro/renovacao de certificado;
- exclusao de certificado;
- edicao de cliente vinculado;
- alteracao dos dias de aviso;
- alteracao dos destinatarios;
- alteracao do template;
- ativacao/desativacao das notificacoes.

Fluxo de certificados vencidos (`certificate_expired`):

- O rebuild nao cria eventos de vencidos.
- O cron diario busca certificados com data de vencimento hoje ou anterior e status vigente (`ativo`, `vencendo` ou `vencido`).
- Se existir pelo menos um certificado vencido, o backend renderiza uma unica lista consolidada.
- O cron cria no maximo 1 evento por destinatario interno ativo por dia.
- A idempotencia e `expired:date:{yyyy-mm-dd}:recipient:{recipient_id}`.
- Cada item de `{lista_certificados_vencidos}` inclui nome do cliente, CNPJ, WhatsApp/telefone do cliente, data de vencimento e dias vencidos.
- O evento consolidado usa `certificado_id = null` e `cliente_id = null`; a lista fica somente na mensagem renderizada e em payload sanitizado.
- Quando o certificado e renovado ou substituido, ele deixa de aparecer no proximo resumo diario.

Cron diario:

- O cron cria os eventos consolidados de vencidos quando aplicavel.
- Ele tambem libera/conta eventos ja planejados com `status = pending` ou `retry` e `send_date <= hoje`.
- A API do bot reserva atomicamente esses eventos com `FOR UPDATE SKIP LOCKED`.
- A reserva usa TTL calculado por `delay_maximo_segundos + 45 segundos de timeout WhatsApp + 120 segundos de margem`; o ACK `processing` renova essa reserva.
- O bot recebe apenas telefone de destino e mensagem pronta.
- O bot nao calcula vencimento, nao monta template e nao acessa dados do certificado.

## Checklist de seguranca

- Senha real do PFX nunca aparece em resposta de API.
- Senha real do PFX e criptografada com AES-256-GCM e IV unico.
- `CERT_ENCRYPTION_KEY` tem 32 bytes em base64 e nao deve mudar apos dados criptografados.
- `SUPABASE_SERVICE_ROLE_KEY` existe somente no backend.
- Frontend nunca recebe service role key.
- Frontend nunca recebe senha real do PFX, senha de link, hash de senha ou `storage_path`.
- Bucket `certificados-pfx` e privado.
- Download publico usa token longo salvo apenas como hash, senha aleatoria com hash e uso unico.
- Rate limit bloqueia tentativas invalidas no download publico.
- Bot comunica apenas com APIs backend.
- QWEP usa Bearer token, HMAC, nonce, timestamp e body hash.
- Nonces usados sao persistidos em `qwep_seen_nonces`.
- Rate limit do bot usa `qwep_rate_limit_buckets`.
- Logs nao registram tokens, signing secrets, senhas ou chaves.
- Telefones em telas operacionais/logs sao mascarados quando possivel.
- RLS esta ativo nas tabelas sensiveis.
- Listagens principais usam paginacao server-side para evitar carregar milhares de registros no frontend.
- Status dos certificados e recalculado pelo backend para evitar `ativo/vencendo/vencido` obsoleto.

## Guia de teste manual

Autenticacao/RBAC:

- Acessar `/dashboard` sem login redireciona para `/login`.
- Financeiro acessa dashboard/listagens/notificacoes.
- Financeiro nao acessa upload, link, exclusao nem WhatsApp Bot.
- Financeiro acessa `Configuracoes` em modo leitura para visualizar parametros e destinatarios internos.
- Admin acessa todos os fluxos internos.

Upload:

- Upload sem arquivo retorna erro.
- Arquivo nao PFX retorna `Senha incorreta ou certificado invalido.`
- Senha incorreta retorna a mesma mensagem generica.
- PFX valido extrai CNPJ, titular e vencimento.
- PFX vencido cadastra com status `vencido`.
- Reenvio do mesmo arquivo retorna duplicidade.
- Upload com cliente novo cria o cliente e vincula ao certificado.
- Upload para CNPJ ja existente atualiza os dados do cliente e substitui o certificado anterior.
- Edicao do cliente acontece no detalhe do certificado, nao na tela `Clientes`.
- Com notificacoes ativas e dias `30,15,1`, upload de certificado com vencimento futuro executa rebuild e cria eventos planejados por `send_date`.
- Se o certificado vence em 31/12/2026, os eventos sao planejados para 01/12/2026, 16/12/2026 e 30/12/2026 por destinatario ativo.
- Upload de certificado faltando 25 dias nao cria aviso de 30 dias atrasado; cria apenas os proximos limiares futuros.
- Repetir o rebuild nao duplica evento do mesmo certificado/dia/destinatario/data.

Notificacoes:

- Ativar envio automatico em `Configuracoes`.
- Cadastrar ate 5 destinatarios internos em `Destinatarios de Avisos`.
- Tentar cadastrar o sexto destinatario retorna erro.
- Cadastrar destinatario com telefone duplicado retorna erro.
- Desativar destinatario remove seus avisos futuros no rebuild.
- Salvar dias `30,15,1` remove duplicados e ordena no backend.
- Template com variavel desconhecida retorna erro.
- Template com `senha`, `download`, `link publico` ou `storage_path` retorna erro.
- `Reconstruir avisos` remove eventos futuros nao enviados e recria eventos por `send_date`.
- Executar duas vezes nao duplica eventos do mesmo certificado/dia/destinatario/data.
- Evento falho pode ser reenfileirado por admin.
- O cron diario cria 1 aviso consolidado de vencidos por destinatario ativo quando houver certificados vencidos.
- Executar o cron duas vezes no mesmo dia nao duplica aviso de vencidos para o mesmo destinatario.
- Se houver 2 certificados vencidos, a mensagem de `certificate_expired` lista os 2 no mesmo texto.
- Ao renovar/substituir um certificado vencido, ele nao aparece no proximo resumo diario.
- A tela `Notificacoes` filtra por `certificate_expiring` e `certificate_expired`.

Bot:

- Criar dispositivo mostra token e signing secret uma unica vez.
- Bot autentica em `/api/whatsapp-bot/auth/validate`.
- Heartbeat atualiza `last_seen_at`.
- Bot principal reserva mensagens pendentes.
- Bot reserva somente eventos `pending`/`retry` com `send_date <= hoje`, destinatario ativo e regra valida para o tipo do evento.
- Bot envia sempre uma mensagem por vez.
- Bot respeita delay minimo de `30` segundos entre mensagens.
- Bot respeita janela de envio.
- ACK `processing` muda status para `processing`.
- ACK `sent` muda status para `sent`.
- ACK `failed` com retry habilitado muda status para `retry`.
- Dispositivo revogado nao autentica nem reserva mensagens.
- Com delay maximo de 60 segundos, validar que uma mensagem lenta nao e reservada novamente antes do ACK final.

Storage e reconciliacao:

- Executar `POST /api/admin/storage/reconcile` como admin.
- Conferir `arquivos_orfaos`, `registros_sem_arquivo` e `operacoes_pendentes_ou_falhas`.
- Simular falha de upload/exclusao em homologacao e confirmar que `storage_reconciliation_jobs` registra a falha sem expor senha ou conteudo do PFX.

Cron:

- Chamada sem `CRON_SECRET` retorna 401.
- Chamada com `Authorization: Bearer CRON_SECRET` executa o scanner.

Validacao local:

```powershell
npm.cmd run lint
npm.cmd run build
cd desktop-bot
npm.cmd run lint
```

Analise de bundle:

```powershell
npm.cmd run analyze
```

Esse comando ativa `@next/bundle-analyzer` apenas nessa execucao. O build normal (`npm.cmd run build`) nao abre o analyzer.

## Otimizacoes de performance aplicadas

- O middleware so chama Supabase Auth para `/dashboard`, `/certificados`, `/clientes`, `/notificacoes`, `/whatsapp`, `/configuracoes` e `/login`.
- Rotas do bot (`/api/whatsapp-bot/*`), cron (`/api/cron/*`) e download publico (`/download/*`, `/api/download/*`) nao pagam custo de `getUser()` no middleware.
- A dashboard usa a RPC `get_dashboard_metrics()` para carregar contagens, graficos, status do bot e itens de atencao em uma chamada principal.
- O endpoint `/api/whatsapp-bot/messages/stats` usa a RPC `get_whatsapp_bot_message_stats()` e cache curto em memoria.
- A reserva de mensagens passa o TTL calculado pelo backend para `reserve_pending_notification_events`.
- O QWEP nao executa limpeza de nonces/rate limits expirados em toda requisicao; essa limpeza fica em `cleanup_qwep_operational_tables()`, chamada pelo cron.
- O formulario de configuracoes salva settings e templates via `PUT /api/notifications/configuration-bundle`, disparando apenas um rebuild.
- O rebuild de avisos futuros insere eventos em lotes e so cai para insercao individual quando houver conflito de idempotencia.
- Buscas principais receberam indices `pg_trgm` e busca por CNPJ completo usa igualdade.
- Listagens de certificados calculam status por data na leitura, sem `update` em massa durante navegacao.
- Logout interno usa rota backend (`POST /api/auth/logout`) e nao carrega Supabase browser client no AppShell.
- Framer Motion foi removido do layout global; transicoes simples usam CSS.
- Graficos da dashboard sao carregados por componente client isolado/lazy.

PFX reais:

- Siga o roteiro `VALIDACAO_PFX_REAIS.md`.
- Nao adicione certificados reais, senhas ou prints com dados sensiveis ao repositorio.

## Limitacoes conhecidas

- Supabase Postgres e Storage nao compartilham uma transacao distribuida. O sistema registra jobs de reconciliacao e usa backup/restauracao best-effort para reduzir risco de inconsistencia.
- A liberacao do download marca o link como usado apos gerar a signed URL de 60 segundos.
- O envio do bot depende do WhatsApp Web e nao e uma API oficial do WhatsApp.
- ACK `sent` confirma o acionamento do envio no WhatsApp Web, nao entrega no aparelho do cliente.
- PFX ICP-Brasil com PBE SHA-1/3DES/RC2 e suportado pelo `node-forge`; PFX com algoritmos PKCS#12 mais recentes precisa ser validado com certificados reais.
