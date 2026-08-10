# Frontend

Documento especifico. A fonte oficial completa continua sendo [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md).

## Rotas principais

- `/login`: autenticacao.
- `/dashboard`: metricas do sistema.
- `/clientes`: listagem e cadastro de clientes.
- `/certificados`: listagem de certificados.
- `/certificados/novo`: upload individual.
- `/certificados/importar`: importacao em massa.
- `/certificados/[id]`: detalhe, situacao de renovacao, link publico, edicao de cliente, senha PFX sob autorizacao extra e aviso manual.
- `/notificacoes`: eventos, destinatarios e status.
- `/notificacoes-internas`: historico interno do painel, acessado pelo sininho.
- `/configuracoes`: configuracoes de avisos e templates.
- `/whatsapp`: homologacao e monitoramento euAtendo.
- `/download/[token]`: download publico.

## Componentes

- Layout: `src/components/layout`.
- UI base: `src/components/ui`.
- Marca: `src/components/brand`.
- Formularios de certificado: `src/app/(internal)/certificados/**`.
- Painel WhatsApp: `src/app/(internal)/whatsapp/canal-whatsapp-panel.tsx`.

## Padrao

- Telas internas usam Server Components quando possivel.
- Componentes interativos ficam como Client Components locais.
- Acoes sensiveis chamam APIs server-side.
- Dados secretos nunca sao expostos ao browser, exceto a senha PFX revelada explicitamente para `admin` ou `financeiro` apos senha administrativa e auditoria.

## Refatoracao visual e UX

Atualizacao de 2026-07-15:

- O painel passou a seguir uma hierarquia operacional: atencoes primeiro, estado da operacao depois, indicadores principais e dados de apoio em seguida.
- A navegacao usa os termos Visao geral, Certificados, Clientes, Central de avisos, WhatsApp e Configuracoes.
- O shell interno tem sidebar mais discreta no desktop e drawer acessivel no mobile.
- Cabecalhos de pagina usam `SectionHeader` com titulo, subtitulo e acoes consistentes.
- KPIs usam `StatCard` com icone, numero, rotulo direto e contexto curto.
- Tabelas usam `DataTable`, cabecalho sticky, `scope="col"`, linhas mais escaneaveis e cards responsivos no mobile quando necessario.
- Filtros usam `FilterBar`, busca principal, contador de resultados e acoes Aplicar filtros/Limpar filtros.
- Estados vazios usam `EmptyState` com titulo especifico, descricao e acao quando aplicavel.
- Feedbacks de erro e processamento usam mensagens orientadas a acao, sem stack trace, token, service role, storage path ou payload bruto do provider.
- Dias de aviso em Configuracoes sao editados como chips numericos, mantendo o contrato de API como array de numeros.
- Certificados usam filtro e resumo de situacao de renovacao, incluindo `Sem retorno`. Por padrao, `/certificados` mostra itens em acompanhamento; a listagem e o detalhe devem explicar impacto no planejamento e proxima acao sem renomear o enum persistido.
- Clientes usa cards de resumo operacional, badges de completude de contato, status humano de aviso ao cliente e estado vazio com acao contextual.
- Dashboard prioriza KPIs, graficos, lista "Precisa de atencao" e resumo de avisos/WhatsApp, sem o bloco intermediario de resumo operacional.
- Login interno usa texto claro de acesso, mensagens de erro sem detalhe tecnico, `aria-describedby`, `aria-invalid` e controle de mostrar/ocultar senha.
- Download publico usa estado de link disponivel/indisponivel, orientacao sobre senha temporaria, feedback acessivel e texto sem expor token, storage path ou senha real do PFX.
- Upload individual usa resumo do arquivo selecionado, mostrar/ocultar senha do PFX, labels associados, estado disabled durante envio, erro com `role="alert"` e texto de processamento `Enviando certificado`.
- Importacao em massa usa resumo da selecao, alerta para arquivos ignorados, progressbar por lote com `role="progressbar"`, `role="status"` para andamento e acao `Limpar selecao` antes do envio.
- Detalhe do certificado usa resumo operacional, grupos de dados de cliente/certificado/renovacao, area tecnica separada sem `storage_path`, hash reduzido na apresentacao e feedback acessivel em senha PFX, link de download, edicao de cliente e exclusao.
- Configuracoes usa `buildConfiguracoesOperationalSummary` para resumir envio automatico, dias de aviso, janela, cadencia, limites de WhatsApp e templates antes de salvar; acoes de salvar, atualizar planejamento e destinatarios tratam falha de rede com mensagem humana e encerram o estado de carregamento.
- A base de notificacoes internas usa `internal_notifications` e `internal_notification_reads` para alimentar o sininho, a central `/notificacoes-internas`, pop-ups do navegador e o cliente leve do Windows em `tools/windows-notifier`. As APIs `GET /api/internal-notifications`, `GET /api/internal-notifications/summary`, `GET /api/internal-notifications/windows/summary`, `POST /api/internal-notifications/[id]/read` e `POST /api/internal-notifications/[id]/dismiss` estao prontas. Upload individual e importacao em massa ja registram `certificate_created` e `certificate_updated`.
- O componente `InternalNotificationsMenu` substitui o sino estatico do header por contador de nao lidas, popover responsivo, loading local, erro humano, estado vazio, atalhos para o certificado, acao `Marcar lida`, acao `Dispensar`, `aria-expanded`, `role="dialog"`, `aria-live`, link `Ver central completa` e controle `Ativar pop-ups`.
- A rota `/notificacoes-internas` usa Server Component, autentica com `requireInternalUser`, reaplica filtros de visibilidade antes de consultar via service role, mostra KPIs de ativas/nao lidas/atencao/dispensadas, filtros rapidos de estado, busca textual, filtros por tipo e prioridade, tabela no desktop, cards no mobile, estado vazio e paginacao acessivel.
- Pop-ups do navegador usam `src/lib/internal-notifications/browser-notifications.ts` para evitar aviso de historico antigo, exibir apenas novas notificacoes, respeitar permissao explicita do navegador, abrir `/notificacoes-internas` ou o certificado ao clicar e manter a decisao em `localStorage`. Isso funciona enquanto o painel estiver aberto no navegador.
- O cliente Windows usa PowerShell/NotifyIcon e o endpoint read-only protegido por `WINDOWS_NOTIFIER_TOKEN`; ele nao usa sessao do navegador, nao acessa Supabase diretamente e nao altera estado de leitura.

