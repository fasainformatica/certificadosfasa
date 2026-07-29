# Migrations

Migrations incrementais do projeto.

Aplicar em ordem cronologica pelo nome do arquivo. A migration mais recente nesta consolidacao e:

```text
20260729120000_add_certificate_renewal_status.sql
```

## Regra

- Nao editar migration antiga ja aplicada.
- Criar nova migration para qualquer mudanca incremental.
- Manter `../schema/supabase_schema.sql` atualizado para bancos novos.
- Documentar impactos em `../../docs/SYSTEM_CONTEXT.md` e `../../CHANGELOG.md`.
