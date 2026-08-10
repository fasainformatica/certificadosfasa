using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Installer
{
    private const string AppName = "Fasa Certificados";
    private const string StartupName = "FasaCertificadosNotifier";

    private static readonly string[] PackageFiles =
    {
        "FasaNotifierApp.exe",
        "config.local.json",
        "fasa.ico",
        "INICIAR_NOTIFICADOR_FASA.bat",
        "TESTAR_NOTIFICADOR_FASA.bat",
        "README.md"
    };

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();

        try
        {
            string sourceDir = AppDomain.CurrentDomain.BaseDirectory;
            ValidatePackage(sourceDir);

            string installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FasaCertificados",
                "Notificador"
            );

            Directory.CreateDirectory(installDir);
            StopExistingNotifier();
            RemoveLegacyFiles(installDir);
            CopyPackageFiles(sourceDir, installDir);
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

    private static void ValidatePackage(string sourceDir)
    {
        string[] requiredFiles = { "FasaNotifierApp.exe", "config.local.json", "fasa.ico" };

        foreach (string fileName in requiredFiles)
        {
            string path = Path.Combine(sourceDir, fileName);

            if (!File.Exists(path))
            {
                throw new FileNotFoundException("Arquivo obrigatorio nao encontrado no pacote: " + fileName);
            }
        }
    }

    private static void CopyPackageFiles(string sourceDir, string installDir)
    {
        foreach (string fileName in PackageFiles)
        {
            string sourcePath = Path.Combine(sourceDir, fileName);

            if (File.Exists(sourcePath))
            {
                File.Copy(sourcePath, Path.Combine(installDir, fileName), true);
            }
        }
    }

    private static void RemoveLegacyFiles(string installDir)
    {
        string[] legacyFiles = { "FasaInternalNotifier.ps1" };

        foreach (string fileName in legacyFiles)
        {
            string path = Path.Combine(installDir, fileName);

            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch
            {
            }
        }
    }

    private static void RegisterStartup(string installDir)
    {
        string exePath = Path.Combine(installDir, "FasaNotifierApp.exe");
        string command = Quote(exePath);

        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
            @"Software\Microsoft\Windows\CurrentVersion\Run",
            true
        ))
        {
            if (key == null)
            {
                throw new InvalidOperationException("Nao foi possivel abrir a inicializacao do Windows para o usuario atual.");
            }

            key.SetValue(StartupName, command, RegistryValueKind.String);
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
            "Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -match '(?i)(^|\\s)-File\\s+.*FasaInternalNotifier\\.ps1' } | " +
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";

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
