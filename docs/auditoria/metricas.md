# Metricas operacionais: etapa 2 (X01-X09)

## Escopo e evidencia

Leitura integral dos tres documentos de Downloads solicitados. Esta entrega se limita ao modulo `src/lib/metricas/operacao.ts`, suas integracoes nas paginas dashboard, notificacoes e whatsapp, testes e este documento. N11 foi integrado na Central por solicitacao adicional, com helper mantido pelo trabalho pai. Sem alteracao de backend, APIs, RBAC, migrations, regras de envio, cadencia ou dados. Sem disparo real e sem commit. Alteracoes preexistentes e concorrentes foram preservadas.

Evidencia estatica: consultas das paginas, `database/migrations/20260729120000_add_certificate_renewal_status.sql`, `database/schema/supabase_schema.sql`, dispatcher da extensao e euAtendo, resumo de notificacoes internas e lista de clientes/certificados. Nao foi presumido que o SQL local corresponda ao SQL implantado.

Evidencia agregada real fornecida pelo trabalho pai em 23/11/2026: execucao somente leitura de `docs/auditoria/read-only-summary.mjs`. Nenhum payload, nome, telefone ou credencial foi copiado para esta entrega. Nao repeti essa consulta nem executei envios. Foram informadas 20 capturas de base; elas ocorreram depois do inicio dos tokens visuais porque a autenticacao ficou disponivel mais tarde. Portanto nao sao uma base visual integralmente anterior a todas as alteracoes. Esta etapa nao fez restyle nem valida/aprova o visual.

## Fontes anteriores e achados

| ID / metrica | Fonte anterior | Achado e definicao compartilhada |
|---|---|---|
| X01: falhas | Dashboard: RPC `get_dashboard_metrics`, com fallback em `notification_events`; Central: `loadNotificationSummary`; WhatsApp: contagem por provedores suportados | A RPC versionada filtra `provider = euatendo`; o dashboard ainda alternava `falhas_hoje || falhas_envio`. Central contava todos os provedores; WhatsApp os dois atuais. Agora `lerFalhasPendentes`: eventos atualmente `failed`, todos os canais, publicos, tipos e datas; sem cancelados/retries. Nao equivale a tentativas nem a falhas recentes de seguranca. Agregado real: **3 = 1 whatsapp_extension + 2 euatendo**. |
| X02: fila | Dashboard: RPC com pending/reserved/processing/retry sem corte de data; outro contador pelo canal ativo. Central e WhatsApp: pending/retry com send_date <= hoje | `lerMensagensNaFila` usa a definicao da Central: pending + retry previstos ate hoje, todos os canais/publicos/tipos. Reserved/processing ficam em `lerMensagensEmProcessamento`; futuros em `lerMensagensFuturas`. A fila inclui anteriores ainda pendentes, sem exclusao por idade; next_retry_at, pausa e limites nao tornam essa contagem promessa de envio imediato. |
| X03: ultimo envio | Dashboard: max(sent_at) da RPC filtrada por euatendo; Central: sent_at de cada linha; WhatsApp: ultimo sent_at dos dois provedores | `lerUltimoEnvio`: maior sent_at nao nulo dos eventos atualmente sent, todos os canais/publicos/tipos, sem janela. Cancelados excluidos. Estado do dispatcher nao substitui confirmacao do evento. A causa estatica da divergencia por provedor foi localizada; os horarios reais das capturas nao foram revalidados. |
| X04: ultima execucao | Dashboard e WhatsApp: whatsapp_dispatcher_state.last_dispatch_at do canal ativo. Eventos recentes: whatsapp_provider_logs.created_at | `lerUltimaExecucao`: estado de despacho/cadencia do provedor explicitamente selecionado. Na extensao, completeReservationCadence atualiza last_dispatch_at ao liberar a cadencia; no euAtendo ha atualizacao apos o processamento. Nao e a ultima consulta da fila nem todo evento/log. Dashboard rotula "Ultimo despacho/cadencia do canal ativo". Logs posteriores nao comprovam envio posterior. Nao foi inventada "ultima verificacao da fila". |
| X05: vencidos | Dashboard: certificados com validade anterior a hoje; Central: eventos type=certificate_expired | Unidades distintas. `lerTotaisPorTipo` conserva todos os status/datas, inclusive cancelados e futuros; Central mostra "Resumos de vencidos" e "Avisos de vencimento" e explicita que sao eventos, nao certificados. Nao transforma o 10 historico em 10 certificados vencidos. |
| X06: certificados em operacao | Dashboard: certs da RPC/fallback; Certificados: loadRenewalSummary filtra renovacao_status | O codigo local ja exclui cliente_inativo na contagem operacional: em_acompanhamento ou renovou_fasa. `lerCertificadosEmOperacao` tambem exclui status=invalido e le todas as paginas, sem limite silencioso de 1000. Inclui validade vencida e futura, nao apenas status ativo de validade. Agregado real: **130 cadastrados, 114 operacionais, 2 inativos**; as outras categorias nao foram quantificadas aqui. O 114 nao inclui inativos segundo a definicao local. A pagina Certificados permanece fora deste escopo de edicao. |
| X07: total de clientes | clientes/page.tsx: select de clientes com count exact; sem join obrigatorio com certificados; WhatsApp: consulta de qualidade de telefone, limite 5000 | O total e de cadastros de clientes (ou resultado da busca), nao de certificados. A consulta permite clientes sem certificado, mas o agregado real informado e **130 clientes e 0 sem certificado**, com 130 certificados. A comparacao 130 versus 114 confundia total cadastrado com certificados operacionais. Subtitulo de Clientes e indicadores de qualidade ficam para o trabalho dono dessa pagina. |
| X08: sino | internal-notifications-menu chama /api/internal-notifications/summary; rota consulta internal_notifications e internal_notification_reads | Conta notificacoes internas nao lidas nem dispensadas para o usuario, visiveis conforme usuario/papel e validade. Nao conta notification_events, fila, falhas nem certificados. O 26 da captura nao foi revalidado nesta etapa. Nao alinhar artificialmente esse numero com a Central; definicao no painel do sino depende de alteracao fora deste escopo. |
| X09: canal | getWhatsAppProviderLabel em providers.ts e mapas locais de exibicao | `getOperationProviderLabel` aplica "Extensao" com acento na exibicao ("Extensão do Chrome"), usado somente pelas tres paginas de servidor. Identificador whatsapp_extension e providers.ts permanecem inalterados. Rotulos internos do componente cliente do WhatsApp nao foram alterados; sua adequacao completa pertence ao trabalho visual dono desse componente. |

