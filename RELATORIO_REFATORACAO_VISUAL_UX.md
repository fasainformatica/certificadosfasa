# Relatório de Refatoração Visual e UX

## Resumo

Refatoração visual controlada do painel administrativo Fasa Certificados Digitais, preservando rotas, contratos de API, RBAC, autenticação, banco, Storage, notificações, dispatchers WhatsApp e integrações. A interface foi reorganizada para funcionar como um centro operacional orientado a tarefas.

## Problemas encontrados

- Hierarquia visual fraca em cards, tabelas e cabeçalhos.
- Tabelas densas, com dados principais e secundários no mesmo peso.
- Textos técnicos ou vagos em WhatsApp, avisos, upload, importação e configurações.
- Estados de carregamento e erro inconsistentes em fluxos sensíveis.
- Logs e falhas operacionais com risco de expor detalhe técnico demais.
- Entregáveis finais antigos continham mojibake real.

## Direção visual adotada

- Background neutro frio, superfícies brancas, bordas suaves e sombras discretas.
- Azul reservado para ação principal e estados interativos.
- Verde, âmbar, vermelho e cinza usados com significado operacional.
- Cards e tabelas com contraste maior entre informação principal e auxiliar.
- Layouts responsivos com cards e grids para reduzir compressão em telas menores.

## UX Writing

- Padronizados títulos, subtítulos, ações, status e mensagens de erro.
- "Painel" aparece como "Visão geral" quando o contexto permite.
- "Avisos" aparece como "Central de avisos".
- "Canal WhatsApp" aparece como "Automação do WhatsApp".
- "Pendentes" aparece como "Mensagens na fila".
- "Falhas" aparece como "Envios com falha".
- Erros técnicos foram trocados por mensagens compreensíveis e orientadas a ação.

## Problemas de encoding corrigidos

- Reescritos `RELATORIO_REFATORACAO_VISUAL_UX.md`, `UX_WRITING_MAP.md` e `CHECKLIST_UI_UX.md` em UTF-8 correto.
- Varredura refinada por mojibake real nos arquivos ativos retornou `mojibake_hits=0`.
- Mantidos nomes técnicos sem tradução quando fazem parte de campos internos, enums, rotas ou códigos de auditoria.

## Componentes criados

- `src/lib/certificados/upload-presentation.ts`
- `src/lib/certificados/bulk-import-presentation.ts`
- `src/lib/certificados/detail-presentation.ts`
- `src/lib/clientes/presentation.ts`
- `src/lib/auth/login-presentation.ts`
- `src/lib/configuracoes/presentation.ts`
- `src/lib/notifications/event-presentation.ts`
- `src/lib/whatsapp/manual-notice-presentation.ts`
- `src/lib/whatsapp/operational-safety.ts`
- `src/lib/whatsapp/phone-quality.ts`

## Componentes refatorados

- `SectionHeader`
- `StatCard`
- `StatusBadge`
- `DataTable`
- `FilterBar`
- `EmptyState`
- `LoadingSkeleton`
- `PaginationBar`
- `AppShell`
- Listagem de clientes, formulários de upload, importação, detalhe do certificado, login, download público e configurações.
- `/configuracoes` agora exibe resumo operacional de envio automático, dias de aviso, janela, cadência, limites WhatsApp e templates antes de salvar.

## Telas alteradas

- `/dashboard`
- `/certificados`
- `/certificados/novo`
- `/certificados/importar`
- `/certificados/[id]`
- `/clientes`
- `/notificacoes`
- `/whatsapp`
- `/configuracoes`
- `/login`
- `/download/[token]`

## Responsividade

- Sidebar mobile em drawer.
- KPIs e formulários em grids responsivos.
- Tabelas principais com leitura em cards quando necessário.
- Clientes, upload, importação e detalhe do certificado mantêm campos e ações legíveis em telas menores.

## Acessibilidade

