# Desempenho da navegacao

Data: 2026-09-14. Projeto: `C:\Users\User\ProjetosMauro\certificadosfasa`.

## Evidencias e mudancas

A sidebar tinha `prefetch=true` em todos os links. Isso forca a busca completa de rotas dinamicas e pode iniciar consultas de varias abas quando o usuario ainda esta na primeira. Agora usa o comportamento automatico do Next, com o `loading.tsx` existente como limite de prefetch. O link clicado indica carregamento com `useLinkStatus`, mantendo dimensoes estaveis e texto acessivel.

As consultas tinham esperas desnecessarias entre operacoes independentes. A autenticacao continua antes das consultas privilegiadas e nenhuma resposta privada foi colocada em cache compartilhado.

| Tela | Antes | Depois |
|---|---|---|
| Certificados | Ajustes, depois listagem, depois resumo | Ajustes, depois listagem e resumo juntos |
| Central de avisos | Ajustes, destinatarios, busca opcional, eventos, resumo | Ajustes/destinatarios/busca juntos; eventos e resumo juntos |
| Notificacoes internas | Estado individual, contadores, listagem | Estado individual; contadores e listagem juntos |
| Configuracoes | Templates em sequencia, ajustes, leitura de templates, destinatarios, usuarios | Ajustes/destinatarios/usuarios/inicializacao juntos; leitura de templates aguarda inicializacao |

A inicializacao dos quatro templates consulta tipos diferentes em paralelo. Nenhum texto personalizado e substituido por essa otimizacao. A migracao preexistente do template legado continua sendo executada, e o template de certificado vencido destinado ao cliente continua inativo por padrao. Nao se modificaram planejamento, cadencia, retry ou dispatcher.

## Medicao

Comando: `node scripts/measure-navigation-latency.mjs`.

O script carrega as variaveis locais e faz somente consultas HEAD com contagem em `notification_settings`, `certificados` e `notification_events`. Usa timeout de 10 segundos por consulta. Nao transfere registros, escreve no banco nem envia notificacoes; mostra duracao e status HTTP, sem valores de credenciais.

Nesta amostra, depois de uma consulta de aquecimento:

| Execucao | Tempo total | Respostas |
|---|---:|---|
| Tres consultas em sequencia | 397 ms | Todas HTTP 200 |
| Mesmas consultas em paralelo | 106 ms | Todas HTTP 200 |

Esses tempos medem o caminho desta maquina ate o Supabase e o efeito de sobrepor consultas. Nao sao tempos da pagina completa, nao medem RLS de um usuario autenticado (a sonda usa o cliente administrativo), nem comprovam uma porcentagem de melhoria da Vercel. Ordem de execucao, rede e caches podem influenciar a amostra.

O teste automatizado usa 100 ms de latencia simulada por leitura de template: as quatro leituras terminam em uma janela de 100 ms, em vez de somar quatro esperas. Tambem verifica textos personalizados, criacao de ausente, template inativo, migracao legada e falha de leitura.

## Publicacao e verificacao

Validacoes locais concluidas:

- `npm.cmd test`: 31 arquivos, 134 testes aprovados e checagem service-role/RBAC aprovada.
- `npx.cmd tsc --noEmit --pretty false`: aprovado.
- `npm.cmd run lint`: aprovado.
- `npm.cmd run build`: aprovado.
- `npm.cmd run security:audit`: nenhuma falha local; aviso preexistente sobre fallback de chave legada no exemplo de env.
- Reexecucao dos quatro testes de templates apos ajuste de tipagem: aprovada.
- Servidor local usando build de producao em `http://127.0.0.1:3000`: `/login` respondeu HTTP 200 e `/certificados` sem sessao respondeu HTTP 307 para login. Isso verifica disponibilidade e a barreira de acesso sem autenticar nem enviar mensagens.
- `git diff --check`: aprovado; somente avisos de normalizacao LF/CRLF do Git.

Nao e necessario executar SQL, alterar bucket ou criar variaveis. As alteracoes precisam de um novo deploy para afetar o site publicado. Esta tarefa nao publica automaticamente.

Depois do deploy, comparar a navegacao autenticada no mesmo navegador e rede: abrir Certificados, Clientes, Central de avisos e Configuracoes, conferir indicador de carregamento, filtros, paginacao e dados apos salvar. Confirmar tambem o perfil financeiro e o acesso restrito a WhatsApp/Configuracoes.

O navegador integrado nao estava disponivel nesta sessao; nao foi possivel medir as transicoes reais em uma sessao autenticada ou validar screenshots. Latencia entre a regiao da Vercel e o Supabase, cold starts e custo das consultas sob RLS permanecem pontos de investigacao caso persista lentidao apos publicar.

Referencias de implementacao: guias de navegacao e fetching instalados em `node_modules/next/dist/docs/01-app/01-getting-started/`, e [documentacao Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).