## X02: conclusao do agregado real

No provedor whatsapp_extension foram informados **701 pending futuros, 2 pending de hoje e 2 pending anteriores**. Logo **705 = 701 futuros + 4 previstos ate hoje**. Esse agregado explica o total amplo; nao sustenta a hipotese de 701 registros historicos presos. Os 2 anteriores continuam contabilizados como devidos, sem inferir que precisam ser apagados/cancelados. A idade e a elegibilidade individual nao foram investigadas. Nenhuma limpeza ou mudanca de estado foi feita ou recomendada automaticamente.

DECISAO eventual sobre mensagens futuras ou antigas exige analise operacional separada. Nao ha neste levantamento evidencia para justificar saneamento do suposto estoque historico de 705.

## Contrato de leitura e erros

- Todas as tres paginas chamam `lerMetricasOperacao`, que compoe uma funcao por metrica. Dashboard nao usa mais a RPC com escopo divergente. Nao ha cache persistente nem promessa de snapshot transacional entre telas abertas em instantes distintos.
- Contagens sao exatas; fila e falhas abrangem todos os provedores, incluindo eventual historico legado, assim como a definicao anterior da Central. Estado de despacho e explicitamente do canal ativo. A lista da Central continua com seus filtros, sem que eles redefinam os indicadores globais.
- Dia operacional e exibicao: America/Sao_Paulo. Envios de hoje usam intervalo fechado no inicio e aberto no proximo dia, com limites UTC-03 explicitos; mes vai do inicio local ate agora. Nao usa dia UTC do navegador/servidor.
- Uma leitura com erro resulta em null e chave em unavailable, nunca zero. Leitura bem-sucedida com contagem zero continua 0. Ultimo envio/estado ausente sem erro continua ausencia registrada. Erros brutos da base nao sao expostos.
- Dashboard mantem avisos disponiveis quando certificados falham, e vice-versa; graficos nao mostram zeros inventados. Central mantem lista e metricas disponiveis, sem afirmar "Sem pendencias criticas" quando ha leitura indisponivel.
- O componente cliente CanalWhatsAppPanel exige numeros em stats e nao pertence ao escopo. A pagina nao passa null como zero: se um stat obrigatorio ou a leitura de duracao falhar, somente o painel integrado e substituido por mensagem de indisponibilidade, mantendo cabecalho. Falha apenas em futuros/totais por tipo nao bloqueia esse painel. Falha de estado de despacho tem aviso proprio. Aprimorar erros por card dentro do componente exige o trabalho dono dele.
- Qualidade de telefone e limites de seguranca preexistentes nao foram redefinidos por esta etapa. O tempo medio conserva a amostra de ate 100 logs do componente; nao foi promovido a media global.

## N11 e outros limites

Central seleciona payload e, nas versoes mobile/desktop, usa `getRenewalRetryPresentation(event.payload, certificado?.data_vencimento)`. Quando renewed e verdadeiro, nao ha botao de retry: exibe **Certificado renovado**, com title **A validade mudou depois deste aviso. Reenviar mandaria uma data que não vale mais.**

Referencia ausente no payload e **desconhecida**, nao e derivada de send_date, dias_restantes nem validade atual. A falta de referencia nao prova ausencia de renovacao; sem prova positiva de renewed, a permissao/status preexistentes continuam governando o botao. Helper e seus testes pertencem ao trabalho pai. Nenhum endpoint foi alterado; a protecao equivalente no servidor continua uma DECISAO separada.

Agregado adicional informado: 8 chaves repetidas por tipo/certificado/destinatario/dia. Isso nao comprova entrega duplicada. N12 e qualquer alteracao de idempotencia/envio estao fora desta entrega.

## Testes

`tests/operation-metrics.test.ts`: consultas com banco simulado, status/datas/canais, eventos versus certificados, ultimo envio versus estado, fronteira local de data, zero/ausencia/erro, falha parcial e paginacao acima de 1000.

`tests/operation-metrics-usage.test.ts`: AST de TypeScript confirma importacao/chamada unica nas tres paginas, ausencia de agregacoes inline/RPC legada, uso dos campos comuns, modulo server-only sem mutacoes e integracao N11 nos dois modos. Os testes nao executam envio real nem validam producao.

Validacao local em 23/11/2026: `tsc --noEmit --incremental false` passou; ESLint dos seis arquivos de codigo/teste deste escopo passou; os 15 testes novos passaram; `npm test` passou com 43 arquivos, 321 testes e verificacao service-role/RBAC. Nenhum build/deploy, commit ou teste de envio foi feito por esta entrega. Estes resultados sao locais, nao prova de producao.
