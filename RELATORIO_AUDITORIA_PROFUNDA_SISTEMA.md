# RELATORIO DE AUDITORIA PROFUNDA DO SISTEMA

Sistema auditado: Fasa Certificados PFX  
Diretorio: `C:\Users\User\fasa-certificados`  
Data da auditoria: 08/07/2026  
Escopo: auditoria tecnica, sem implementacao de correcoes.

## 1. Resumo executivo

O sistema e um painel interno Next.js para gestao de certificados digitais PFX, com Supabase Auth, Postgres, Storage privado, criptografia de senha real do certificado, links publicos de download de uso unico e um Desktop Bot Electron para envio de avisos internos via WhatsApp Web.

Conclusao geral: a base arquitetural esta correta para um sistema interno de producao, com boa separacao entre frontend, APIs backend, Supabase e bot. A seguranca essencial foi considerada: service role fica server-only, senhas PFX sao criptografadas com AES-256-GCM, download usa senha com hash `scrypt`, Storage e privado, RLS esta ativo e o bot usa Bearer Token + HMAC + nonce + timestamp.

O sistema ainda tem riscos relevantes antes de producao. O principal risco tecnico esta no modulo de notificacoes/bot: a reserva da mensagem expira em 60 segundos, mas o bot pode aguardar ate 60 segundos antes de enviar e ainda gastar ate 45 segundos na automacao do WhatsApp. Isso pode liberar a mesma mensagem para retry enquanto o primeiro envio ainda esta acontecendo, criando risco real de duplicidade. Tambem ha risco de inconsistencia entre Storage e banco em exclusoes/uploads por falta de transacao distribuida, limite fixo de listagens sem paginacao real, campos operacionais sensiveis demais para usuarios `financeiro` em alguns endpoints e problemas de encoding/UX que afetam apresentacao.

Validacoes locais executadas:

- `npm.cmd run lint`: passou.
- `npm.cmd run build`: passou.
- `npm.cmd --prefix desktop-bot run lint`: passou.

Evidencias principais: `README.md`, `package.json`, `middleware.ts`, `supabase_schema.sql`, `src/lib/*`, `src/app/api/**/route.ts`, `src/app/(internal)/**`, `desktop-bot/**`.

## 2. O que o sistema faz

O sistema controla certificados digitais PFX de clientes da Fasa Informatica. Ele permite:

- login interno via Supabase Auth;
- cadastro/renovacao de certificado PFX;
- validacao da senha real do PFX com `node-forge`;
- extracao de CNPJ, titular e datas;
- cadastro/atualizacao automatica de cliente por CNPJ;
- armazenamento do arquivo PFX em bucket privado;
- armazenamento da senha real criptografada;
- geracao de link publico de download com senha aleatoria forte;
- invalidacao automatica do link apos primeiro uso;
- planejamento de avisos de vencimento por dias configurados;
- resumo diario consolidado de certificados vencidos;
- envio das mensagens por Desktop Bot Electron conectado ao WhatsApp Web.

Publico usuario:

- `admin`: opera certificados, links, configuracoes, destinatarios e dispositivos WhatsApp.
- `financeiro`: consulta dashboard/listagens/configuracoes permitidas, sem operacoes sensiveis.

Evidencias: `README.md`, `src/app/(internal)/layout.tsx`, `src/lib/auth/rbac.ts`, `src/app/api/certificados/upload/route.ts`, `desktop-bot/README.md`.

## 3. Arquitetura encontrada

### Frontend

Frontend em Next.js App Router com React Server Components para paginas internas e Client Components para formularios/interacoes.

Telas identificadas:

- `/login`: login com Supabase Auth.
- `/dashboard`: metricas, graficos, bot e avisos.
- `/certificados`: listagem.
- `/certificados/novo`: upload/cadastro/renovacao.
- `/certificados/[id]`: detalhe, edicao de cliente, link e exclusao.
- `/clientes`: listagem de clientes.
- `/notificacoes`: eventos planejados/enviados/falhos.
- `/whatsapp`: dispositivos do bot.
- `/configuracoes`: configuracoes, templates e destinatarios.
- `/download/[token]`: tela publica de download protegido.

Evidencias: `src/app/(internal)/**`, `src/app/(auth)/login/**`, `src/app/download/[token]/**`.

### Backend/API

As operacoes sensiveis passam por API routes Node.js. Rotas de certificado, link, download, notificacoes e bot declaram `export const runtime = "nodejs"` nos arquivos auditados.

Evidencias: `src/app/api/**/route.ts`.

### Banco

Postgres do Supabase com schema unico `public`, enums, tabelas, triggers, RLS, grants de colunas e RPCs.

Evidencias: `supabase_schema.sql`, `src/lib/supabase/database.types.ts`.

### Supabase Auth

Login usa Supabase Auth via `@supabase/ssr`. Perfis internos ficam em `user_profiles`.

