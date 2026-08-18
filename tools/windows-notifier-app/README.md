# Notificador Windows Fasa WPF

Aplicativo leve para Windows que mostra pop-ups internos do painel Fasa Certificados.

Esta versao usa WPF para evitar os defeitos visuais do popup em PowerShell/WinForms, mantendo o mesmo endpoint e o mesmo token do notificador.

## Configuracao

No servidor, mantenha:

```env
WINDOWS_NOTIFIER_ENABLED=true
WINDOWS_NOTIFIER_TOKEN=token_gerado
WINDOWS_NOTIFIER_ROLE=financeiro
```

Crie `config.local.json` com:

```json
{
  "baseUrl": "https://certificadosfasa.vercel.app",
  "token": "mesmo_valor_do_WINDOWS_NOTIFIER_TOKEN",
  "intervalSeconds": 60
}
```

Para teste local, troque `baseUrl` temporariamente para `http://localhost:3000`. Para producao, mantenha `https://certificadosfasa.vercel.app`.

## Gerar o instalador

Execute na raiz do projeto:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\windows-notifier-app\installer\build-installer.ps1
```

O pacote sera gerado em:

```text
tools\windows-notifier-app\dist\FasaNotifierWpfSetup
```

O instalador fica em:

```text
tools\windows-notifier-app\dist\FasaNotifierWpfSetup\InstalarNotificadorFasa.exe
```

Tambem e gerado um instalador unico:

```text
tools\windows-notifier-app\dist\InstalarNotificadorFasa-Unico.exe
```

Esse arquivo unico ja contem o app, icone, scripts auxiliares, README e `config.local.json`.

## Instalar em outro computador

Opcao recomendada: envie apenas `InstalarNotificadorFasa-Unico.exe` para o computador e execute.

Opcao de manutencao: envie a pasta inteira `FasaNotifierWpfSetup` para o computador e execute `InstalarNotificadorFasa.exe`.

O instalador:

- Copia o app para `%LOCALAPPDATA%\FasaCertificados\Notificador`.
- Remove os arquivos da instalacao anterior antes de copiar a versao nova.
- Registra a inicializacao automatica no Windows para o usuario atual.
- Encerra instancias antigas do notificador.
- Inicia o app assim que a instalacao termina.
- Nao precisa de permissao de administrador.

## Teste

Execute `TESTAR_NOTIFICADOR_FASA.bat` dentro da pasta instalada ou do pacote.

O app abre uma previa visual do popup. Se `--self-test` for usado, ele tambem valida a conexao com o endpoint antes de exibir a previa.

Os pop-ups nao fecham sozinhos. Quando mais de um aviso chega, as janelas ficam empilhadas no canto inferior direito ate o usuario abrir ou fechar cada uma.

Quando a notificacao for de certificado cadastrado ou atualizado, o popup mostra o botao `Baixar certificado`. O clique baixa o arquivo PFX direto para a pasta `Downloads` do Windows usando o token do notificador, sem abrir Chrome, Edge ou qualquer navegador. Se ja existir um arquivo com o mesmo nome, o app cria uma copia numerada, como `certificado (1).pfx`.

## Limites

- Nao envia WhatsApp.
- Nao altera certificados.
- Nao marca notificacoes como lidas.
- Nao acessa Supabase diretamente.
- Nao recebe senha do PFX.
- Baixa certificados somente quando o usuario clica em `Baixar certificado`.
- Precisa que o servidor esteja acessivel.
- O token fica no computador em `config.local.json`; trate esse arquivo como segredo.
- O instalador unico tambem contem esse token embutido; trate o EXE como confidencial.
