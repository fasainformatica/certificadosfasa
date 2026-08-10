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
  "baseUrl": "http://localhost:3000",
  "token": "mesmo_valor_do_WINDOWS_NOTIFIER_TOKEN",
  "intervalSeconds": 60
}
```

Use o dominio da Vercel em `baseUrl` quando for usar em producao.

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

## Instalar em outro computador

Envie a pasta inteira `FasaNotifierWpfSetup` para o computador e execute `InstalarNotificadorFasa.exe`.

O instalador:

- Copia o app para `%LOCALAPPDATA%\FasaCertificados\Notificador`.
- Registra a inicializacao automatica no Windows para o usuario atual.
- Encerra instancias antigas do notificador.
- Inicia o app assim que a instalacao termina.
- Nao precisa de permissao de administrador.

## Teste

Execute `TESTAR_NOTIFICADOR_FASA.bat` dentro da pasta instalada ou do pacote.

O app abre uma previa visual do popup. Se `--self-test` for usado, ele tambem valida a conexao com o endpoint antes de exibir a previa.

## Limites

- Nao envia WhatsApp.
- Nao altera certificados.
- Nao marca notificacoes como lidas.
- Nao acessa Supabase diretamente.
- Precisa que o servidor esteja acessivel.
- O token fica no computador em `config.local.json`; trate esse arquivo como segredo.
