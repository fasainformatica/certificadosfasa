# Relatório das etapas 0, 0.5, 1 e 2

## Limite da rodada

Especificação visual fornecida em Downloads prevalece sobre prompt e auditoria revisão 2. Os três documentos foram lidos antes das edições desta rodada. Etapas 3 a 9 não foram executadas; a composição final das telas continua pendente. Não houve envio de WhatsApp, validação de conexão, reenfileiramento, alteração de banco, migration, permissões ou regras de envio.

O diretório já possuía modificações anteriores. Elas foram preservadas; não equivalem a trabalho novo desta rodada.

## Etapa 0 — evidência e limitações

- Login realizado com conta de teste autorizada. Credencial não foi adicionada a código, fixture ou relatório.
- 20 capturas em `docs/auditoria/antes/`: cinco rotas, larguras 1920, 1366, 1024 e 390, altura 1000. Chromium 156, Windows, viewport em CSS px.
- Limitação: a sessão ficou disponível após o início dos tokens. Portanto as capturas não são uma linha de base imutável anterior a toda mudança desta rodada. Algumas capturas da dashboard incluem skeleton dos gráficos lazy; não servem para aprovar geometria final de gráfico. Não apresentar essa evidência como uma comparação visual perfeita.
- D01: inspeção do CSS computado em quatro `.fasa-panel` da dashboard confirmou fundo `rgb(255,255,255)`, borda `1px` e sombra `rgba(16,24,40,0.05) 0px 1px 2px`. Não reproduzida a ausência de superfície no ambiente atual. Não foi provado que o problema anterior era cache.
- As imagens incluem dados reais internos e podem conter o dado de S01. Permanecem locais, fora dos commits desta rodada; não publicar essas imagens sem revisão de confidencialidade.
- Levantamento das métricas: `metricas.md`. Script de investigação `read-only-summary.mjs`: somente SELECT, saída agregada, sem nomes, telefones, mensagens renderizadas ou credenciais.

## Etapa 0.5 — fundação

- Tokens e aliases no Tailwind, tipografia Inter via `next/font/google`, escala de títulos e superfícies conforme especificação.
- Biblioteca de componentes em `src/components/ui/spec/`: KpiCard/KpiGrid, StatusBadge, Panel, Button, FilterBar, DataTable, AlertBanner, Tabs, KeyValueList, StatInline, Disclosure e HelpTip, com formatadores e mapa de status.
- A pasta `spec` separa os contratos novos dos componentes legados ainda usados nas telas. Isso evita converter de uma vez as etapas 3 a 7. A adoção por tela ocorrerá nessas etapas, não foi declarada concluída agora.
- Shell ajustado: tokens de sidebar, dimensões, ícones, header, alinhamento à esquerda, drawer e cabeçalho da página. Engrenagem removida: mesmo destino `/configuracoes` da lateral, E05 confirmado.
- Sino: definição de avisos internos da conta, distinta de eventos de WhatsApp, e nome acessível com contagem. Não mudou consulta ou visibilidade.

## Etapa 1 — S01, S02 e N11

### S01 — investigação, sem alterar dado

`src/lib/notifications/engine.ts` usa `cliente.nome_razao_social` nas substituições `cliente_nome` e `empresa_nome` de `renderCertificateTemplate`; o resumo de vencidos também inclui nome do cliente. Eventos persistem `mensagem_renderizada` e payload de planejamento. Os dispatchers usam a mensagem renderizada no envio. Portanto um nome importado com conteúdo indevido pode propagar-se quando o template o inclui.

Não foi verificado conteúdo histórico bruto de mensagens nem logs para procurar o trecho específico: isso replicaria dado potencialmente sensível. O código confirma o caminho possível de propagação, não prova que esse trecho foi efetivamente entregue. Os logs técnicos usam mensagens de erro/provedor sanitizadas, mas não há evidência de que um trecho sensível embutido em um nome seja necessariamente reconhecido pela sanitização.

