[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installerDir = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  $PSScriptRoot
} else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}
$appDir = Split-Path -Parent $installerDir
$projectRoot = Split-Path -Parent (Split-Path -Parent $appDir)
$legacyNotifierDir = Join-Path $projectRoot "tools\windows-notifier"
$distRoot = Join-Path $appDir "dist"
$packageDir = Join-Path $distRoot "FasaNotifierWpfSetup"
$appSource = Join-Path $appDir "FasaNotifierApp.cs"
$installerSource = Join-Path $installerDir "Installer.cs"
$appExe = Join-Path $packageDir "FasaNotifierApp.exe"
$installerExe = Join-Path $packageDir "InstalarNotificadorFasa.exe"
$localConfig = Join-Path $appDir "config.local.json"
$legacyLocalConfig = Join-Path $legacyNotifierDir "config.local.json"
$iconPath = Join-Path $appDir "fasa.ico"
$legacyIconPath = Join-Path $legacyNotifierDir "fasa.ico"

function Get-WpfReferencePath {
  param([string]$FileName)

  $candidates = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\WPF\$FileName"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\WPF\$FileName")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "Assembly WPF nao encontrado: $FileName"
}

if (-not (Test-Path -LiteralPath $appSource)) {
  throw "Fonte do app nao encontrado: $appSource"
}

if (-not (Test-Path -LiteralPath $installerSource)) {
  throw "Fonte do instalador nao encontrado: $installerSource"
}

if (-not (Test-Path -LiteralPath $localConfig)) {
  if (Test-Path -LiteralPath $legacyLocalConfig) {
    Copy-Item -LiteralPath $legacyLocalConfig -Destination $localConfig -Force
  } else {
    throw "config.local.json nao encontrado. Crie tools\windows-notifier-app\config.local.json antes de gerar o pacote."
  }
}

if (-not (Test-Path -LiteralPath $iconPath)) {
  if (Test-Path -LiteralPath $legacyIconPath) {
    Copy-Item -LiteralPath $legacyIconPath -Destination $iconPath -Force
  } else {
    throw "Icone fasa.ico nao encontrado."
  }
}

if (Test-Path -LiteralPath $packageDir) {
  $resolvedPackageDir = (Resolve-Path -LiteralPath $packageDir).Path
  $resolvedDistRoot = [System.IO.Path]::GetFullPath($distRoot)

  if (-not $resolvedPackageDir.StartsWith($resolvedDistRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Diretorio de pacote invalido: $resolvedPackageDir"
  }

  Remove-Item -LiteralPath $packageDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

$wpfReferences = @(
  (Get-WpfReferencePath -FileName "PresentationFramework.dll"),
  (Get-WpfReferencePath -FileName "PresentationCore.dll"),
  (Get-WpfReferencePath -FileName "WindowsBase.dll"),
  "System.Xaml.dll",
  "System.Windows.Forms.dll",
  "System.Drawing.dll",
  "System.Web.Extensions.dll"
)

Add-Type `
  -Path $appSource `
  -ReferencedAssemblies $wpfReferences `
  -OutputAssembly $appExe `
  -OutputType WindowsApplication

Copy-Item -LiteralPath $localConfig -Destination (Join-Path $packageDir "config.local.json") -Force
Copy-Item -LiteralPath $iconPath -Destination (Join-Path $packageDir "fasa.ico") -Force
Copy-Item -LiteralPath (Join-Path $appDir "INICIAR_NOTIFICADOR_FASA.bat") -Destination (Join-Path $packageDir "INICIAR_NOTIFICADOR_FASA.bat") -Force
Copy-Item -LiteralPath (Join-Path $appDir "TESTAR_NOTIFICADOR_FASA.bat") -Destination (Join-Path $packageDir "TESTAR_NOTIFICADOR_FASA.bat") -Force
Copy-Item -LiteralPath (Join-Path $appDir "README.md") -Destination (Join-Path $packageDir "README.md") -Force

Add-Type `
  -Path $installerSource `
  -ReferencedAssemblies @("System.Windows.Forms.dll", "System.Drawing.dll") `
  -OutputAssembly $installerExe `
  -OutputType WindowsApplication

Write-Output "APP_EXE=$appExe"
Write-Output "INSTALLER_EXE=$installerExe"
Write-Output "PACKAGE_DIR=$packageDir"
