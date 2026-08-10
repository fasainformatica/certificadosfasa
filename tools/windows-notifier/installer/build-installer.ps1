[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installerDir = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  $PSScriptRoot
} else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}
$notifierDir = Split-Path -Parent $installerDir
$distRoot = Join-Path $notifierDir "dist"
$packageDir = Join-Path $distRoot "FasaNotifierSetup"
$sourcePath = Join-Path $installerDir "Installer.cs"
$outputExe = Join-Path $packageDir "InstalarNotificadorFasa.exe"

$requiredFiles = @(
  "FasaInternalNotifier.ps1",
  "config.local.json",
  "fasa.ico"
)
$packageFiles = @(
  "FasaInternalNotifier.ps1",
  "config.local.json",
  "fasa.ico",
  "INICIAR_NOTIFICADOR_FASA.bat",
  "TESTAR_NOTIFICADOR_FASA.bat",
  "README.md"
)

foreach ($fileName in $requiredFiles) {
  $path = Join-Path $notifierDir $fileName

  if (-not (Test-Path -LiteralPath $path)) {
    throw "Arquivo obrigatorio nao encontrado: $path"
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

foreach ($fileName in $packageFiles) {
  $sourceFile = Join-Path $notifierDir $fileName

  if (Test-Path -LiteralPath $sourceFile) {
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $packageDir $fileName) -Force
  }
}

Add-Type `
  -Path $sourcePath `
  -ReferencedAssemblies @("System.Windows.Forms.dll", "System.Drawing.dll") `
  -OutputAssembly $outputExe `
  -OutputType WindowsApplication

Write-Output "INSTALLER_EXE=$outputExe"
Write-Output "PACKAGE_DIR=$packageDir"