**DECISÃO S01:** Mauro confirmar se é credencial real; se for, rotacionar na origem e aprovar investigação protegida/limpeza dos registros afetados. Não foi criada máscara heurística e nenhum nome relacionado foi copiado para os artefatos textuais.

### S02 — origem dos padrões

`src/app/api/certificados/importar/route.ts` define `nome_razao_social` a partir de `stripExtension(pfxFile.name)`, com fallback para o nome da pasta. `stripExtension` só retira a extensão: não remove datas, prefixos ou sequências numéricas. A seleção de TXT/senha é feita separadamente; não é uma sanitização de nome. `src/lib/certificados/upload-service.ts` prioriza o nome do cliente existente/informado e possui fallback para titular do PFX ou nome do arquivo. O parser PFX fornece o titular, não limpa a razão social importada.

Conclusão: os padrões podem ser herdados literalmente do arquivo/pasta importado. Não foi possível atribuir cada registro histórico a um arquivo original específico sem acesso ao lote de importação e uma auditoria autorizada desse material. Nenhum banco foi limpo.

### N11 — reenfileiramento visual

- Eventos novos guardam `payload.data_vencimento` no planejamento. A lista passou a ler esse campo.
- Helper compara apenas datas ISO válidas do payload e certificado atual; não infere validade a partir de data programada ou dias restantes.
- Validade atual posterior à referência: botão de retry substituído pelo texto exato da especificação, “Certificado renovado”, com explicação contextual. A especificação prevalece sobre a frase mais longa do prompt.
- Referência ausente/inválida: não é inventada. O helper retorna referência desconhecida. Não se pode declarar que eventos legados sem referência estão protegidos pela comparação.
- Endpoint `POST /api/notifications/events/[id]/retry`: atualiza status permitido, mas não lê certificado/payload para comparar validades. Não foi alterado.
- **DECISÃO N11:** aprovar proteção equivalente no servidor e definir tratamento de eventos legados sem referência. Ocultar botão não bloqueia chamada direta ao endpoint.

## Etapa 2 — conclusões X

| ID | Conclusão |
|---|---|
| X01 | As fontes antigas misturavam RPC da dashboard, eventos e logs do canal. Leitura compartilhada passa a contar eventos com status `failed`, sem cancelados; não é contagem de tentativas. Na investigação, há 3 eventos failed: 1 da extensão e 2 euAtendo. |
| X02 | Confirmado por SELECT agregado: 701 pending futuros, 2 pending de hoje e 2 pending anteriores, todos da extensão. Logo 705 = 701 futuros + 4 vencidos por data de programação. Não confirmado estoque antigo preso de 705 mensagens. Nenhum registro apagado ou alterado. |
| X03 | Último envio deve vir de `notification_events.sent_at` para status sent, todos os canais, sem confundir com logs de atividade nem timestamp do dispatcher. A leitura é compartilhada; horários formatados no fuso operacional. |
| X04 | `whatsapp_dispatcher_state.last_dispatch_at` é estado de despacho/cadência do provider, não prova de cada consulta da extensão nem de entrega. Logs posteriores não contradizem necessariamente esse campo. Não rebatizado como verificação sem evidência. |
| X05 | Contagem por tipo é de eventos, inclui histórico/cancelados conforme definição; não é número de certificados. Renomeação final dos cards pertence à etapa 6. |
| X06 | Base observada: 130 certificados, 114 operacionais, 2 cliente_inativo. A regra operacional exclui inválidos e renovação não planejável; inclui em_acompanhamento e renovou_fasa. O 114 não inclui os 2 inativos. Não somar os cards de renovação. |
| X07 | 130 clientes, nenhum sem certificado vinculado na leitura atual. A consulta de Clientes não exige vínculo: a coincidência atual não garante isso no futuro. Subtítulo deve descrever cadastro/contato sem prometer vínculo obrigatório. |
| X08 | Sino conta avisos internos não lidos elegíveis para usuário/cargo, não expirados e não dispensados. Não é fila/falha de WhatsApp. A definição foi incluída no menu. |
| X09 | Rótulo de apresentação da extensão acentuado; identificador persistido preservado. |

