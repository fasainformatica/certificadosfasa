# Links de download em certificados atualizados

## O que mudou

Ao atualizar um certificado existente, a notificacao verifica os destinatarios ativos marcados em **Certificados atualizados**. Com **um ou mais**, cada um recebe seu proprio link e senha temporaria pelo canal WhatsApp ativo. Sem destinatarios selecionados, nenhum envio WhatsApp e criado.

A mensagem contem titular, CNPJ, novo vencimento, link, senha temporaria e aviso de uso unico. O link e preparado quando chega a vez desse destinatario na fila; o intervalo entre mensagens nao foi alterado. Avisos internos gerais continuam sendo enviados como texto. Cadastrar um certificado novo continua gerando apenas a notificacao interna/painel/Windows.

Avisos ja enviados sem link, como o anterior a esta correcao, nao sao reenviados automaticamente. Para compartilhar esse certificado agora, gere um link manual na tela do certificado e envie-o ao destinatario por um canal controlado.

O link criado manualmente na tela do certificado continua disponivel e independente: criar, trocar senha ou invalidar o manual nao afeta os automaticos. Atualizar o arquivo PFX invalida todos os links da versao anterior.

## Como o destinatario usa

1. Abre seu link, valido por 7 dias a partir da emissao.
2. Informa a senha temporaria recebida. Essa senha libera somente uma sessao, na pagina atual, por ate 15 minutos. Outra aba, reabertura ou recarregamento ja nao libera novo acesso.
3. Ve a senha real do PFX e clica em **Baixar certificado**. A senha real nao e enviada pelo WhatsApp.
4. O navegador recebe o arquivo e confirma ao servidor. O botao fica bloqueado, mas a senha do PFX continua visivel e pode ser copiada. A pagina nao recarrega automaticamente.
5. Se a transferencia falhar, pode tentar novamente na mesma pagina por ate 2 minutos contados do primeiro pedido de download. Tentativas nao renovam o prazo. Enquanto houver uma transferencia reservada, aguarde ate 30 segundos antes de repetir.
6. Depois de baixar, atualizar/reabrir mostra link indisponivel. Para novo acesso, a equipe deve gerar outro link manual.

O navegador usa a pasta de downloads ou pergunta onde salvar conforme a configuracao do usuario. Recebimento pelo navegador nao comprova que a pessoa salvou em disco. Cancelar a janela de salvar depois do recebimento nao restaura o link.

## O que aplicar no Supabase

Nao execute o schema consolidado inteiro em um banco existente.

1. Abra o projeto Supabase usado pelo dominio oficial `https://certificadosfasa.vercel.app`.
2. Se ainda nao aplicou a atualizacao anterior de destinatarios, execute primeiro `database/migrations/20261001133454_recipient_notification_preferences.sql` no **SQL Editor**.
3. Abra `database/migrations/20261006152037_certificate_delivery_links.sql` no projeto local. Execute seu conteudo completo no **SQL Editor > New query > Run**.
4. Em seguida execute `database/migrations/20261006172256_certificate_delivery_single_recipient.sql` no mesmo projeto. Se a migration de links anterior ja foi aplicada, execute **somente esta nova migration**. Ela altera apenas a regra para os proximos avisos de atualizacao.
5. Os scripts sao transacionais e podem ser reaplicados; nao apagam certificados ou arquivos.
6. Confira as funcoes sem expor tokens/senhas:

```sql
select to_regprocedure('public.issue_certificate_download(uuid,text,text,jsonb,uuid,uuid)') as emissao,
       to_regprocedure('public.access_certificate_download(text,text,text,text,uuid)') as acesso;
```

As duas colunas devem mostrar a assinatura da funcao, nao `null`.

## Publicar o codigo

Para evitar executar o codigo antigo sobre o indice novo, pause temporariamente o envio automatico e evite criar links durante a atualizacao. Aplique o SQL e publique esta versao em seguida. A migration sozinha nao publica o frontend nem os dispatchers.

1. Envie as alteracoes revisadas ao GitHub e aguarde o deploy da Vercel na branch de producao.
2. Confira `NEXT_PUBLIC_SITE_URL=https://certificadosfasa.vercel.app` nas variaveis de producao.
3. Mantenha a mesma `CERT_ENCRYPTION_KEY` server-only que ja abre os PFX existentes. **Nao gere outra chave:** trocar sem migrar os dados impede abrir as senhas anteriores.
4. Nao ha chave nova de integracao. Nao coloque a service role ou chave de criptografia na extensao/navegador. Nao e necessario reinstalar a extensao ou o app Windows.
5. Confira os destinatarios antes de reativar o envio automatico. O cron, horario permitido, pausa e cadencia continuam valendo.

