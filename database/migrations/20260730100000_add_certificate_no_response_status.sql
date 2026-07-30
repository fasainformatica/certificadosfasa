-- Fasa Certificados - adiciona situacao "Sem retorno" para renovacao
-- Execute no Supabase SQL Editor antes de usar o novo filtro em producao.
-- O status fica fora do acompanhamento automatico e nao gera novos avisos.

update public.certificados
set renovacao_status = 'em_acompanhamento'
where renovacao_status is null
   or renovacao_status not in ('em_acompanhamento','renovou_fasa','renovou_externo','nao_renovar','sem_retorno','cliente_inativo');

alter table public.certificados drop constraint if exists certificados_renovacao_status_check;
alter table public.certificados add constraint certificados_renovacao_status_check
  check (renovacao_status in ('em_acompanhamento','renovou_fasa','renovou_externo','nao_renovar','sem_retorno','cliente_inativo'));

comment on column public.certificados.renovacao_status is
  'Situacao operacional da renovacao. Valores fora do acompanhamento, incluindo sem_retorno, nao entram no planejamento automatico de avisos.';