## Tokens visuais

- Background geral: neutro frio (`--color-background`).
- Superficie: branco ou `--color-surface-muted`.
- Texto principal: `--color-text-primary`; texto auxiliar: `--color-text-secondary`.
- Borda: `--color-border-subtle`.
- Acao principal: azul institucional existente.
- Status: verde para sucesso, ambar para atencao, vermelho para falha e cinza para neutro.
- Raios: `rounded-xl`/`rounded-2xl` para controles e cards; evitar `rounded-3xl` em novas superficies.
- Sombras: discretas, preferindo borda e contraste de superficie.

## Vocabulário de interface

- Painel deve aparecer como Visao geral quando o contexto permitir.
- Avisos deve aparecer como Central de avisos no titulo da tela.
- Canal WhatsApp deve aparecer como Automacao do WhatsApp no titulo da rota.
- API configurada deve aparecer como Integracao configurada.
- Instancia deve aparecer como Instancia conectada quando for status operacional.
- Pendentes deve aparecer como Mensagens na fila.
- Falhas deve aparecer como Envios com falha quando o contexto for envio.
- Testar conexao deve aparecer como Validar conexao.
- Enviar teste deve aparecer como Enviar mensagem de teste.
- Verificar deve aparecer como Verificar numero.
- Filtrar deve aparecer como Aplicar filtros quando houver formulario de filtros.

## Cuidados

- Nao exibir senha real do PFX fora da acao controlada "Mostrar senha" no detalhe do certificado.
- Nao exibir `storage_path` utilizavel.
- Nao expor token euAtendo ou service role.
- Confirmar responsividade em tabelas e acoes compactas.
- Manter textos de erro sem detalhes sensiveis.
- Confirmar contraste, foco visivel, labels de formulario, `aria-current`, `aria-expanded`, `role="alert"` e `role="status"` nas telas alteradas.