Evidencias: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/auth/rbac.ts`, `src/lib/auth/api.ts`, `supabase_schema.sql`.

### Supabase Storage

Bucket privado `certificados-pfx`, com upload/download/exclusao via backend usando service role.

Evidencias: `src/lib/storage/certificates.ts`, `src/app/api/certificados/upload/route.ts`, `src/app/api/download/[token]/validar/route.ts`, `supabase_schema.sql`.

### Desktop Bot

Aplicativo Electron com painel local, storage local, QWEP client, fila sequencial e bridge para WhatsApp Web.

Evidencias: `desktop-bot/package.json`, `desktop-bot/main.js`, `desktop-bot/lib/message-queue.js`, `desktop-bot/lib/qwep-client.js`, `desktop-bot/lib/whatsapp-bridge.js`.

## 4. Fluxo completo dos dados

### 4.1 Login

Fluxo identificado:

1. Usuario acessa `/login`.
2. `LoginForm` usa `createBrowserSupabaseClient().auth.signInWithPassword`.
3. Middleware redireciona rotas protegidas quando nao ha user.
4. O layout interno executa `requireInternalUser()`, consulta `user_profiles` e redireciona se nao houver perfil ativo.
5. APIs internas usam `requireApiUser([...roles])`.

Arquivos:

- `src/app/(auth)/login/login-form.tsx`
- `middleware.ts`
- `src/app/(internal)/layout.tsx`
- `src/lib/auth/rbac.ts`
- `src/lib/auth/api.ts`

Riscos:

- O middleware protege explicitamente `/dashboard`, `/certificados`, `/clientes`, `/configuracoes`, mas nao lista `/notificacoes` e `/whatsapp`. O layout interno cobre essas paginas, mas o middleware fica incompleto como primeira camada.
- APIs dependem de `requireApiUser`, o que e adequado; rotas do bot usam QWEP e a rota publica de download e intencionalmente publica.

### 4.2 Upload de certificado

Fluxo identificado:

1. Admin abre `/certificados/novo`.
2. `UploadCertificateForm` envia `FormData` para `POST /api/certificados/upload`.
3. API valida permissao admin.
4. Valida campos com Zod e tamanho do arquivo.
5. Confere extensao `.pfx` e primeiro byte ASN.1 `0x30`.
6. `parsePfx()` usa `node-forge` para abrir o PKCS#12 com senha.
7. Extrai CNPJ, titular e datas.
8. Calcula SHA-256 do arquivo.
9. Verifica duplicidade por `hash_arquivo`.
10. Criptografa senha real com AES-256-GCM.
11. Faz upload para `certificados-pfx`.
12. Chama RPC `registrar_upload_certificado`.
13. RPC cria/atualiza cliente, substitui certificado vigente anterior e cria novo certificado.
14. API chama `rebuildNotificationSchedule()`.

Arquivos:

- `src/app/(internal)/certificados/novo/upload-certificate-form.tsx`
- `src/app/api/certificados/upload/route.ts`
- `src/lib/validations/certificados.ts`
- `src/lib/pfx/parse.ts`
- `src/lib/crypto/secrets.ts`
- `src/lib/storage/certificates.ts`
- `src/lib/notifications/engine.ts`
- `supabase_schema.sql`

Riscos:

- `isPfxFile()` e uma checagem leve; a validacao real vem do parser. Isso e aceitavel.
- Upload para Storage acontece antes do commit no banco. Ha tentativa de restauracao/remocao em erro, mas nao existe transacao distribuida entre Storage e Postgres.
- Ao substituir certificado, o arquivo antigo nao e removido do Storage se o caminho usa hash diferente. Isso preserva historico, mas pode acumular objetos. O banco mantem historico `substituido`, entao nao e necessariamente orfao, mas exige politica de retencao.

### 4.3 Renovacao de certificado

Renovacao usa o mesmo fluxo de upload. O RPC atualiza certificados vigentes do cliente para `substituido` e cria novo registro.

Evidencia: `public.registrar_upload_certificado` em `supabase_schema.sql`.

Riscos:

- A tela de detalhe tem botao `Renovar certificado` que leva para `/certificados/novo`; a vinculacao depende do usuario carregar cliente existente ou do CNPJ extraido.
- Eventos futuros sao recalculados apos upload, o que remove eventos futuros de vencimento e recria os novos.

### 4.4 Exclusao de certificado

Fluxo identificado:

1. Admin chama `DELETE /api/certificados/[id]`.
2. API busca `storage_path`.
3. Verifica se ha outro certificado apontando para o mesmo path.
4. Baixa backup do objeto, se aplicavel.
5. Remove objeto do Storage.
6. Chama RPC `excluir_certificado_com_cliente`.
7. RPC remove certificado e remove cliente se ele nao tiver outros certificados.
8. API tenta restaurar Storage em falha de banco.
9. API executa rebuild de notificacoes.

Arquivos:

- `src/app/api/certificados/[id]/route.ts`
- `src/app/(internal)/certificados/[id]/delete-certificate-button.tsx`
- `supabase_schema.sql`

Riscos:

- Fluxo e bem desenhado para mitigar inconsistencia, mas ainda nao e atomico.
- Se o backup/download do objeto falhar e a remocao/banco falharem em sequencia, pode haver estado inconsistente.
- `notification_events` tem FK `on delete cascade` para certificado, mas eventos `certificate_expired` consolidados possuem `certificado_id null`; esses eventos historicos permanecem, o que e aceitavel como historico.

### 4.5 Link publico de download

Fluxo identificado:

1. Admin cria link em `POST /api/certificados/[id]/link`.
2. API invalida link ativo anterior.
3. Gera token publico de 32 bytes base64url.
4. Gera senha aleatoria de 18 bytes base64url.
5. Salva hash `scrypt` da senha.
6. Retorna a senha uma unica vez.
7. Pagina publica `/download/[token]` exibe formulario se link estiver ativo.
8. `POST /api/download/[token]/validar` valida senha, cria signed URL de 60s, marca link como usado e registra auditoria.

Arquivos:

- `src/app/api/certificados/[id]/link/route.ts`
- `src/app/download/[token]/page.tsx`
- `src/app/download/[token]/download-form.tsx`
- `src/app/api/download/[token]/validar/route.ts`
- `src/lib/download/password.ts`
- `src/lib/download/token.ts`

Riscos:

- `token_publico` fica armazenado em claro no banco. Como e alta entropia e RLS restringe, e risco medio, mas token hash reduziria impacto de vazamento de banco.
- A pagina publica consulta o token e mostra formulario apenas quando disponivel. A mensagem para indisponivel e generica, mas o comportamento ainda revela que um token valido esta ativo quando o formulario aparece.
- Rate limit do download e por link, nao por token+IP. Ajuda contra brute force da senha, mas nao limita varredura distribuida por IP.

### 4.6 Notificacoes

Fluxo identificado:

1. Configuracoes ficam em `notification_settings`.
2. Destinatarios internos ficam em `notification_recipients`, maximo 5 por trigger.
3. Templates ficam em `notification_templates`.
4. Rebuild remove eventos futuros nao enviados de `certificate_expiring`.
5. Para cada certificado vigente e dia configurado, calcula `send_date`.
6. Cria evento por destinatario ativo com mensagem renderizada.
7. Cron diario gera eventos consolidados `certificate_expired` para certificados vencidos.
8. Bot reserva eventos `pending`/`retry` elegiveis.
9. ACK atualiza `processing`, `sent`, `retry` ou `failed`.

Arquivos:

- `src/lib/notifications/engine.ts`
- `src/lib/notifications/validation.ts`
- `src/app/api/notifications/**`
- `src/app/api/cron/certificados-vencimentos/route.ts`
- `supabase_schema.sql`

Riscos:

- Reserva expira em 60 segundos; o bot pode atrasar ate 60 segundos antes do envio e ainda aguardar WhatsApp. Alto risco de duplicidade sob concorrencia.
- `rebuildNotificationSchedule()` remove eventos futuros com status `pending`, `retry`, `cancelled`, `skipped`. Eventos `reserved`/`processing` nao sao removidos, correto para nao interromper envio.
- Se o bot ficar offline por muitos dias, muitos eventos `pending` vencidos podem acumular e ser processados sequencialmente.

### 4.7 Bot WhatsApp

Fluxo identificado:

1. Admin cria dispositivo.
2. API retorna token e signing secret uma vez.
3. Bot salva localmente com `safeStorage` quando disponivel.
4. Bot valida credenciais em `/api/whatsapp-bot/auth/validate`.
5. Rotas operacionais usam Bearer + HMAC + timestamp + nonce + body hash.
6. Bot envia heartbeat.
7. Bot busca `GET /api/whatsapp-bot/messages/pending?limit=1`.
8. Processa uma mensagem por vez.
9. Envia ACK `processing`.
10. Aguarda delay configurado.
11. Envia via WhatsApp Web.
12. Envia ACK `sent` ou `failed`.

Arquivos:

- `desktop-bot/main.js`
- `desktop-bot/lib/storage.js`
- `desktop-bot/lib/qwep-client.js`
- `desktop-bot/lib/message-queue.js`
- `desktop-bot/lib/whatsapp-bridge.js`
- `src/app/api/whatsapp-bot/**`
- `src/lib/qwep/**`

Riscos:

- Automacao depende de APIs internas do WhatsApp Web; alta fragilidade operacional.
- Se `safeStorage` nao estiver disponivel, o bot grava segredos em `plain_fallback`.
- O tempo de reserva no backend e menor que o pior caso de atraso+envio.

## 5. Mapa de modulos

| Modulo | Responsabilidade | Evidencia |
|---|---|---|
| Auth/RBAC | Sessao, perfil e permissao admin/financeiro | `src/lib/auth/rbac.ts`, `src/lib/auth/api.ts`, `middleware.ts` |
| Supabase | Clientes anon/server/admin | `src/lib/supabase/*.ts` |
| Certificados/PFX | Validacao, parsing, status e upload | `src/lib/pfx/*`, `src/lib/certificados/*`, `src/app/api/certificados/**` |
| Crypto | AES-GCM para segredos e hash de senha de download | `src/lib/crypto/secrets.ts`, `src/lib/download/password.ts` |
| Storage | Nome do bucket e paths | `src/lib/storage/certificates.ts` |
| Links publicos | Token, senha e download assinado | `src/app/api/certificados/[id]/link/route.ts`, `src/app/api/download/[token]/validar/route.ts` |
| Notificacoes | Templates, settings, rebuild, cron e vencidos | `src/lib/notifications/*`, `src/app/api/notifications/**` |
| QWEP | HMAC, replay protection e rate limit | `src/lib/qwep/*` |
| UI/Layout | Shell, navegacao, cards, tabelas e graficos | `src/components/**` |
| Desktop Bot | Electron, storage local, fila, WhatsApp bridge | `desktop-bot/**` |

## 6. Mapa de tabelas

| Tabela | Finalidade | Relacionamentos principais |
|---|---|---|
| `user_profiles` | RBAC interno | `id -> auth.users` |
| `clientes` | Cadastro por CNPJ | Referenciado por `certificados` e eventos |
| `certificados` | Historico de PFX | `cliente_id -> clientes`; senha criptografada; path privado |
| `configuracoes_sistema` | Configuracao legada de dias | Singleton |
| `links_download` | Link publico de uso unico | `certificado_id -> certificados on delete cascade` |
| `audit_logs` | Auditoria de acoes sensiveis | usuario/certificado opcionais |
| `notification_settings` | Configuracoes do bot/avisos | Singleton |
| `notification_templates` | Templates de mensagens | Usado por eventos |
| `notification_recipients` | Destinatarios internos | Referenciado por eventos |
| `notification_events` | Outbox de mensagens | cliente/certificado/recipient/device |
| `whatsapp_devices` | Dispositivos autorizados | Referenciado por eventos/logs |
| `whatsapp_device_logs` | Logs operacionais do bot | `device_id -> whatsapp_devices` |
| `notification_runs` | Execucoes de rebuild/cron | `created_by -> auth.users` |
| `qwep_seen_nonces` | Replay protection | `device_id -> whatsapp_devices` |
| `qwep_rate_limit_buckets` | Rate limit persistente QWEP | chave textual |

Evidencia: `supabase_schema.sql`.

## 7. Mapa de APIs

| Metodo | Rota | Finalidade | Auth/RBAC | Riscos observados |
|---|---|---|---|---|
| GET | `/api/certificados` | Listar certificados | admin/financeiro | Limite fixo 200; sem paginacao |
| POST | `/api/certificados/upload` | Upload/renovacao PFX | admin | Storage e banco sem transacao distribuida |
| GET | `/api/certificados/[id]` | Detalhe metadata | admin/financeiro | Sem senha/path na resposta, adequado |
| DELETE | `/api/certificados/[id]` | Excluir certificado/storage/cliente | admin | Inconsistencia possivel em falhas parciais |
| POST | `/api/certificados/[id]/link` | Criar link/senha | admin | Token salvo em claro |
| PATCH | `/api/certificados/[id]/link` | Invalidar/atualizar senha | admin | OK, senha exibida uma vez |
| GET | `/api/clientes` | Listar clientes | admin/financeiro | Limite fixo 200 |
| POST | `/api/clientes` | Criar/atualizar cliente | admin | Rebuild chamado a cada alteracao |
| GET | `/api/configuracoes` | Config legada | admin | Duplicidade conceitual com notification_settings |
| PUT | `/api/configuracoes` | Alterar dias legados | admin | Pode confundir com config real do bot |
| POST | `/api/download/[token]/validar` | Validar senha e signed URL | publica | Rate limit por link; token em claro |
| POST | `/api/cron/certificados-vencimentos` | Job diario | CRON_SECRET | Comparacao simples de segredo |
| GET | `/api/notifications/settings` | Ler settings | admin/financeiro | Usa service role mas filtra por auth |
| PUT | `/api/notifications/settings` | Salvar settings e rebuild | admin | Rebuild completo pode pesar com muitos dados |
| GET | `/api/notifications/templates` | Listar templates | admin/financeiro | `ensureDefaultNotificationTemplate` garante so expiring no GET |
| PUT | `/api/notifications/templates/[id]` | Atualizar template | admin | Rebuild por template pode ser caro |
| POST | `/api/notifications/check-expiring` | Rebuild manual | admin | Nome antigo; faz rebuild futuro |
| GET | `/api/notifications/recipients` | Listar destinatarios | admin/financeiro | Retorna telefone completo interno |
| POST | `/api/notifications/recipients` | Criar destinatario | admin | Checagem count + trigger; bom |
| PATCH | `/api/notifications/recipients/[id]` | Editar destinatario | admin | Rebuild a cada alteracao |
| DELETE | `/api/notifications/recipients/[id]` | Remover destinatario | admin | Eventos antigos ficam com recipient null |
| GET | `/api/notifications/events` | Listar eventos | admin/financeiro | Retorna `idempotency_key`, telefone destino e erro bruto |
| POST | `/api/notifications/events/[id]/retry` | Reenfileirar | admin | Nao zera attempt_count |
| GET | `/api/whatsapp/devices` | Listar devices | admin | Campos sensiveis nao retornam, adequado |
| POST | `/api/whatsapp/devices` | Criar device | admin | Token/secret retornam uma vez |
| PATCH | `/api/whatsapp/devices/[id]/primary` | Definir principal | admin | Operacao em duas queries, pequeno risco de corrida mitigado por unique index |
| POST | `/api/whatsapp/devices/[id]/revoke` | Revogar device | admin | Reenfileira reserved/processing |
| POST | `/api/whatsapp-bot/auth/validate` | Ativar/autenticar bot | token+secret | Rate limit em memoria, nao persistente |
| POST | `/api/whatsapp-bot/status/heartbeat` | Heartbeat | QWEP | Adequado |
| GET | `/api/whatsapp-bot/messages/pending` | Reservar mensagens | QWEP primary | Reserva 60s curta; fallback menos seguro |
| POST | `/api/whatsapp-bot/messages/[id]/ack` | ACK processing/sent/failed | QWEP | Nao valida expiracao da reserva |
| GET | `/api/whatsapp-bot/messages/stats` | Stats do bot | QWEP | Faz contagem sequencial por status |

## 8. Auditoria do banco

Pontos positivos:

- RLS ativado em tabelas sensiveis.
- Grants de coluna impedem `authenticated` de selecionar senha do certificado e storage path via cliente anon.
- Constraints relevantes para CNPJ, hash SHA-256, telefone, delays, attempts e estados.
- Indices em CNPJ, vencimento, status, hash, storage, token e eventos.
- Unique parcial para 1 certificado vigente por cliente e 1 link ativo por certificado.
- Idempotencia de notificacoes por `idempotency_key`.
- RPC de reserva usa `FOR UPDATE SKIP LOCKED`, quando disponivel.

Problemas:

- `token_publico` e armazenado em claro.
- `notification_events.idempotency_key` e concedido a `authenticated` e retornado por API; e um identificador operacional desnecessario para financeiro.
- `notification_events.telefone_destino` e concedido a financeiro. Pode ser aceitavel por regra interna, mas deve ser decisao explicita.
- `notification_settings` e `configuracoes_sistema` coexistem e ambas carregam dias de aviso, podendo gerar confusao.
- Trigger de limite de destinatarios conta todos, nao apenas ativos; isso esta alinhado a "maximo 5 cadastrados", mas nao a "maximo 5 ativos" caso a regra mude.
- `notification_events` para vencidos consolidados usa `certificado_id null`, correto; porem historicos antigos nao sao afetados por renovacao, por design.

## 9. Auditoria de seguranca

### Pontos fortes

- `src/lib/supabase/admin.ts` usa `server-only`.
- `src/lib/crypto/secrets.ts` usa AES-256-GCM com IV aleatorio de 12 bytes.
- `src/lib/download/password.ts` usa `scrypt` e `timingSafeEqual`.
- QWEP valida bearer token, HMAC, body hash, timestamp e nonce.
- Nonces sao persistidos em `qwep_seen_nonces`.
- Rotas de bot nao recebem Supabase keys.
- Frontend nao contem `SUPABASE_SERVICE_ROLE_KEY`, exceto referencia documental em README.
- Build nao indicou erro de import server-only em client.

### Riscos principais

| Prioridade | Area | Problema | Impacto | Evidencia | Correcao recomendada |
|---|---|---|---|---|---|
| Alto | Bot/notificacoes | Reserva expira em 60s, menor que delay+envio possivel | Duplicidade de envio WhatsApp | `supabase_schema.sql` RPC `reserve_pending_notification_events`; `desktop-bot/lib/message-queue.js` delay e timeout | Reservation TTL dinamico: `delay_maximo + timeout + buffer`, ou renovar reserva no ACK processing |
| Alto | Storage/banco | Upload/exclusao nao sao transacao distribuida | Objeto orfao ou registro sem arquivo em falhas raras | `src/app/api/certificados/upload/route.ts`, `src/app/api/certificados/[id]/route.ts` | Criar reconciliation job e tabela de operacoes Storage pendentes |
| Medio | Download publico | Token publico salvo em claro | DB leak permite acessar tela de link, ainda precisa senha | `supabase_schema.sql`, `download-link-manager.tsx` | Salvar `token_hash` e mostrar token apenas na criacao |
| Medio | API eventos | Financeiro recebe campos operacionais (`idempotency_key`, telefone destino, erro bruto) | Exposicao desnecessaria de dados internos | `src/app/api/notifications/events/route.ts` | Criar DTO por role e esconder campos tecnicos |
| Medio | Bot local | `safeStorage` pode cair para `plain_fallback` | Token/secret no disco local em claro | `desktop-bot/lib/storage.js` | Exigir criptografia ou avisar/bloquear sem safeStorage em producao |
| Medio | Public download | Pagina mostra formulario quando token ativo | Diferencia token ativo de invalido | `src/app/download/[token]/page.tsx` | Sempre mostrar formulario e validar genericamente no POST |
| Baixo | Middleware | Prefixos internos incompletos | Defesa em profundidade menor | `middleware.ts`, `src/app/(internal)/layout.tsx` | Incluir `/notificacoes` e `/whatsapp` ou proteger grupo por matcher |
| Baixo | UI/encoding | Textos com mojibake | Aparencia ruim e confusao | varios arquivos `src/app/**`, `src/lib/certificados/status-labels.ts` | Normalizar encoding UTF-8 e revisar textos |

## 10. Auditoria do Supabase

Uso correto:

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` aparecem no browser como esperado.
- `SUPABASE_SERVICE_ROLE_KEY` so aparece em `README.md` e `src/lib/supabase/env.ts`.
- Service role e usado em APIs/server components, nao em Client Components.
- Bucket `certificados-pfx` e criado como privado em `supabase_schema.sql`.
- RLS esta ativo nas tabelas principais e do bot.
- Grants de coluna removem senha e storage path do role `authenticated`.

Pontos a reforcar:

- Server Components internos usam service role diretamente em algumas paginas (`dashboard`, `configuracoes`, `notificacoes`, `whatsapp`). Como o layout exige usuario interno, isso e funcional; mesmo assim, para defesa em profundidade, preferir consultas via anon/RLS quando nao precisar burlar RLS.
- `notification_events` e `notification_recipients` concedem dados completos a `financeiro`. Confirmar se financeiro pode ver telefone interno e todos os eventos.

## 11. Auditoria das notificacoes

Pontos corretos:

- Backend calcula vencimentos e renderiza mensagem.
- Bot recebe somente `to` e `text`.
- Templates bloqueiam termos sensiveis: senha, download, link publico, storage path.
- `certificate_expiring` e planejado por `send_date`.
- `certificate_expired` e consolidado diario por destinatario.
- Idempotencia existe para ambos os fluxos.
- Rebuild e chamado apos upload, cliente, settings, templates e destinatarios.

Problemas:

- Reserva curta de 60s e o maior risco do modulo.
- `runDueNotificationJob()` nao recalcula eventos futuros; isso segue o desenho, mas se o rebuild falhar depois de uma mudanca, o cron nao corrige automaticamente.
- `GET /api/notifications/templates` chama `ensureDefaultNotificationTemplate()`, que garante o template de vencimento, mas nao necessariamente o template de vencidos. A pagina de configuracoes chama `ensureDefaultNotificationTemplates()`, entao na pratica funciona ali.
- `retry` manual nao zera `attempt_count`; um evento no limite pode continuar sem envio.

## 12. Auditoria do bot WhatsApp

Pontos corretos:

- Electron com `contextIsolation: true` e `nodeIntegration: false`.
- Bot nao acessa Supabase.
- QWEP assina rotas operacionais.
- Fila local e sequencial: `processing` global evita paralelo.
- Busca `limit=1`.
- Delay minimo e clampado em 30 segundos.
- Logs mascaram tokens e telefones.
- Build de instalador configurado em `desktop-bot/package.json`.

Problemas:

- `safeStorage` pode fazer fallback para texto puro.
- Automacao usa internals do WhatsApp Web (`webpackChunkwhatsapp_web_client`, `WAWeb*`), que podem quebrar a qualquer atualizacao do WhatsApp.
- `preload.js` expoe `window.queueBot`; nome remete ao projeto anterior Queue SaaS, nao e risco funcional, mas prejudica manutencao.
- UI do bot ainda mostra alguns termos tecnicos em HTML/JS, como `Signing Secret` e `Polling`.

## 13. Auditoria de performance

Gargalos provaveis:

- Listagens com `.limit(200)` ou `.limit(300)` sem paginacao real: `certificados`, `clientes`, `notificacoes`.
- Dashboard executa varias contagens sequenciais com service role.
- `GET /api/whatsapp-bot/messages/stats` faz uma query por status em loop.
- Rebuild percorre certificados x dias x destinatarios, inserindo evento um a um.
- Filtros de notificacoes aplicam busca `q` no cliente depois de buscar ate 300 eventos.
- Com bot offline por muitos dias, eventos elegiveis acumulam e serao enviados um por vez com delay minimo de 30s.

Cenarios:

- 100 certificados: sistema deve operar bem.
- 1.000 certificados: rebuild ainda aceitavel, mas pode ficar lento se houver 5 destinatarios e muitos dias.
- 10.000 eventos: listagens e stats sequenciais comecam a pesar.
- Bot offline por 7 dias: fila acumulada pode demorar horas para drenar por design.
- Multiplos usuarios internos: sem problema relevante, exceto pagina dashboard com muitas queries repetidas.

## 14. Auditoria do frontend

Pontos positivos:

- Componentes reutilizaveis (`StatCard`, `SectionCard`, `DataTable`, `StatusBadge`, charts).
- Layout interno centraliza protecao via `requireInternalUser`.
- Mobile usa cards em `notificacoes`.
- Build passa.

Problemas:

- Ha textos com encoding quebrado (`Fasa InformÃ¡tica`, `ConfiguraÃ§Ãµes`, `VÃ¡lido`).
- `globals.css` define `--primary: #25eb2f`, divergindo da identidade azul, embora a maioria use classes Tailwind azuis.
- Tabelas ainda nao tem paginacao real.
- Algumas telas usam `window.confirm`, menos consistente para acoes destrutivas.
- Mensagens de erro sao geralmente amigaveis, mas eventos e logs podem expor erro operacional bruto para admin/financeiro.

## 15. Auditoria de qualidade do codigo

Pontos bons:

- TypeScript strict ativo.
- Modulos server-only para segredos.
- Zod em rotas principais.
- Separacao razoavel em `lib/auth`, `lib/pfx`, `lib/crypto`, `lib/notifications`, `lib/qwep`.
- APIs sensiveis declaram runtime Node.
- Sem `TODO` relevante encontrado na busca.

Pontos frageis:

- Logica de notificacao concentrada em `src/lib/notifications/engine.ts`, arquivo grande e com muitas responsabilidades.
- Service role e usado em paginas server, nao apenas APIs/services.
- Rebuild faz varias operacoes sequenciais e inserts individuais.
- `database.types.ts` inclui campos sensiveis no tipo global, inevitavel, mas exige cuidado.
- `desktop-bot` usa JavaScript puro sem TypeScript.
- Arquivos `desktop-bot/dist` estao dentro do diretorio do projeto e deveriam ser artefatos ignorados/versionados com cuidado.

## 16. Riscos encontrados

| Prioridade | Area | Problema | Impacto | Evidencia | Correcao recomendada |
|---|---|---|---|---|---|
| Critico | Producao/operacao | Sem teste real de PFX ICP-Brasil/AES OpenSSL 3 documentado nesta auditoria | Upload pode falhar com certificados reais especificos | `src/lib/pfx/parse.ts`, `README.md` limitacoes | Criar bateria com PFX reais anonimizados e casos de senha incorreta |
| Alto | Bot | Reserva de 60s menor que envio maximo | Envio duplicado ou ACK falhando | `supabase_schema.sql`, `desktop-bot/lib/message-queue.js` | Aumentar/renovar reserva |
| Alto | Storage | Sem reconciliation de Storage | Objetos orfaos ou registros sem arquivo em falhas raras | rotas upload/delete | Criar tabela/job de reconciliacao |
| Alto | Escala | Rebuild insere eventos um a um | Lentidao com milhares de certificados | `src/lib/notifications/engine.ts` | RPC/bulk insert/upsert |
| Medio | Download | Token publico em claro | Aumenta impacto de vazamento do banco | `links_download.token_publico` | Migrar para token hash |
| Medio | RBAC/API | `financeiro` pode ver telefone destino/idempotency_key/eventos detalhados | Exposicao desnecessaria | `src/app/api/notifications/events/route.ts` | DTO por perfil |
| Medio | Bot local | Fallback de segredo em claro | Risco em maquina comprometida | `desktop-bot/lib/storage.js` | Bloquear sem safeStorage ou criptografar com DPAPI alternativa |
| Medio | Observabilidade | Pouca auditoria para falhas Storage/rebuild | Dificil investigacao | `audit_logs`, rotas | Logar operacoes pendentes/falhas sanitizadas |
| Baixo | Middleware | Prefixos incompletos | Defesa em profundidade menor | `middleware.ts` | Adicionar `/notificacoes` e `/whatsapp` |
| Baixo | UX | Mojibake em textos | Aparencia nao profissional | varios arquivos UI | Normalizar UTF-8 |

## 17. Bugs provaveis

1. Duplicidade de envio se a reserva expirar durante delay/envio.
2. ACK `sent` pode falhar se outra chamada `pending` liberar reserva antes do envio terminar.
3. `retry` manual pode nao reenviar evento que ja atingiu `attempt_count >= max_attempts`.
4. `GET /api/notifications/templates` pode nao criar template de vencidos se chamado isoladamente.
5. Reset SQL menciona bucket `certificados`, mas o bucket real e `certificados-pfx`.
6. Alguns textos renderizam caracteres quebrados.
7. Status de certificado pode ficar obsoleto com o passar dos dias se nao houver rotina para atualizar `ativo` para `vencendo`/`vencido`; dashboard compensa parcialmente por data, mas listagem usa status salvo.

## 18. Gargalos provaveis

| Cenario | Gargalo | Evidencia | Mitigacao |
|---|---|---|---|
| 1.000 certificados | Rebuild cria eventos em loops | `engine.ts` | Bulk insert/RPC |
| 10.000 eventos | Listagem limitada/sem paginacao | `notificacoes/page.tsx`, API events | Cursor pagination |
| Dashboard acessado por varios usuarios | Multiplas contagens sequenciais | `dashboard/page.tsx` | RPC agregada/cache curto |
| Bot offline dias | Fila longa sequencial | `message-queue.js` | Dashboard de atraso e priorizacao |
| Muitos logs QWEP | Limpeza so durante requests | `src/lib/qwep/auth.ts` | Job de limpeza periodico |

## 19. Dados orfaos possiveis

- Objetos PFX antigos no Storage de certificados `substituido`: nao sao orfaos se o historico usa `storage_path`, mas acumulam.
- Objeto PFX pode ficar orfao se upload ao Storage funcionar e erro no banco/restore falhar.
- Registro pode ficar sem arquivo se remocao/restore falhar em exclusao.
- Eventos consolidados de vencidos historicos permanecem apos renovacao; isso e historico, nao necessariamente orfao.
- `whatsapp_device_logs` com `device_id null` apos delecao de device nao ocorre porque devices sao revogados, nao deletados.

## 20. Problemas de RLS/policies

Nao foi encontrado RLS completamente ausente nas tabelas sensiveis do schema principal.

Pontos de atencao:

- Policies permitem leitura interna ampla de `notification_events`, `notification_recipients` e `notification_templates`. Isso segue o requisito de financeiro visualizar, mas os grants de coluna ainda incluem campos operacionais.
- Service role em Server Components burla RLS por design. Como o layout protege sessao, o risco e moderado; ainda assim, e melhor reduzir uso de service role a APIs/services que realmente precisem.
- O schema nao usa `force row level security`; em Supabase, service role sempre ignora RLS. Isso e esperado para backend admin, mas deve ser documentado como escolha.

## 21. Melhorias recomendadas

1. Ajustar reserva de notificacoes para cobrir delay maximo e timeout de envio.
2. Criar pagina/API com paginacao real para certificados, clientes e avisos.
3. Migrar `links_download` para `token_hash` e guardar token puro apenas no retorno de criacao.
4. Criar reconciliation job de Storage.
5. Criar RPC agregada para dashboard e stats do bot.
6. Reduzir retorno de campos operacionais para `financeiro`.
7. Normalizar encoding UTF-8 dos textos.
8. Atualizar status dos certificados diariamente ou calcular status dinamicamente em views/RPC.
9. Separar `engine.ts` em servicos menores: templates, rebuild, expired daily, reservation helpers.
10. Adicionar testes automatizados para validadores, template rendering e status.

## 22. Plano de otimizacao priorizado

| Prioridade | Otimizacao | Arquivos envolvidos | Beneficio | Risco | Como validar |
|---|---|---|---|---|---|
| Critica | Aumentar/renovar TTL de reserva | `supabase_schema.sql`, migration, `ack/route.ts`, `message-queue.js` | Evita duplicidade | Medio | Simular delay 60s + envio lento |
| Critica | Reconciliation Storage | rotas certificados, nova tabela/job | Evita orfaos | Medio | Falhar Storage/DB artificialmente |
| Alta | Token hash para download | `links_download`, link API, download API | Reduz impacto de DB leak | Medio | Criar link e baixar |
| Alta | Status diario de certificados | cron/RPC/status | Corrige status obsoleto | Baixo | Certificado vencendo/vencido em data simulada |
| Alta | Paginacao server-side | listagens e APIs | Escala melhor | Medio | Testar com 1.000 registros |
| Media | RPC agregada dashboard | dashboard, SQL | Reduz queries | Medio | Comparar numeros antes/depois |
| Media | DTO por role em eventos | events API/pages | Menos exposicao | Baixo | Login financeiro |
| Media | Bulk rebuild | `engine.ts`, SQL RPC | Performance | Alto | Rebuild com dataset grande |
| Baixa | Normalizar encoding | UI files | Qualidade visual | Baixo | Revisao visual |
| Baixa | Remover termos legados `queueBot` | desktop-bot/preload/renderer | Manutencao | Baixo | Lint/start bot |

## 23. Checklist de testes

### Autenticacao/RBAC

- [ ] `/dashboard` sem login redireciona.
- [ ] `/notificacoes` sem login redireciona via layout.
- [ ] `/whatsapp` exige admin.
- [ ] Financeiro nao acessa upload, links, exclusao, dispositivos.
- [ ] APIs admin retornam 403 para financeiro.

### Certificados

- [ ] Upload PFX valido.
- [ ] Upload sem arquivo.
- [ ] Arquivo nao PFX.
- [ ] Senha incorreta.
- [ ] PFX sem CNPJ com CNPJ manual.
- [ ] PFX com CNPJ divergente do manual.
- [ ] Certificado vencido cadastra como vencido.
- [ ] Renovacao substitui anterior.
- [ ] Duplicidade por hash bloqueia.

### Storage

- [ ] Arquivo aparece no bucket privado `certificados-pfx`.
- [ ] Frontend nao acessa objeto direto.
- [ ] Exclusao remove objeto quando sem outra referencia.
- [ ] Falha simulada de banco restaura objeto.

### Link publico

- [ ] Senha gerada aparece uma vez.
- [ ] Hash salvo, senha pura nao aparece no banco/API.
- [ ] Senha errada incrementa tentativas.
- [ ] Bloqueio apos 5 tentativas.
- [ ] Download gera signed URL de 60s.
- [ ] Segundo uso do mesmo link e bloqueado.
- [ ] Link invalidado nao baixa.

### Notificacoes

- [ ] Dias `30,15,1` geram `send_date` correto.
- [ ] Rebuild nao duplica eventos.
- [ ] Alterar destinatario reconstrui eventos futuros.
- [ ] Template com variavel invalida falha.
- [ ] Template com termo sensivel falha.
- [ ] Certificados vencidos geram 1 resumo por destinatario por dia.
- [ ] Renovacao remove certificado do resumo futuro.

### Bot

- [ ] Criar device retorna token/secret uma vez.
- [ ] Bot autentica.
- [ ] HMAC invalido falha.
- [ ] Nonce repetido falha.
- [ ] Device nao principal nao reserva.
- [ ] Bot reserva uma mensagem por vez.
- [ ] Delay minimo de 30s e respeitado.
- [ ] ACK processing funciona.
- [ ] ACK sent funciona.
- [ ] ACK failed gera retry ate max_attempts.
- [ ] Reserva expirada nao duplica apos ajuste recomendado.

### Performance

- [ ] Listagem com 1.000 certificados.
- [ ] 10.000 eventos em notificacoes.
- [ ] Dashboard com dataset grande.
- [ ] Bot offline por 3 dias e retorno online.

## 24. Checklist de producao

- [ ] `.env` configurado no provedor sem expor service role.
- [ ] `CERT_ENCRYPTION_KEY` gerado uma vez e guardado em cofre.
- [ ] `CRON_SECRET` forte.
- [ ] `supabase_schema.sql` aplicado sem erro.
- [ ] Bucket `certificados-pfx` privado.
- [ ] RLS conferido no Supabase.
- [ ] Usuario admin criado e financeiro testado.
- [ ] Cron diario configurado.
- [ ] Backup Supabase ativo.
- [ ] Logs sem tokens/senhas.
- [ ] Bot instalado em maquina controlada.
- [ ] WhatsApp Web conectado e monitorado.
- [ ] Plano de rotacao de credenciais do bot.
- [ ] Testes com PFX reais ICP-Brasil.
- [ ] Reconciliation de Storage implementada antes de operacao critica.

## 25. Conclusao

O sistema esta bem encaminhado e tem arquitetura coerente: Next.js como painel e backend, Supabase como Auth/Postgres/Storage, APIs server-only para operacoes sensiveis, schema com RLS e um bot Electron isolado que conversa apenas com backend assinado.

Para uso real, eu nao classificaria como "pronto sem ressalvas" antes de corrigir pelo menos:

1. risco de duplicidade por reserva de 60 segundos;
2. reconciliacao de Storage/banco;
3. paginacao/performance basica;
4. reducao de campos operacionais para financeiro;
5. validacao com PFX reais;
6. normalizacao de encoding visual.

As prioridades corretas sao: primeiro seguranca/consistencia de envio e Storage; depois escala de listagens/rebuild; por ultimo refinamentos de UI/manutencao.

## 26. Grau de confianca da analise

Grau de confianca: 88%.

Base analisada:

- Aproximadamente 127 arquivos relevantes fora de `node_modules`, `.next` e `desktop-bot/dist`.
- 4 arquivos Markdown lidos: `README.md`, `desktop-bot/README.md`, `AGENTS.md`, `CLAUDE.md`.
- 24 API routes identificadas.
- 15 tabelas principais identificadas no schema atual.
- 10 modulos funcionais principais identificados.

Limitacoes:

- Nao houve conexao ao Supabase real para validar policies aplicadas no banco remoto.
- Nao houve execucao com PFX real.
- Nao houve execucao real do bot contra WhatsApp Web nesta auditoria.
- Nao houve teste de carga com milhares de registros.
- Build e lint foram validados localmente, mas isso nao prova comportamento em producao.