## Outros itens “A verificar” — conclusão e fronteira

| ID | O que foi possível concluir nesta rodada |
|---|---|
| D13 | Não validado geometria da rosca em zoom 100%; pertence à etapa 3. Não alterar padAngle/activeShape nesta rodada. |
| F08 | O filtro atual usa estados de renovação planejáveis, não igualdade simples; investigação detalhada e apresentação pertencem à etapa 4. O 114 operacional não prova sozinho filtro incorreto. |
| C09 / E03 | Filtros e links ainda precisam da implementação por tela nas etapas 4/5/8. Não declarar concluídos. |
| N12 | SELECT agregado encontrou 8 chaves repetidas por tipo/certificado/recipient_id/dia. Isso não prova entrega duplicada; destinatários removidos podem compartilhar null e a chave não considera conteúdo nem telefone. **DECISÃO:** investigar eventos específicos com acesso protegido e aprovar eventual correção de idempotência. Agrupamento visual fica para etapa 6. |
| N13 | `getSafeNotificationErrorMessage` recebe motivo sem status; uma string genérica pode virar mensagem de falha em linha cancelada. Ajuste de apresentação fica para etapa 6; não mudou status salvo. |
| N14 | Lista usa relação opcional de destinatário: ausência da relação gera rótulo de removido. Isso não comprova se foi removido antes ou depois do envio; não inventar cronologia. |
| N15 | Mesmo final mascarado não prova mesmo número; contato atual não prova contato usado historicamente. Não foi feita consulta de telefones/mensagens brutos. Permanece investigação protegida, sem reescrever histórico. |
| N18 | `recipient_id` seleciona um cadastro específico; `audience` seleciona client/internal. Não são a mesma dimensão. A especificação da etapa 6 precisa preservar essa distinção. |
| W14 / W16 | Proteção por falhas usa `whatsapp_auto_pause_enabled`, limiar e `whatsapp_failure_pause_window_minutes`; janela configurável, não presumir uma hora. Texto final fica para etapa 7. |
| W15 | Há datas e bloqueios conhecidos no código, mas os números da captura não provam a causa da paralisação. Não executado dispatcher nem conexão; não afirmado motivo específico. Implementar somente motivos comprovados na etapa 7. |
| E05 | Confirmado: engrenagem e lateral levavam a `/configuracoes`. Duplicação removida no shell. |

## Pendências DECISÃO

1. **S01:** confirmar natureza do dado, rotação se for segredo e autorização para auditoria histórica protegida.
2. **N11 servidor:** aprovar validação de validade no retry e política para referência ausente; a UI não é barreira de segurança.
3. **N12:** confirmar testes históricos versus repetição indevida e autorizar correção de idempotência somente se comprovada.
4. **X02:** não há decisão de limpeza necessária com a evidência atual: 701 são futuros. Se os 2 pending anteriores estiverem presos operacionalmente, isso requer investigação distinta; não foram descartados.
5. **Links/enum da especificação:** etapas seguintes deverão mapear parâmetros visuais para enums existentes, sem renomear valores salvos. Não criar filtros sem suporte silenciosamente.

## Validação e comparação

- `npx tsc --noEmit --pretty false`: passou.
- `npm run lint`: passou, sem warnings na última execução.
- `npm test`: 43 arquivos, 321 testes aprovados; verificação service-role/RBAC aprovada. Testes novos usam dados sintéticos/mocks, não enviam mensagens.
- `npm run build`: passou, incluindo carregamento da fonte Inter.
- `git diff --check`: sem erro de whitespace; apenas avisos de normalização LF/CRLF do Windows.
- 20 capturas adicionais em `docs/auditoria/depois/`, mesmas larguras/altura, com espera por fontes e primeiro gráfico na dashboard. Na comparação, requisições não GET/HEAD sob `/api/` foram bloqueadas no navegador por precaução. Não são aprovação das etapas visuais 3–7.
- Drawer mobile: `aria-modal=true` ao abrir; Escape fecha e devolve foco ao botão, confirmado por Playwright na sessão real.
- N11 na sessão real: existem rótulos “Certificado renovado” nas duas renderizações responsivas da Central; os 26 nós encontrados não significam 26 eventos distintos (desktop e mobile coexistem no DOM). Nenhum botão foi acionado.
- Comparação visual inspecionada: dashboard 1920 depois da integração. Restam os ajustes da etapa 3 (incluindo gráficos e zero neutro), intencionalmente não executados.

