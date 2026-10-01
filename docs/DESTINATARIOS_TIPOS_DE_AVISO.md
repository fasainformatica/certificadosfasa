# Destinatarios: tipos de aviso

## O que mudou

Em **Configuracoes > Destinatarios**, cada numero tem duas opcoes independentes:

| Opcao | O que recebe no WhatsApp |
|---|---|
| Certificados atualizados | Aviso quando um certificado existente e atualizado e comunicados enviados manualmente pela central de notificacoes internas. |
| Avisos gerais | Avisos de vencimento e resumos de vencidos ja previstos no planejamento. |

Pode marcar uma, ambas ou nenhuma. O destinatario precisa estar **Ativo**.
Usuarios do painel e app Windows continuam recebendo notificacoes internas conforme as regras atuais, independentemente dessas caixas.
Estas preferencias sao dos numeros internos; nao alteram a permissao de envio de cada cliente.

## 1. Aplicar a atualizacao no Supabase

1. Abra o projeto Supabase usado pelo Fasa Certificados.
2. Confirme que possui backup e que as migrations anteriores do projeto estao aplicadas.
3. Abra **SQL Editor > New query**.
4. Execute o conteudo completo de [`20261001133454_recipient_notification_preferences.sql`](../database/migrations/20261001133454_recipient_notification_preferences.sql).
5. Aguarde a conclusao sem erros. A migration usa uma transacao e pode ser executada novamente sem apagar preferencias.

Nao execute o schema completo sobre o banco existente. Nao edite triggers ou funcoes de reserva individualmente.
A migration cria as colunas, o vinculo com a notificacao interna, os triggers e atualiza as duas reservas.
Nao altera chaves, RLS, permissao de clientes, bucket ou arquivos PFX.
Nao envia mensagens ao ser aplicada nem enfileira notificacoes antigas.

Consulta de confirmacao, somente leitura:

```sql
select nome, ativo, notify_general, notify_certificate_updates
from public.notification_recipients
order by nome;
```

Nos registros existentes: `notify_general = true` e `notify_certificate_updates = false`.
Se ja tiver configurado preferencias, executar a migration de novo nao redefine os valores.

## 2. Publicar o codigo

Depois do SQL, publique esta versao do projeto. Nao precisa gerar novas chaves ou mudar o `.env`.
O canal continua sendo o valor server-only de `WHATSAPP_PROVIDER`: `whatsapp_extension` ou `euatendo`.
Nao precisa reinstalar a extensao nem o app Windows.
Aplicar so o SQL, sem o codigo, ainda nao habilita o novo fluxo: a versao antiga nao informa o canal no aviso interno.

## 3. Configurar os destinatarios

1. Entre como administrador.
2. Abra **Configuracoes > Destinatarios**.
3. No destinatario desejado, marque **Certificados atualizados**.
4. Se nao deseja vencimentos/resumos nesse numero, desmarque **Avisos gerais**.
5. Mantenha **Ativo** marcado e clique em **Salvar** nesse destinatario.

Nao precisa clicar em Atualizar planejamento para os avisos de atualizacao/comunicados.
O cadastro de destinatarios ja solicita o planejamento de vencimentos conforme as regras existentes.
Marcar a nova opcao vale para novas notificacoes; nao envia o historico antigo.

## 4. Testar com um numero controlado

1. Escolha um numero da equipe autorizado para teste; nao use numeros de clientes.
2. Para testar exclusivamente nele, confira que somente esse destinatario esta ativo com **Certificados atualizados** marcado.
3. Com o envio automatico pausado, publique um comunicado de teste em **Notificacoes internas > Enviar aviso interno**.
4. O aviso deve aparecer no painel e no Windows. A confirmacao informa quantas mensagens entraram na fila do WhatsApp.
5. Na **Central de avisos**, filtre o tipo **Comunicado interno** e confira destinatario e estado **Na fila**.
6. Antes de liberar o envio, revise TODA a fila: ativar o automatico tambem libera mensagens antigas elegiveis. Nao ative apenas para testar sem revisar.
7. Para confirmar entrega no aparelho, o envio automatico precisa estar ativo, sem pausa operacional, dentro do horario permitido e com o canal funcionando. A extensao precisa estar conectada ao WhatsApp Web; euAtendo precisa do dispatcher/cron e instancia operacional.
8. O envio segue o intervalo e os limites existentes, uma mensagem por reserva. Uma mensagem na fila nao significa que ja foi enviada ou entregue.

Teste de certificado: use uma renovacao real autorizada ou um certificado de teste em ambiente separado. Atualizar um PFX existente gera **Certificado atualizado** para os destinatarios habilitados. Primeiro cadastro nao gera WhatsApp dessa categoria.

## Regras importantes

- Desmarcar uma categoria cancela mensagens dela ainda `pending/retry`. Reservadas/em processamento podem terminar o envio; mensagens ja enviadas nao podem ser desfeitas.
- Trocar o telefone do destinatario ajusta avisos internos ainda na fila, nao os que ja foram reservados.
- Comunicados expirados, removidos ou privados nao podem ser despachados. Um aviso cancelado pode ser reenfileirado manualmente apenas se a preferencia e a origem estiverem validas.
- O envio pode ficar aguardando automacao, horario, intervalo, limite, pausa ou canal; esta atualizacao nao contorna nenhum desses bloqueios.
- O rebuild de vencimentos nao apaga nem duplica os novos avisos. Reativar a opcao nao reproduz comunicados antigos automaticamente.
- O titulo e o texto do aviso interno sao encaminhados ao WhatsApp. Nao inclua senhas ou outros segredos nos comunicados.
- Se a gravacao dos avisos falhar, nao ha fanout parcial. O upload do PFX mantem o tratamento nao bloqueante de erro de notificacao ja existente: valide o retorno/aviso operacional, nao suponha entrega apenas porque o arquivo foi salvo.

## Validacao e limites

Testes automatizados cobrem defaults, edicao parcial, RBAC, apresentacao, selecao de publico, pausas, cadencia, expiracao, retries e idempotencia.
O SQL e executado em PostgreSQL isolado via PGlite, usando DDL das tabelas de notificacao do projeto, sem credenciais nem mensagens reais.
Isto nao substitui aplicar a migration e fazer a homologacao controlada do provider remoto.
O Supabase remoto nao foi alterado nesta implementacao; o navegador da sessao nao estava disponivel para validacao visual interativa.

Validacao local em 2026-10-01:

- `npm test`: 180 testes em 34 arquivos, incluindo 24 cenarios SQL; checagem de RBAC aprovada.
- `npx tsc --noEmit --pretty false`, `npm run lint` e `npm run build`: aprovados.
- `npm run security:audit`: nenhuma falha na checagem local de secrets e protecoes do projeto.
- `npm audit`: 8 alertas em dependencias ja existentes (3 moderados, 4 altos, 1 critico, incluindo Next.js 16.3.0). Nao relacionados ao PGlite adicionado para testes. Atualizacao dessas dependencias permanece pendente, fora do escopo desta funcionalidade.
- Nao houve envio real de WhatsApp, alteracao de configuracao remota, push ou deploy.

Consulta tecnica utilizada: [triggers do Supabase](https://supabase.com/docs/guides/database/postgres/triggers) e [permissoes de funcoes](https://supabase.com/docs/guides/database/functions).
