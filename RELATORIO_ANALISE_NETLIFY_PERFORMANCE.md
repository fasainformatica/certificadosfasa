# Relatório de análise de performance na Netlify

Data: 10/07/2026

## Escopo

Foi analisado o site público `https://fasacertificados.netlify.app`, a configuração local do projeto em `C:\Users\User\fasa-certificados` e a conta Netlify disponível na CLI local.

## Limitação encontrada no Chrome aberto

O Chrome aberto não está iniciado com porta de depuração remota (`http://127.0.0.1:9222` não respondeu). O navegador integrado do Codex também não encontrou uma sessão de browser disponível.

Por isso, não foi possível anexar diretamente ao DevTools/F12 da aba aberta para coletar Network/Performance da sessão logada. Os testes foram feitos por:

- medições HTTP reais contra o domínio da Netlify;
- Lighthouse em Chrome headless;
- inspeção da configuração local;
- inspeção segura de URLs locais do Chrome, sem imprimir query string, hash ou tokens.

## Achados principais

### 1. Primeiro acesso tem TTFB alto, acessos seguintes ficam rápidos

Medições em `https://fasacertificados.netlify.app/`:

| Rodada | HTTP | TTFB | Total |
|---|---:|---:|---:|
| 1 | 200 | 2.498s | 2.506s |
| 2 | 200 | 0.495s | 0.503s |
| 3 | 200 | 0.324s | 0.332s |
| 4 | 200 | 0.275s | 0.283s |
| 5 | 200 | 0.279s | 0.286s |
| 6 | 200 | 0.261s | 0.276s |

Interpretação: o problema mais evidente é o custo de inicialização/SSR em ambiente Netlify, especialmente no primeiro acesso. Isso é compatível com serverless cold start ou inicialização do runtime Next/OpenNext.

### 2. Tela pública de login está leve

Lighthouse em `https://fasacertificados.netlify.app/login`:

| Métrica | Resultado |
|---|---:|
| Performance | 97 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| FCP | 1.0s |
| LCP | 2.2s |
| TBT | 150ms |
| CLS | 0 |
| Speed Index | 1.4s |
| Server response | 240ms |
| JS bootup | 0.4s |

Interpretação: a tela pública não indica travamento grave de frontend. A lentidão percebida logado provavelmente vem de rotas internas dinâmicas, SSR, chamadas Supabase ou cold start.

### 3. Assets estáticos estão com cache correto

Os assets `/_next/static/*` retornaram:

`Cache-Control: public,max-age=31536000,immutable`

Isso está correto e não parece ser a causa principal da lentidão.

### 4. Site Netlify não está vinculado à pasta local

Resultado local:

- `netlify.toml` não existia antes da correção.
- `.netlify/state.json` não existe.
- `netlify status` informou que a pasta não está vinculada a um projeto.
- `netlify sites:list` na conta atual não lista `fasacertificados.netlify.app`.

Consequência: não foi possível alterar configurações do site diretamente pela CLI Netlify desta máquina. Para aplicar no site hospedado, é necessário vincular esta pasta ao projeto correto ou fazer deploy pela conta/time que contém `fasacertificados.netlify.app`.

### 5. Supabase configurado localmente está respondendo rápido

Teste seguro, sem imprimir chaves:

- RPC `get_dashboard_metrics`: existe e respondeu em aproximadamente 116ms.
- `count` simples em `certificados`: aproximadamente 53ms.

Interpretação: no Supabase do `.env` local, a RPC otimizada está aplicada e rápida. Se a Netlify estiver usando o mesmo projeto, o banco não parece ser o gargalo principal da dashboard. Se a Netlify estiver usando outro ambiente, pode haver divergência de SQL/env.

### 6. Bundle público aponta para o mesmo host Supabase do `.env` local

O bundle público contém referência ao host:

`bcvqomoiempxmbzawvha.supabase.co`

Não foi impresso nenhum token. Esse achado indica que a Netlify está usando o mesmo projeto Supabase público do `.env` local.

## Correções aplicadas

### 1. Criado `netlify.toml`

Arquivo criado:

`netlify.toml`

Conteúdo:

```toml
[build]
  command = "npm run build"

[build.environment]
  NODE_VERSION = "20"
  NEXT_TELEMETRY_DISABLED = "1"
  NETLIFY_NEXT_SKEW_PROTECTION = "true"
```

Objetivo:

- padronizar o comando de build;
- fixar Node.js 20 para evitar variação de runtime;
- desativar telemetria no build;
- ativar skew protection da Netlify para reduzir erros entre deploys em usuários com sessão aberta.

### 2. Corrigido encoding visível na tela de login

Arquivos:

- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/login/login-form.tsx`

Correções:

- `Fasa InformÃ¡tica` -> `Fasa Informática`
- `E-mail ou senha invÃ¡lidos.` -> `E-mail ou senha inválidos.`
- `NÃ£o foi possÃ­vel...` -> `Não foi possível...`

## Validações executadas

```bash
npm run lint
npm run build
```

Resultado:

- lint passou;
- build passou;
- Next.js gerou 30 páginas estáticas/dinâmicas sem erro.

## Causa provável da lentidão na Netlify

Com os dados disponíveis, a causa mais provável é:

1. rotas internas são todas dinâmicas e renderizadas sob demanda;
2. Netlify usa função serverless para SSR/Route Handlers do Next.js;
3. o primeiro acesso após período frio tem custo alto de inicialização;
4. em sessão logada, as páginas internas ainda fazem chamadas server-side ao Supabase.

## Recomendações práticas

1. Vincular a pasta local ao projeto correto da Netlify:

```bash
netlify link
```

Escolher o projeto `fasacertificados.netlify.app` no time correto.

2. Conferir no painel da Netlify se as variáveis de ambiente de produção estão iguais ao `.env` local, sem copiar chaves para locais públicos.

3. Fazer novo deploy com o `netlify.toml` adicionado.

4. Testar logado depois do deploy:

- tempo de abertura de `/dashboard`;
- tempo de troca para `/certificados`;
- tempo de troca para `/notificacoes`;
- tempo de troca para `/whatsapp`;
- se o primeiro acesso continua lento e os seguintes rápidos.

5. Se a lentidão persistir somente no primeiro acesso, considerar:

- migrar deploy para Vercel, onde Next.js App Router costuma ter integração nativa mais direta;
- configurar monitor externo para aquecer rotas críticas, se a operação aceitar esse custo;
- reduzir ainda mais SSR em páginas que podem ser parcialmente estáticas.

## Risco residual

Não foi possível medir a sessão autenticada real no Chrome aberto porque o Chrome não estava exposto via DevTools Protocol. Para depuração completa da sessão logada, é necessário iniciar uma janela controlável com remote debugging ou fazer login em uma sessão Chrome headless/controlada para coletar trace e Network.

