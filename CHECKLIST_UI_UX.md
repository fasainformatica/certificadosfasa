# Checklist UI/UX

## Tipografia

- [x] Títulos de página padronizados com `SectionHeader`.
- [x] Subtítulos objetivos e orientados a tarefa.
- [x] KPIs com número em destaque e contexto curto.
- [x] Dados secundários em menor peso visual.

## Espaçamentos

- [x] Cards e tabelas com padding vertical mais confortável.
- [x] Grids responsivos em KPIs, formulários e listas.
- [x] Ações agrupadas com espaçamento consistente.

## Cores

- [x] Background geral neutro frio.
- [x] Superfícies principais brancas.
- [x] Azul reservado para ação principal e navegação ativa.
- [x] Verde, âmbar, vermelho e cinza usados com significado de status.

## Cards

- [x] Cards de métrica refatorados.
- [x] Cards de atenção operacional no dashboard.
- [x] Cards de resumo operacional em clientes.
- [x] Cards de resumo operacional em configurações.
- [x] Cards responsivos para certificados/clientes em mobile.
- [x] Sombras discretas e bordas suaves.

## Tabelas

- [x] Cabeçalho sticky em `DataTable`.
- [x] `scope="col"` nos cabeçalhos.
- [x] Linhas com hover e foco visível.
- [x] Informação principal e secundária agrupadas.
- [x] Alternativas em cards para telas menores.

## Formulários

- [x] Labels acima dos campos.
- [x] Labels associados aos inputs em upload, importação, login e download.
- [x] Labels associados aos inputs editáveis no detalhe do certificado.
- [x] Textos auxiliares onde há risco de dúvida.
- [x] Estados de erro próximos à ação.
- [x] Dias de antecedência em chips na configuração.
- [x] Resumo de impacto antes de salvar configurações.
- [x] Campos bloqueados durante envio/importação para evitar submissão duplicada.

## Botões

- [x] Ações com verbo e objeto claros.
- [x] Estados disabled durante processamento.
- [x] Ícones lucide em ações principais.
- [x] Ações destrutivas com tom de perigo.
- [x] Texto local de processamento em botões sensíveis.

## Estados

- [x] Empty states em certificados, clientes, avisos e WhatsApp.
- [x] Busca sem resultado com mensagem específica.
- [x] Estados locais de loading em botões.
- [x] Progressbar por lote na importação em massa.
- [x] Resumo operacional no detalhe do certificado.
- [x] Resumo operacional na listagem de clientes.
- [x] Resumo operacional na tela de configurações.
- [x] Skeletons padronizados.
- [x] Mensagens de erro sem stack trace ou segredo.

## Responsividade

- [x] Sidebar mobile em drawer.
- [x] KPIs empilháveis.
- [x] Tabelas adaptadas para cards.
- [x] Formulários em uma coluna no mobile.
- [ ] Validação visual final em 360px, 390px, 768px, 1024px, 1280px e 1440px. Bloqueada nesta sessão porque o navegador integrado não estava disponível.

## Acessibilidade

- [x] `aria-current` na navegação ativa.
- [x] `aria-expanded` e `aria-controls` no drawer mobile.
- [x] Escape fecha o drawer.
- [x] `role="alert"` para erros.
- [x] `role="status"` para progresso.
- [x] `role="progressbar"` na importação em massa.
- [x] `aria-describedby` e `aria-invalid` em campos sensíveis.
- [x] `role="alert"` e `role="status"` em ações sensíveis do detalhe do certificado.
- [x] `aria-busy` no formulário de configurações durante salvar ou atualizar planejamento.
- [x] Status não dependem apenas de cor.
- [ ] Validação visual final de foco e contraste. Bloqueada nesta sessão porque o navegador integrado não estava disponível.

## Textos

- [x] Títulos e subtítulos principais revisados.
- [x] Status humanos padronizados.
- [x] Botões com ações explícitas.
- [x] Placeholders de busca específicos.
- [x] Mensagens de API/validação com acentuação revisada.
- [x] Upload e importação com mensagens de erro e processamento orientadas a ação.
- [x] Detalhe do certificado com grupos de informação e dados técnicos separados.
- [x] Clientes com badges humanos para contato e avisos.
- [x] Configurações com envio automático, cadência, janela, limites e templates em linguagem humana.

## Encoding

- [x] Busca refinada por mojibake real em arquivos ativos.
- [x] Correções de acentuação em telas, APIs e documentos finais.
- [x] Entregáveis finais reescritos em UTF-8.
- [x] Arquivos mantidos em UTF-8.
