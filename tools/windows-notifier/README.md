# Notificador Windows Fasa

Cliente leve para mostrar pop-ups internos quando surgirem novas notificacoes no painel.

## Configuracao

1. No servidor, configure:

```env
WINDOWS_NOTIFIER_ENABLED=true
WINDOWS_NOTIFIER_TOKEN=token_gerado
WINDOWS_NOTIFIER_ROLE=financeiro
```

2. Gere um token forte com:

```powershell
npm.cmd run security:generate-windows-notifier-token
```

3. Copie `config.example.json` para `config.local.json`.
4. Em `config.local.json`, preencha:

```json
{
  "baseUrl": "http://localhost:3000",
  "token": "mesmo_valor_do_WINDOWS_NOTIFIER_TOKEN",
  "intervalSeconds": 60
}
```

Use o dominio da Vercel em `baseUrl` quando for usar em producao.

## Teste

Execute `TESTAR_NOTIFICADOR_FASA.bat`.

Se estiver correto, ele mostra a quantidade de notificacoes internas ativas e abre uma previa visual do popup.

## Uso

Execute `INICIAR_NOTIFICADOR_FASA.bat`.

O script fica na bandeja do Windows. A primeira notificacao encontrada vira linha de base para nao avisar historico antigo. Depois disso, novas notificacoes mostram uma janela discreta no canto da tela.

O popup usa as cores do painel, fica aberto ate voce clicar em `Abrir aviso` ou `Fechar`, e nao depende das notificacoes nativas do Windows.

## Instalador

Gere o pacote instalavel com:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\windows-notifier\installer\build-installer.ps1
```

O comando cria:

```text
tools\windows-notifier\dist\FasaNotifierSetup\InstalarNotificadorFasa.exe
```

Para instalar em outro computador, envie a pasta inteira `FasaNotifierSetup` para a maquina e execute `InstalarNotificadorFasa.exe`.

O instalador:

- Copia o notificador para `%LOCALAPPDATA%\FasaCertificados\Notificador`.
- Registra a inicializacao automatica no Windows para o usuario atual.
- Inicia o notificador assim que a instalacao termina.
- Nao precisa de permissao de administrador.

O pacote inclui `config.local.json`; trate essa pasta como confidencial porque ela contem o token do notificador.

## Limites

- Nao envia WhatsApp.
- Nao altera certificados.
- Nao marca notificacoes como lidas.
- Nao acessa Supabase diretamente.
- Precisa que o servidor esteja acessivel.
- O token fica no computador em `config.local.json`; trate esse arquivo como segredo.