Aplicar uma migration no SQL Editor e uma acao separada de publicar codigo no GitHub. Confira que o SQL novo foi executado no mesmo projeto Supabase usado pela Vercel.

## Teste controlado apos publicar

Use certificado de homologacao e numeros internos autorizados. Nao habilite clientes reais so para testar.

- Gere primeiro um link manual. Abra, informe a senha temporaria, confira PFX/senha, baixe e confira o arquivo em Downloads. A senha deve permanecer visivel.
- Recarregue a pagina: deve ficar indisponivel. Uma segunda aba nao pode liberar a senha temporaria novamente.
- Com dois destinatarios internos ativos selecionados, atualize um certificado de homologacao. Aguarde a fila normal: cada um deve receber URL e senha distintas.
- Consumir o link do primeiro nao deve bloquear o segundo nem o manual.
- Com apenas um destinatario ativo selecionado, atualizar deve enviar um link e uma senha temporaria para ele.
- Envie um comunicado geral: deve continuar textual. Novo cadastro nao deve gerar essa entrega por WhatsApp.
- Para simular falha, interrompa a rede durante a transferencia, religue e tente na mesma pagina antes dos dois minutos; depois desse prazo o acesso deve ser negado.
- Confirme que a pagina ainda funciona com textos longos e no celular; validacao visual automatizada nao foi possivel nesta sessao.

## Implementacao e seguranca

### Validacao local desta entrega

- `npm test`: 37 arquivos, 208 testes aprovados, incluindo SQL real em PostgreSQL isolado (PGlite), APIs com dependencias simuladas, preparacao de mensagens e dispatchers. Guarda service-role/RBAC aprovada.
- `npx tsc --noEmit --pretty false`, `npm run lint` e `npm run build`: aprovados.
- `npm run security:audit`: nenhuma falha no escopo do scanner local. Isso nao equivale a auditoria de producao ou ausencia de vulnerabilidades em dependencias.
- `.env` local: origem oficial e presenca da chave confirmadas sem imprimir valores secretos; nenhuma variavel alterada.
- Nao houve SQL remoto, mensagens reais, commit, push ou deploy. Navegador automatizado indisponivel; inicializacao do servidor local foi bloqueada pelo ambiente. Validacao visual e homologacao em Vercel/Supabase/WhatsApp continuam pendentes.

### Controles

- RPCs `issue_certificate_download` e `access_certificate_download` executaveis somente pela service role; rotas manuais preservam RBAC admin/financeiro.
- Token publico e sessao guardados apenas como hashes. Senha temporaria usa scrypt. Credenciais necessarias ao retry do envio usam AES-256-GCM com a chave server-only existente, nunca texto puro em `notification_events`.
- Reserva e consumo com bloqueio de linha no PostgreSQL. Senha valida libera uma unica sessao; cinco tentativas incorretas bloqueiam por 15 minutos. Rotacao da senha invalida verificacoes concorrentes da senha anterior.
- Transferencia exige token e sessao, hash da versao e permissao atual do destinatario. Nao ha URL assinada reutilizavel exposta ao browser. Respostas usam no-store/no-referrer e nao exibem storage path/erros tecnicos.
- A resposta binaria usa streaming; homologar no plano Vercel utilizado, inclusive com arquivos maiores. Referencia: [Vercel sobre limites e streaming](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
- Auditoria grava IDs de link/certificado/transferencia, nunca senha, token de acesso ou texto de mensagem com credenciais.

### Limites que permanecem

Link e senha temporaria chegam pelo mesmo canal; quem acessar essa conversa pode consumir o acesso antes do destinatario. Isso nao equivale a autenticacao em dois fatores. Um arquivo baixado ou senha copiada nao pode ser revogado pelo site.

Para permitir recuperacao de rede, existe uma unica sessao logica com janela de 2 minutos. Um cliente modificado que omita a confirmacao de recebimento pode repetir a transferencia nessa janela depois da reserva de 30 segundos. A confirmacao normal a fecha imediatamente. Nao e uma garantia de impossibilidade de copiar bytes.

Se a resposta da validacao da senha se perder, ou a aba for fechada antes de baixar, solicite novo link: a credencial ja foi consumida. Se nao houver confirmacao do recebimento, a janela termina automaticamente. Emissao falha fecha o envio em seguranca e segue o limite de tentativas da fila; nao manda acesso parcial.

Links antigos sem data de expiracao mantem sua validade preexistente ate consumo, invalidacao ou troca do PFX, mas passam pelo novo fluxo. Links novos expiram em 7 dias. Avisos antigos sem metadata da versao nao recebem links retroativamente.
