# Relatório de Correção da Dashboard, Avisos e Layout

## 1. Causa Encontrada Para Avisos Não Aparecerem

A investigação encontrou três pontos que podiam fazer a dashboard não refletir corretamente um certificado a vencer:

- A dashboard dependia da RPC `get_dashboard_metrics()`; se a função não estivesse aplicada no Supabase ou falhasse, a tela normalizava o retorno para métricas zeradas.
- O status persistido do certificado podia ficar obsoleto, por isso a regra visual precisava calcular a situação pela `data_vencimento` e pelos dias configurados em `notification_settings.dias_aviso_vencimento`.
- O cálculo anterior tratava `data_vencimento <= hoje` como vencido em alguns trechos. A regra foi consolidada para considerar vencido apenas quando `data_vencimento < hoje`, e vencendo quando `data_vencimento` está entre hoje e a maior janela configurada.

Arquivos envolvidos:

- `src/app/(internal)/dashboard/page.tsx`
- `src/lib/certificados/status.ts`
- `src/lib/notifications/engine.ts`
- `src/app/api/certificados/upload/route.ts`
- `src/app/api/certificados/route.ts`
- `src/app/(internal)/certificados/page.tsx`
- `supabase_schema.sql`
- `supabase/migrations/20260710143000_fix_dashboard_alert_metrics.sql`

## 2. Arquivos Alterados

Principais arquivos alterados nesta correção:

- `src/app/(internal)/dashboard/page.tsx`
- `src/app/(internal)/whatsapp/page.tsx`
- `src/app/(internal)/whatsapp/whatsapp-devices-panel.tsx`
- `src/app/(internal)/certificados/page.tsx`
- `src/app/api/certificados/route.ts`
- `src/app/api/certificados/upload/route.ts`
- `src/lib/certificados/status.ts`
- `src/lib/notifications/engine.ts`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/app-navigation.tsx`
- `src/components/ui/stat-card.tsx`
- `src/components/ui/section-card.tsx`
- `src/components/ui/section-header.tsx`
- `src/components/ui/charts.tsx`
- `src/components/ui/lazy-dashboard-charts.tsx`
- `src/components/ui/button-styles.ts`
- `src/app/(auth)/login/page.tsx`
- `src/app/download/[token]/page.tsx`
- `supabase_schema.sql`
- `supabase/migrations/20260710143000_fix_dashboard_alert_metrics.sql`

## 3. Como o Cálculo de Vencendo/Vencido Ficou Definido

Regra consolidada:

- `vencido`: certificado não substituído com `data_vencimento < hoje`.
- `vencendo`: certificado não substituído com `data_vencimento >= hoje` e `data_vencimento <= hoje + maior_dia_configurado`.
- `ativo`: certificado não substituído com `data_vencimento` maior que a janela configurada.
- `substituido`: preservado como histórico e excluído das métricas operacionais.

O `hoje` usa o timezone configurado em `notification_settings.timezone`, com fallback para `America/Sao_Paulo`.

A dashboard agora calcula os certificados a vencer a partir de:

- `data_vencimento`
- `dias_aviso_vencimento`
- `timezone`
- status calculado dinamicamente

Ela não depende de existir `notification_events` para destacar certificados a vencer.

## 4. Como a Dashboard Foi Compactada

A dashboard foi reorganizada para reduzir rolagem em 100% de zoom:

- Linha superior reduzida para 6 métricas principais.
- Removidos cards operacionais detalhados do bot.
- Gráficos reduzidos em altura.
- Cards com padding menor.
- Gaps verticais reduzidos.
- Cabeçalhos mais compactos.
- Seção `Precisa de atenção` com lista mais densa.
- Card `Avisos do dia` consolidando prontos, planejados, enviados e falhas.

## 5. Informações do Bot Movidas Para a Aba WhatsApp Bot

Saíram da dashboard:

- status detalhado do bot
- dispositivo principal detalhado
- última conexão detalhada
- fila detalhada
- último envio detalhado
- métricas operacionais extensas

Foram concentradas em `WhatsApp Bot`:

- Status geral
- Dispositivo principal
- Última conexão
- Aguardando envio
- Enviadas hoje
- Falhas
- Fila de hoje
- Último envio
- Operação do bot
- Dispositivos ativos
- Histórico de revogados

A dashboard mantém apenas um badge/alerta simples quando o bot está desconectado.

## 6. Redução de Degradês

Foram reduzidos degradês fortes em:

- botões principais
- sidebar ativa
- header global
- cards principais
- página de login
- tela pública de download
- cabeçalhos de seção

O visual agora usa azul sólido principal, cards brancos, bordas suaves e sombras leves.

## 7. Correção de Textos Cortados

A dashboard deixou de usar títulos longos nos cards principais e agora usa labels curtas:

- Total
- Válidos
- Vencendo
- Vencidos
- Avisos hoje
- Falhas

Itens importantes da seção `Precisa de atenção` mantêm texto completo e usam `title` quando o nome pode ser longo.

Também foram corrigidos textos com encoding quebrado nos arquivos tocados diretamente nesta correção, como `Fasa Informática`, `Usuário interno`, `Configurações`, `Acesso interno` e mensagens da tela pública.

## 8. Testes Executados

Executados:

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd --prefix desktop-bot run lint`

Resultado:

- Lint do sistema principal passou.
- Build Next.js passou.
- Lint/syntax check do desktop bot passou.

Validação funcional por código:

- Certificado vencendo é calculado por `data_vencimento` e maior dia configurado.
- Certificado vencido é calculado por data anterior a hoje.
- Upload calcula status com timezone configurado.
- Listagem e API de certificados usam a mesma regra de status dinâmico.
- Dashboard tem fallback server-side se a RPC não estiver aplicada ou falhar.

Validação manual pendente:

- Aplicar `supabase/migrations/20260710143000_fix_dashboard_alert_metrics.sql` ou reaplicar o trecho atualizado de `supabase_schema.sql` no Supabase.
- Cadastrar certificado vencendo em 30, 15 e 1 dia.
- Confirmar visualmente a dashboard com dados reais.

## 9. Riscos Residuais

- Se a migration não for aplicada no Supabase, a dashboard ainda possui fallback, mas a RPC do banco continuará antiga até ser atualizada.
- A validação com PFX real não foi executada nesta etapa.
- O fallback da dashboard limita a leitura de certificados a 1000 registros para evitar carga excessiva se a RPC não estiver disponível; em produção, a RPC atualizada deve ser aplicada.
- Algumas telas fora do escopo direto desta correção ainda podem ter textos antigos herdados de etapas anteriores, embora os arquivos tocados nesta correção tenham sido normalizados onde necessário.