## Commits e status dos IDs

- `3d40be7`: etapa 0.5, fundação/componentes/shell; E05 e descrição de X08. Arquivos compartilhados já tinham alterações visuais locais relacionadas, preservadas na consolidação; não houve descarte de trabalho.
- `2a190d9`: etapa 1, helper e testes N11.
- `e8db85c`: etapa 2, X01–X09, integração das métricas e da regra N11 na Central; `metricas.md` e investigação agregada somente leitura.
- S01/S02: investigação realizada, sem saneamento de nomes; pendências acima.
- Etapa 0: métricas e captura feitas, com ressalva da linha de base registrada acima. Não pode ser declarada comparação anterior perfeita.
- As etapas 3–9 e seus IDs visuais não foram executados nesta rodada. N10 continua encerrado, sem alteração.
- Alterações anteriores fora dos arquivos consolidados continuam no diretório de trabalho; não foram incluídas automaticamente nos commits desta rodada.
- Sem push ou deploy. Capturas com dados reais não foram incluídas nos commits.

As credenciais de teste fornecidas na conversa não devem ser publicadas. Recomenda-se trocar a senha dessa conta ao encerrar a homologação.


---

# Segunda rodada: perguntas, N11/N12 e etapas 3, 4 e 5

Trabalho iniciado no Codex e concluído no Claude Code a partir do ponto em que a sessão foi interrompida. Parada após a etapa 5. Sem envio real, push, deploy ou alteração manual de banco, fila ou permissões.

## Respostas

1. "Futuros: 0" vinha da RPC legada `get_dashboard_metrics`, que ainda devolve 0 futuros, 0 na fila, 2 falhas e último envio em 16/07/2026. A leitura compartilhada conta 701 futuros.
2. Valores em 23/11/2026, por volta das 15h55 (a extensão de produção enviou 4 avisos durante o dia, por isso a fila caiu de 4 para 0):

| Tela | Fila | Falhas | Último envio |
|---|---|---|---|
| Visão geral | 0 | 3 | 23/11/2026 às 15:24 |
| Central | 0 | 3 | não exibe como indicador |
| WhatsApp | 0 | 3 | 23/11/2026 às 15:24 (formato antigo, etapa 7) |

3. Certificados: 130 no total, contando 2 inativos. CNPJ repetido em Clientes: nenhum.

## S01 (somente leitura)

- Cadastro original: 2 mensagens enviadas ao cliente; zero contêm o nome completo atual. Isso não exclui nome anterior ou trecho parcial.
- **Novo e urgente:** 9 cadastros contêm a palavra "senha" no nome. Em todos os eventos, 4 mensagens enviadas contêm essa palavra (30/07/2026 às 10:35 e 11:12, 05/11/2026 às 10:04, 20/11/2026 às 00:00, horário de São Paulo), 28 pendentes e 1 cancelada. As 28 pendentes coincidem em quantidade com as pendentes desses cadastros. Não foi verificado se cada ocorrência é uma senha real nem quem recebeu.
- **DECISÃO:** corrigir os 9 nomes não altera o texto já renderizado dos 28 avisos pendentes; eles precisam ser tratados também. Nada foi alterado.

## N11

Endpoint recusa (409) validade diferente da referência, referência sem validade atual, e falta de referência com programação há mais de 30 dias. Condição em `updated_at` evita corrida. O botão da Central ainda usa regra mais estreita: pode aparecer e receber 409 com mensagem clara. Alinhar na etapa 6.

## N12

