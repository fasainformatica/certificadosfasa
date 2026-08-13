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
$singleInstallerSource = Join-Path $distRoot "SingleFileInstaller.generated.cs"
$singleInstallerExe = Join-Path $distRoot "InstalarNotificadorFasa-Unico.exe"
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

function ConvertTo-CSharpLiteral {
  param([string]$Value)

  return $Value.Replace("\", "\\").Replace('"', '\"')
}

function New-EmbeddedFileInitializer {
  param(
    [string]$Name,
    [string]$Path
  )

  $base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($Path))
  $safeName = ConvertTo-CSharpLiteral -Value $Name
  return "    new EmbeddedFile { Name = ""$safeName"", ContentBase64 = ""$base64"" }"
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

foreach ($oldArtifact in @($singleInstallerSource, $singleInstallerExe)) {
  if (Test-Path -LiteralPath $oldArtifact) {
    Remove-Item -LiteralPath $oldArtifact -Force
  }
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

$embeddedFiles = @(
  New-EmbeddedFileInitializer -Name "FasaNotifierApp.exe" -Path $appExe
  New-EmbeddedFileInitializer -Name "config.local.json" -Path (Join-Path $packageDir "config.local.json")
  New-EmbeddedFileInitializer -Name "fasa.ico" -Path (Join-Path $packageDir "fasa.ico")
  New-EmbeddedFileInitializer -Name "INICIAR_NOTIFICADOR_FASA.bat" -Path (Join-Path $packageDir "INICIAR_NOTIFICADOR_FASA.bat")
  New-EmbeddedFileInitializer -Name "TESTAR_NOTIFICADOR_FASA.bat" -Path (Join-Path $packageDir "TESTAR_NOTIFICADOR_FASA.bat")
  New-EmbeddedFileInitializer -Name "README.md" -Path (Join-Path $packageDir "README.md")
) -join ",`r`n"

$singleInstallerCode = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class SingleFileInstaller
{
    private const string AppName = "Fasa Certificados";
    private const string StartupName = "FasaCertificadosNotifier";

    private struct EmbeddedFile
    {
        public string Name;
        public string ContentBase64;
    }

    private static readonly EmbeddedFile[] EmbeddedFiles =
    {
$embeddedFiles
    };

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();

        try
        {
            string installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FasaCertificados",
                "Notificador"
            );

            StopExistingNotifier();
            ResetInstallDirectory(installDir);
            WriteEmbeddedFiles(installDir);
            RegisterStartup(installDir);
            StartNotifier(installDir);

            MessageBox.Show(
                "Instalacao concluida.\n\nO notificador Fasa ja foi iniciado e vai abrir automaticamente ao entrar no Windows.",
                AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Nao foi possivel instalar o notificador.\n\n" + ex.Message,
                AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }

    private static void WriteEmbeddedFiles(string installDir)
    {
        foreach (EmbeddedFile file in EmbeddedFiles)
        {
            string path = Path.Combine(installDir, file.Name);
            File.WriteAllBytes(path, Convert.FromBase64String(file.ContentBase64));
        }
    }

    private static void ResetInstallDirectory(string installDir)
    {
        EnsureSafeInstallDirectory(installDir);

        if (Directory.Exists(installDir))
        {
            foreach (string filePath in Directory.GetFiles(installDir, "*", SearchOption.AllDirectories))
            {
                File.SetAttributes(filePath, FileAttributes.Normal);
            }

            Directory.Delete(installDir, true);
        }

        Directory.CreateDirectory(installDir);
    }

    private static void EnsureSafeInstallDirectory(string installDir)
    {
        string appDataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FasaCertificados"
        );

        string normalizedRoot = Path.GetFullPath(appDataRoot)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        string normalizedInstallDir = Path.GetFullPath(installDir)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;

        if (
            normalizedInstallDir.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase) ||
            !normalizedInstallDir.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase)
        )
        {
            throw new InvalidOperationException("Diretorio de instalacao invalido.");
        }
    }

    private static void RemoveLegacyStartupEntries()
    {
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Run",
            true
        ))
        {
            if (key == null)
            {
                return;
            }

            string[] legacyNames = { "FasaInternalNotifier", "FasaCertificadosInternalNotifier" };

            foreach (string legacyName in legacyNames)
            {
                key.DeleteValue(legacyName, false);
            }
        }
    }

    private static void RegisterStartup(string installDir)
    {
        string exePath = Path.Combine(installDir, "FasaNotifierApp.exe");

        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Run",
            true
        ))
        {
            if (key == null)
            {
                throw new InvalidOperationException("Nao foi possivel abrir a inicializacao do Windows para o usuario atual.");
            }

            RemoveLegacyStartupEntries();
            key.SetValue(StartupName, Quote(exePath), RegistryValueKind.String);
        }
    }

    private static void StopExistingNotifier()
    {
        StopProcessByName("FasaNotifierApp");
        StopLegacyPowerShellNotifier();
    }

    private static void StopProcessByName(string processName)
    {
        foreach (Process process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (process.Id != Process.GetCurrentProcess().Id)
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
            }
            catch
            {
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    private static void StopLegacyPowerShellNotifier()
    {
        string command =
            "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe' OR Name = 'pwsh.exe'\" | " +
            "Where-Object { `$_.ProcessId -ne `$PID -and `$_.CommandLine -and `$_.CommandLine -match '(?i)(^|\\s)-File\\s+.*FasaInternalNotifier\\.ps1' } | " +
            "ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }";

        try
        {
            Process process = Process.Start(new ProcessStartInfo
            {
                FileName = GetPowerShellPath(),
                Arguments = "-NoProfile -ExecutionPolicy Bypass -Command " + Quote(command),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });

            if (process != null)
            {
                process.WaitForExit(5000);
            }
        }
        catch
        {
        }
    }

    private static void StartNotifier(string installDir)
    {
        string exePath = Path.Combine(installDir, "FasaNotifierApp.exe");

        Process.Start(new ProcessStartInfo
        {
            FileName = exePath,
            WorkingDirectory = installDir,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    private static string GetPowerShellPath()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.System),
            @"WindowsPowerShell\v1.0\powershell.exe"
        );
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}
"@

Set-Content -LiteralPath $singleInstallerSource -Value $singleInstallerCode -Encoding UTF8

Add-Type `
  -Path $singleInstallerSource `
  -ReferencedAssemblies @("System.Windows.Forms.dll", "System.Drawing.dll") `
  -OutputAssembly $singleInstallerExe `
  -OutputType WindowsApplication

Write-Output "APP_EXE=$appExe"
Write-Output "INSTALLER_EXE=$installerExe"
Write-Output "SINGLE_INSTALLER_EXE=$singleInstallerExe"
Write-Output "PACKAGE_DIR=$packageDir"
