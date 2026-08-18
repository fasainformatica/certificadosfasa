# Scripts

Scripts SQL manuais ainda uteis.

## Arquivos

- `SUPABASE_PROMOVER_USUARIO_ADMIN.sql`: promove um usuario do Supabase Auth para admin em `user_profiles`.
- `SECURITY_AUDIT_SUPABASE.sql`: auditoria read-only de RLS, grants, Storage, Auth agregado e links publicos.
- `SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql`: auditoria read-only de logs/metadados historicos com exemplos mascarados.
- `SECURITY_SANITIZE_LEGACY_LOGS.sql`: limpeza controlada de logs historicos; termina com `ROLLBACK` por padrao e so aplica se voce trocar para `COMMIT`.
- `SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql`: lockdown inicial read-only/DDL para o projeto Supabase `mftvsgzrujkalssiriny`, com RLS nas 13 tabelas informadas e revogacao de `anon`.
- `reset_operational_data_keep_logins.sql`: limpa dados operacionais mantendo logins.

## Cuidado

Scripts podem alterar dados, exceto os marcados como read-only. Leia o conteudo completo antes de executar em qualquer ambiente.

Para limpar historico de logs:

1. Execute `SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql`.
2. Revise os contadores e exemplos mascarados.
3. Execute `SECURITY_SANITIZE_LEGACY_LOGS.sql` mantendo `ROLLBACK`.
4. Se o resumo estiver correto, troque apenas o `ROLLBACK` final por `COMMIT` e execute novamente.