Cinco grupos repetidos com chave que inclui telefone e canal (os 8 anteriores usavam chave mais ampla): 1 de teste manual (5 eventos), 3 da extensão (2 eventos cada, 4 a 5 minutos de intervalo) e 1 do euAtendo (2 eventos, 2,6 segundos).
Nenhum evento tem ID de mensagem do provedor nem recibo de entrega. `response_id` da extensão é código de ACK, não ID. **Entrega duplicada não pode ser confirmada nem descartada por IDs.** O banco registra dois envios em cada par; o do euAtendo é o mais suspeito pelo intervalo. Envio não alterado.

## Etapas 3 a 5

- Etapa 3 (D01–D14): seção 7 aplicada.
- Etapa 4 (F01–F10, X06): seção 8 aplicada. F08: filtro padrão "Todas", 130 de 130.
- Etapa 5 (C01–C10, X07): seção 9 aplicada; 38 com WhatsApp e 92 sem contato, iguais à tela WhatsApp. C07: "Novo certificado" leva a `/certificados/novo`, única criação existente; mantido como secundário. "Abrir cadastro" não tinha destino; foi criada `/clientes/[id]`, somente leitura.

Defeitos encontrados na tela real e corrigidos: Clientes não carregava com a sessão do usuário (`certificados(count)`); "0" ausente nas barras; Inter não aplicada (variável no body, usada no root); `font: inherit` global deixando botões em 16 px; datas com microssegundos viravam "Indisponível"; tooltip cortado na expansão.

## Escolhas e limites

- Larguras da especificação somam mais que o painel em 1280 e 1024: o mínimo da coluna de nome cede para não haver rolagem.
- Abaixo de 1280, Responsável (Clientes) vai para a expansão, como Renovação em Certificados.
- "Enviar aviso" nunca teve confirmação; nenhuma foi criada.
- Expansão de Certificados mantém observação e atualização do arquivo quando existem, para não perder informação.
- Links da Visão geral seguem a especificação, mas abrem listas com todos os estados de renovação: cards 7 e 0, listas 8 e 15. **DECISÃO:** filtrar também por acompanhamento ou mudar o escopo dos cards.
- Badge de conexão fixo em "Ainda não verificada": não há verificação registrada para ler; unificar na etapa 7.
- "Inválido" não existe no mapa de status; mantido só para dados legados.
- Central em 1024 px tem rolagem horizontal de 116 px; pertence à etapa 6.
- Central recebeu apenas aliases de leitura para `?aba=fila|hoje|falhas|enviados|nova_tentativa`.

## Validação

TypeScript, lint e 359 testes (47 arquivos) aprovados; build aprovado antes dos últimos ajustes de CSS e do formatador. Sem rolagem horizontal nas três telas em 1920, 1440, 1366, 1280, 1024, 768, 390 e em 640 px (equivalente ao zoom de 200% em 1280). Capturas em `docs/auditoria/depois-etapas-3-5/` (1920, 1366, 1024, 390), locais: contêm dados reais e não devem ser publicadas. O script `investigacao-decisoes.mjs` também ficou fora dos commits por identificar o cadastro de S01.


---

# Terceira rodada: etapas 6 e 7 e links da Visão geral

- **S01, avisos:** com autorização, 28 eventos pendentes foram cancelados; em seguida o pedido foi retirado e os 28 voltaram a pendente (`error_message` nulo, zero tentativas). Total de pendentes: 701, como antes. Apenas `updated_at` mudou. O primeiro está programado para 25/11/2026. Todos são para a equipe interna. Já as enviadas: 2 para a equipe interna e 2 para clientes; em uma delas a palavra não veio do nome do cadastro. Os 9 nomes continuam sem correção.
- **Links da Visão geral:** agora incluem `renovacao=em_acompanhamento`, o mesmo escopo dos cards. Desvio deliberado da seção 7.2, autorizado.
- **Etapa 6 (N01–N18):** seção 10 aplicada. Contagens, ordem e agrupamento usam o resultado inteiro. N11: o botão usa a mesma regra do endpoint e mostra a mensagem dele. N12: só envios concluídos são agrupados; falhas continuam separadas para não perder o reenvio.
- **Etapa 7 (W01–W21):** seção 11 aplicada; cada painel trata o próprio erro. W14: a pausa liga ao atingir o limite de falhas na janela configurada (hoje 60 minutos, "na última hora").