- Navegação com `aria-current`.
- Drawer com `aria-expanded`, `aria-controls` e Escape.
- Tabelas com cabeçalhos usando `scope="col"`.
- Feedbacks com `role="alert"` ou `role="status"`.
- Importação em massa com `role="progressbar"`.
- Upload individual com labels associados, `aria-describedby`, `aria-invalid` e campos bloqueados durante envio.
- Detalhe do certificado com feedback acessível em senha PFX, link de download, edição de cliente e exclusão.
- Clientes com badges textuais para contato e avisos, sem depender apenas da cor.
- Configurações usa cards textuais de estado, `aria-busy` no formulário e feedback com `role="alert"`/`role="status"` para salvar, atualizar planejamento e destinatários.

## Estados adicionados

- Empty states específicos em certificados, clientes, avisos, WhatsApp e buscas sem resultado.
- Estados locais de processamento em upload, importação, aviso manual, conexão WhatsApp, verificação de número, mensagem de teste e configurações.
- Progressbar por lote na importação em massa.
- Resumo operacional no detalhe do certificado, com próxima ação e vencimento em linguagem humana.
- Resumo operacional em clientes, com contato, avisos e responsável em linguagem humana.
- Resumo operacional em configurações, com envio automático, cadência, janela, limites e templates em linguagem humana.
- Erros humanos para falha de upload/importação, configurações e comunicação com servidor.

## Arquivos alterados

- `src/app/(internal)/**`
- `src/app/(auth)/login/**`
- `src/app/download/[token]/**`
- `src/app/api/certificados/[id]/aviso/route.ts`
- `src/app/api/whatsapp/automation/**`
- `src/components/layout/**`
- `src/components/ui/**`
- `src/lib/auth/**`
- `src/lib/certificados/**`
- `src/lib/configuracoes/**`
- `src/lib/dashboard/**`
- `src/lib/notifications/**`
- `src/lib/whatsapp/**`
- `tests/**`
- `docs/SYSTEM_CONTEXT.md`
- `docs/06_FRONTEND.md`
- `CHANGELOG.md`
- `RELATORIO_REFATORACAO_VISUAL_UX.md`
- `UX_WRITING_MAP.md`
- `CHECKLIST_UI_UX.md`
- `.gitignore`

## Testes executados

- `npm test`: passou, com 20 arquivos de teste e 66 testes; guarda service-role/RBAC passou.
- `npx tsc --noEmit --pretty false`: passou.
- `npm run lint`: passou.
- `npm run build`: passou.
- `git diff --check`: passou; apenas avisos CRLF do Windows.
- Varredura refinada de mojibake real nos arquivos ativos: passou.
- Smoke HTTP local em `http://localhost:3000`:
  - `/login`: 200.
  - `/dashboard`: 307 para autenticação, esperado sem sessão.
  - `/configuracoes`: 307 para autenticação, esperado sem sessão.
  - `/certificados/novo`: 307 para autenticação, esperado sem sessão.
  - `/certificados/importar`: 307 para autenticação, esperado sem sessão.

## Validação visual

O servidor local foi iniciado em `http://localhost:3000`. O navegador integrado da sessão não estava disponível (`Browser is not available: iab`), então não foi possível capturar screenshots automatizados autenticados. A validação visual desta etapa ficou limitada à inspeção de código, build, smoke HTTP local e verificação de estados/atributos acessíveis.

## Riscos restantes

- Falta confirmação de manual oficial de marca, fonte institucional e resolução mais comum dos usuários internos.
- Validação visual autenticada em desktop/tablet/mobile ainda depende de navegador disponível e sessão Supabase.
- A importação em massa continua dependente da estrutura de pastas e dos limites já existentes no backend.
- Migrations pendentes precisam ser aplicadas no Supabase quando a alteração correspondente for promovida.

## Próximos passos

- Capturar screenshots autenticados nos breakpoints principais quando o navegador estiver disponível.
- Fazer uma revisão manual com usuários internos sobre densidade, textos e prioridade operacional.
- Aplicar migrations pendentes no Supabase antes de usar recursos que dependem de novos campos.
