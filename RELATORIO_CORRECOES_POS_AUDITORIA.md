# Relatório de Correções Pós-Auditoria

Data: 08/07/2026  
Projeto: Fasa Certificados PFX  
Escopo: correções críticas e altas apontadas em `RELATORIO_AUDITORIA_PROFUNDA_SISTEMA.md`.

## 1. Resumo

Foram corrigidos os principais riscos antes de produção sem redesign e sem alterar regras de negócio:

- Reserva do bot WhatsApp deixou de expirar em 60 segundos fixos.
- ACK `processing` agora renova a reserva da mensagem.
- Storage/Postgres ganhou mecanismo de reconciliação e API admin.
- Listagens principais ganharam paginação server-side.
- Link público passou a armazenar apenas `token_hash`.
- API de avisos passou a retornar DTO reduzido para financeiro.
- Status de certificados passou a ser recalculado pelo backend.
- Mojibake visível foi revisado; buscas por `Ã`/`â` não retornam ocorrências runtime.
- Validação com PFX reais foi documentada em roteiro separado.

## 2. Arquivos alterados

- `supabase_schema.sql`
- `supabase/migrations/20260708160000_post_audit_critical_fixes.sql`
- `README.md`
- `VALIDACAO_PFX_REAIS.md`
- `middleware.ts`
- `desktop-bot/lib/message-queue.js`
- `src/lib/pagination.ts`
- `src/components/ui/pagination-bar.tsx`
- `src/lib/download/token.ts`
- `src/lib/certificados/status.ts`
- `src/lib/notifications/engine.ts`
- `src/lib/storage/reconciliation.ts`
- `src/lib/supabase/database.types.ts`
- `src/app/api/admin/storage/reconcile/route.ts`
- `src/app/api/whatsapp-bot/messages/pending/route.ts`
- `src/app/api/whatsapp-bot/messages/[id]/ack/route.ts`
- `src/app/api/certificados/upload/route.ts`
- `src/app/api/certificados/[id]/route.ts`
- `src/app/api/certificados/[id]/link/route.ts`
- `src/app/api/download/[token]/validar/route.ts`
- `src/app/api/certificados/route.ts`
- `src/app/api/clientes/route.ts`
- `src/app/api/notifications/events/route.ts`
- `src/app/download/[token]/page.tsx`
- `src/app/(internal)/certificados/page.tsx`
- `src/app/(internal)/certificados/[id]/page.tsx`
- `src/app/(internal)/certificados/[id]/download-link-manager.tsx`
- `src/app/(internal)/clientes/page.tsx`
- `src/app/(internal)/notificacoes/page.tsx`
- `src/app/(internal)/dashboard/page.tsx`

## 3. Correções por risco

| Risco | Mitigação aplicada | Evidência |
|---|---|---|
| Duplicidade no envio do bot | TTL calculado por `delay_maximo_segundos + 45 + 120`; fallback da API usa o mesmo TTL; ACK `processing` renova `reservation_expires_at`; lock local do bot passou para 5 minutos | `supabase_schema.sql`, `src/app/api/whatsapp-bot/messages/pending/route.ts`, `src/app/api/whatsapp-bot/messages/[id]/ack/route.ts`, `desktop-bot/lib/message-queue.js` |
| Storage e banco inconsistentes | Nova tabela `storage_reconciliation_jobs`; upload/exclusão registram jobs; API admin gera relatório e pode reprocessar verificação segura | `src/lib/storage/reconciliation.ts`, `src/app/api/admin/storage/reconcile/route.ts`, rotas de upload/delete |
| Listagens sem paginação | APIs e páginas de certificados, clientes e avisos usam `page`, `pageSize`, `range`, `count: exact` e componente de paginação | `src/lib/pagination.ts`, páginas e APIs de listagem |
| Token público em claro | Novo link salva só `token_hash`; rota pública consulta por hash; links antigos são invalidados pela migration | `src/lib/download/token.ts`, link/download APIs, SQL |
| Financeiro vendo campos operacionais | API de eventos monta DTO por perfil; financeiro não recebe idempotência, reserva, token hash, resposta bruta ou erro técnico bruto | `src/app/api/notifications/events/route.ts` |
| Status obsoleto | `refresh_certificado_statuses` recalcula `ativo/vencendo/vencido`; backend chama antes de dashboard/listagem/rebuild/cron; vencimento hoje é `vencido` | `src/lib/certificados/status.ts`, `src/lib/notifications/engine.ts`, SQL |
| Encoding quebrado | Busca runtime por `Ã`/`â` sem ocorrências; labels críticos de status estão em UTF-8 correto | `src/lib/certificados/status-labels.ts`, validação por `rg` |
| PFX real não documentado | Roteiro manual criado sem incluir certificados reais no repo | `VALIDACAO_PFX_REAIS.md` |

## 4. SQL e aplicação no Supabase

Para projeto novo:

1. Abrir o SQL Editor do Supabase.
2. Colar e executar `supabase_schema.sql`.
3. Confirmar bucket privado `certificados-pfx`.

Para banco existente:

1. Executar `supabase/migrations/20260708160000_post_audit_critical_fixes.sql`.
2. Links antigos que ainda usavam `token_publico` serão invalidados e devem ser recriados.
3. Confirmar que `storage_reconciliation_jobs` existe.
4. Confirmar que a função `refresh_certificado_statuses` existe.

## 5. Testes executados

- `npm.cmd run lint`: passou sem warnings.
- `npm.cmd run build`: passou.
- `npm.cmd --prefix desktop-bot run lint`: passou.
- Busca runtime por `token_publico`: não há uso fora de comandos de migração/drop.
- Busca runtime por TTL antigo de `60 seconds`: não há uso fora de migrations antigas.
- Busca runtime por `limit(200)`/`limit(300)`: não há uso nas listagens corrigidas.
- Busca runtime por mojibake `Ã`/`â`: sem ocorrências.

## 6. Testes manuais obrigatórios

- Criar link novo, copiar URL/senha, baixar uma vez e confirmar segundo uso bloqueado.
- Confirmar no banco que `links_download` tem `token_hash` e não tem token puro.
- Rodar `POST /api/admin/storage/reconcile` como admin.
- Rodar `POST /api/admin/storage/reconcile` com `{ "reprocess": true }` em homologação.
- Criar aviso pendente, configurar delay máximo 60s e confirmar que a mesma mensagem não é reservada novamente antes do ACK final.
- Entrar como financeiro e chamar `GET /api/notifications/events`; confirmar DTO reduzido.
- Testar certificados com vencimento hoje, futuro dentro da janela e futuro fora da janela.
- Seguir `VALIDACAO_PFX_REAIS.md` com PFX ICP-Brasil real em homologação.

## 7. Riscos residuais

- Postgres e Supabase Storage continuam sem transação distribuída real; a reconciliação reduz o risco e dá rastreabilidade, mas não torna a operação atômica.
- O reprocessamento de reconciliação não apaga arquivos automaticamente; remoção de órfãos deve ser decisão administrativa explícita.
- Bot WhatsApp ainda depende de WhatsApp Web e pode quebrar por mudanças do próprio WhatsApp.
- Validação com PFX ICP-Brasil/AES ainda precisa ser executada com arquivos reais fora do repositório.
- Dashboard ainda usa múltiplas contagens; para bases muito grandes, a próxima otimização recomendada é uma RPC agregada.

## 8. Próximos passos

1. Aplicar a migration no Supabase de homologação.
2. Rodar os testes manuais de link, bot e reconciliação.
3. Executar validação com PFX reais.
4. Promover para produção somente após confirmar Storage privado, RLS e variáveis de ambiente.