## Escolhas e limites

- "Pendentes" e "Na fila" usam a fila até hoje (X02). Futuros aparecem só em "Todos". "Hoje" e "Na fila" coincidem, para bater com o card "Avisos para hoje".
- N18: pessoa e público são dimensões diferentes; mantido o filtro "Pessoa da equipe". Com seis controles, a barra ocupa duas linhas em 1280–1440.
- Abaixo de 1366, Destinatário vai para a expansão; abaixo de 1280, Programado também.
- "Ignorado" não existe no mapa; aparece como "Cancelado". Evento de canal sem resultado final não recebe badge.
- "Retomar envio" e "Pausar" nunca tiveram confirmação; nenhuma foi criada.
- **DECISÃO:** "Validar conexão" consulta a euAtendo mesmo com a extensão como canal ativo. Não comprova a extensão.
- **DECISÃO:** o contador de envios do dia nos limites começa à meia-noite UTC (21h em São Paulo). É regra de envio; não alterada.

## Validação

TypeScript, lint e 368 testes aprovados. Central e WhatsApp sem rolagem horizontal em 1920, 1440, 1366, 1280, 1024, 768, 640 e 390. Capturas locais em `docs/auditoria/depois-etapas-6-7/`, com dados reais: não publicar. Requisições de escrita bloqueadas no navegador; reenvio, pausa, verificação e mensagem de teste não foram executados de verdade. Etapas 8 e 9 pendentes.


---

# Quarta rodada: decisões, etapas 8 e 9

## Decisões autorizadas

- **Conexão da extensão:** `messages` e `status` registram o contato autenticado que informa um número, no máximo uma vez por minuto, atualizando só `updated_at` em `whatsapp_dispatcher_state`. Sem migration e sem mudar trava, cadência ou último despacho; falha nessa gravação não impede o envio. "Validar conexão" passa a ler esse contato quando a extensão é o canal ativo: conectada até 10 minutos, senão "Falha na conexão" com a data. Visão geral e WhatsApp usam a mesma regra ao abrir. Prova que a extensão fala com o servidor, não que a sessão do WhatsApp entrega mensagens. **Só funciona por completo após o deploy**: até lá, a produção não grava contatos com a fila vazia.
- **Limite diário:** conta a partir da meia-noite do fuso configurado. Antes começava à meia-noite UTC (21h). Vale após o deploy.

## Etapa 8

E04: barra de filtros única em Certificados, Clientes e Central. E03: cards que contam pendências levam à lista filtrada. E05: engrenagem já removida. Superfícies: as cinco telas usam os componentes da especificação. `StatCard` e `fasa-panel` ficaram apenas em `notificacoes-internas`, fora do escopo.

## Etapa 9

- Cinco telas em 1920, 1440, 1366, 1280, 1024, 768, 640 (zoom de 200%) e 390: sem rolagem horizontal, sem select cortado, sem `-` isolado em tabela, sem controle sem nome.
- Contraste medido nos textos visíveis: nenhum abaixo de 4,5:1. Texto abaixo de 12 px: só o contador do sino (11 px, definido na seção 3.2).
- Teclado: 30 paradas por tela, foco visível em todas; expansão por Enter; drawer fecha com Esc e devolve o foco.
- Nomes longos: verificados com os cadastros reais. Estados vazio, zero e erro: testes automatizados.
- Não testados: leitor de tela, outros navegadores e as ações de escrita reais.
- O critério da auditoria "mais recentes primeiro" difere da seção 10.4 (pendente mais antigo primeiro); vale a especificação.
- Capturas em `docs/auditoria/depois-final/`, locais, com dados reais.
- TypeScript, lint, 371 testes e build.

## Pendências

S01 (9 nomes e 28 avisos pendentes), N12 (sem IDs para concluir) e o deploy.
