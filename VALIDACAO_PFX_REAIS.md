# Validação com PFX reais

Este roteiro documenta os testes obrigatórios antes de colocar o sistema em produção com certificados ICP-Brasil reais.

Não salve arquivos `.pfx`, senhas, prints com dados sensíveis ou dumps de certificado no repositório.

## Ambiente

- Use um projeto Supabase de homologação com bucket privado `certificados-pfx`.
- Use uma chave `CERT_ENCRYPTION_KEY` exclusiva de homologação.
- Use usuários internos de teste com perfis `admin` e `financeiro`.
- Apague os arquivos de teste do Storage ao final.

## Casos obrigatórios

| Caso | Entrada | Resultado esperado |
|---|---|---|
| PFX ICP-Brasil válido | Arquivo `.pfx` válido e senha correta | Upload aceito, CNPJ/titular/vencimento extraídos, senha criptografada e arquivo salvo no bucket privado |
| Senha incorreta | Mesmo PFX com senha errada | Erro genérico: `Senha incorreta ou certificado invalido.` |
| PFX vencido | Certificado com vencimento hoje ou passado | Cadastro permitido e status exibido como `Vencido` |
| PFX sem CNPJ detectável | Certificado sem CNPJ no subject/SAN | Fluxo exige CNPJ/manual ou cliente selecionado |
| Algoritmo não suportado | PFX que o `node-forge` não consiga abrir | Erro amigável, sem stack trace e sem crash |
| OpenSSL 3/AES | PFX gerado com algoritmo AES moderno, se disponível | Confirmar suporte da versão atual de `node-forge`; se falhar, registrar limitação operacional |
| Upload duplicado | Mesmo arquivo enviado duas vezes | Segundo upload bloqueado por hash SHA-256 |
| Renovação | Novo PFX para CNPJ já existente | Certificado anterior fica histórico/substituído, novo certificado vira vigente e avisos são recalculados |
| Storage privado | Tentativa de abrir path direto | Acesso direto negado; download somente por rota backend e URL assinada curta |

## Evidências permitidas

- Data/hora do teste.
- Tipo do caso testado.
- Resultado observado.
- ID interno do certificado, se necessário.
- Logs sanitizados sem senha, token, storage path completo ou conteúdo do PFX.

## Evidências proibidas

- Arquivo `.pfx`.
- Senha do certificado.
- Senha do link público.
- Token público de download.
- `storage_path` completo.
- Chave `CERT_ENCRYPTION_KEY`, service role ou qualquer segredo de ambiente.

## Limitação técnica a validar

Certificados ICP-Brasil normalmente usam PBE com SHA-1 e 3DES/RC2, suportados pelo `node-forge`. Alguns PFX gerados por OpenSSL 3 podem usar AES-256 em combinações que precisam ser validadas com a versão instalada. Se houver falha, o comportamento correto é recusar com mensagem amigável e registrar apenas erro sanitizado.
