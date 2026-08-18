using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Forms = System.Windows.Forms;
using Drawing = System.Drawing;
using WpfApplication = System.Windows.Application;
using WpfMessageBox = System.Windows.MessageBox;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        return new FasaNotifierRuntime(args).Run();
    }
}

internal sealed class NotifierConfig
{
    public string BaseUrl;
    public string Token;
    public int IntervalSeconds;
}

internal sealed class NotificationDto
{
    public string Id;
    public string Type;
    public string Title;
    public string Body;
    public string Href;
    public string DownloadHref;
    public string WindowsDownloadHref;
    public string DownloadLabel;
    public string CertificadoId;
    public string CreatedAt;
}

internal sealed class SummaryDto
{
    public int ActiveCount;
    public NotificationDto LatestNotification;
}

internal sealed class NotifierState
{
    public string LastSeenId;
}

internal sealed class CliOptions
{
    public string ConfigPath;
    public bool SelfTest;
    public bool PreviewPopup;
    public bool RunOnce;
}

internal sealed class FasaNotifierRuntime
{
    private const string AppName = "Fasa Certificados";
    private const string MutexName = "FasaCertificadosInternalNotifier";

    private readonly string[] args;
    private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
    private readonly string appDir = AppDomain.CurrentDomain.BaseDirectory;
    private readonly string appDataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FasaCertificados"
    );

    private string statePath;
    private string logPath;
    private string iconPath;
    private CliOptions options;
    private NotifierConfig config;
    private NotifierState state;
    private WpfApplication application;
    private Forms.NotifyIcon notifyIcon;
    private Drawing.Icon trayIcon;
    private Mutex singleInstanceMutex;
    private DispatcherTimer pollTimer;
    private readonly List<NotificationWindow> activeWindows = new List<NotificationWindow>();
    private DateTime startedAtUtc;
    private bool isChecking;
    private bool shouldExitAfterCheck;

    public FasaNotifierRuntime(string[] args)
    {
        this.args = args ?? new string[0];
        this.statePath = Path.Combine(this.appDataDir, "internal-notifier-state.json");
        this.logPath = Path.Combine(this.appDataDir, "internal-notifier.log");
        this.iconPath = ResolveIconPath();
        this.startedAtUtc = DateTime.UtcNow;
    }

    public int Run()
    {
        try
        {
            this.options = ParseOptions(this.args);
            this.config = ReadConfig(this.options.ConfigPath);

            if (this.options.SelfTest)
            {
                SummaryDto summary = LoadSummary();
                Log("Conexao validada. Notificacoes ativas: " + summary.ActiveCount.ToString(CultureInfo.InvariantCulture) + ".");

                if (!this.options.PreviewPopup)
                {
                    WpfMessageBox.Show(
                        BuildSelfTestMessage(summary),
                        AppName,
                        MessageBoxButton.OK,
                        MessageBoxImage.Information
                    );
                    return 0;
                }
            }

            this.application = new WpfApplication();
            this.application.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            if (this.options.PreviewPopup)
            {
                ShowPreviewPopup();
                return this.application.Run();
            }

            bool createdNew = false;
            this.singleInstanceMutex = new Mutex(true, MutexName, out createdNew);

            if (!createdNew)
            {
                Log("Notificador ja estava em execucao. Nova instancia encerrada.");
                return 0;
            }

            this.state = ReadState();
            CreateTrayIcon();
            StartPolling(this.options.RunOnce);

            return this.application.Run();
        }
        catch (Exception ex)
        {
            Log("Falha critica: " + ex.Message);
            WpfMessageBox.Show(
                "Nao foi possivel iniciar o notificador Fasa.\n\n" + ex.Message,
                AppName,
                MessageBoxButton.OK,
                MessageBoxImage.Warning
            );
            return 1;
        }
        finally
        {
            DisposeResources();
        }
    }

    private CliOptions ParseOptions(string[] input)
    {
        CliOptions parsed = new CliOptions();

        for (int index = 0; index < input.Length; index++)
        {
            string arg = input[index] ?? string.Empty;
            string normalized = arg.Trim().ToLowerInvariant();

            if (normalized == "--self-test" || normalized == "-selftest")
            {
                parsed.SelfTest = true;
                continue;
            }

            if (normalized == "--preview-popup" || normalized == "-previewpopup")
            {
                parsed.PreviewPopup = true;
                continue;
            }

            if (normalized == "--run-once" || normalized == "-runonce")
            {
                parsed.RunOnce = true;
                continue;
            }

            if ((normalized == "--config" || normalized == "-configpath") && index + 1 < input.Length)
            {
                parsed.ConfigPath = input[index + 1];
                index++;
            }
        }

        return parsed;
    }

    private NotifierConfig ReadConfig(string configuredPath)
    {
        string configPath = string.IsNullOrWhiteSpace(configuredPath)
            ? Path.Combine(this.appDir, "config.local.json")
            : configuredPath;

        if (!File.Exists(configPath))
        {
            throw new InvalidOperationException("Arquivo de configuracao nao encontrado: " + configPath + ".");
        }

        Dictionary<string, object> map = ParseJsonObject(File.ReadAllText(configPath, Encoding.UTF8));
        string baseUrl = GetString(map, "baseUrl");
        string token = GetString(map, "token");
        int intervalSeconds = GetInt(map, "intervalSeconds", 60);

        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new InvalidOperationException("baseUrl nao informado em config.local.json.");
        }

        if (string.IsNullOrWhiteSpace(token) || token == "cole_o_mesmo_valor_do_WINDOWS_NOTIFIER_TOKEN")
        {
            throw new InvalidOperationException("token nao informado em config.local.json.");
        }

        if (intervalSeconds < 30)
        {
            intervalSeconds = 30;
        }

        if (intervalSeconds > 3600)
        {
            intervalSeconds = 3600;
        }

        return new NotifierConfig
        {
            BaseUrl = baseUrl.Trim().TrimEnd('/'),
            Token = token.Trim(),
            IntervalSeconds = intervalSeconds
        };
    }

    private Dictionary<string, object> ParseJsonObject(string raw)
    {
        object value = this.serializer.DeserializeObject(raw);
        Dictionary<string, object> map = value as Dictionary<string, object>;

        if (map == null)
        {
            throw new InvalidOperationException("JSON invalido.");
        }

        return map;
    }

    private string GetString(IDictionary<string, object> map, string key)
    {
        object value;

        if (!map.TryGetValue(key, out value) || value == null)
        {
            return null;
        }

        return Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    private int GetInt(IDictionary<string, object> map, string key, int fallback)
    {
        object value;

        if (!map.TryGetValue(key, out value) || value == null)
        {
            return fallback;
        }

        int parsed;

        if (int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
        {
            return parsed;
        }

        return fallback;
    }

    private SummaryDto LoadSummary()
    {
        string uri = JoinAppUrl(this.config.BaseUrl, "/api/internal-notifications/windows/summary");
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(uri);
        request.Method = "GET";
        request.Timeout = 20000;
        request.ReadWriteTimeout = 20000;
        request.Accept = "application/json";
        request.Headers[HttpRequestHeader.Authorization] = "Bearer " + this.config.Token;

        try
        {
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (Stream stream = response.GetResponseStream())
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
            {
                string raw = reader.ReadToEnd();
                Dictionary<string, object> map = ParseJsonObject(raw);

                SummaryDto summary = new SummaryDto();
                summary.ActiveCount = GetInt(map, "active_count", 0);
                summary.LatestNotification = ParseNotification(map);
                return summary;
            }
        }
        catch (WebException ex)
        {
            HttpWebResponse response = ex.Response as HttpWebResponse;
            string status = response == null ? "sem resposta" : ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture);
            throw new InvalidOperationException("Nao foi possivel consultar as notificacoes internas. Status: " + status + ".");
        }
    }

    private NotificationDto ParseNotification(IDictionary<string, object> summary)
    {
        object latestValue;

        if (!summary.TryGetValue("latest_notification", out latestValue) || latestValue == null)
        {
            return null;
        }

        Dictionary<string, object> latest = latestValue as Dictionary<string, object>;

        if (latest == null)
        {
            return null;
        }

        return new NotificationDto
        {
            Id = GetString(latest, "id"),
            Type = GetString(latest, "type"),
            Title = GetString(latest, "title"),
            Body = GetString(latest, "body"),
            Href = GetString(latest, "href"),
            DownloadHref = GetString(latest, "downloadHref"),
            WindowsDownloadHref = GetString(latest, "windowsDownloadHref"),
            DownloadLabel = GetString(latest, "downloadLabel"),
            CertificadoId = GetString(latest, "certificadoId"),
            CreatedAt = GetString(latest, "createdAt")
        };
    }

    private NotifierState ReadState()
    {
        if (!File.Exists(this.statePath))
        {
            return new NotifierState();
        }

        try
        {
            Dictionary<string, object> map = ParseJsonObject(File.ReadAllText(this.statePath, Encoding.UTF8));
            return new NotifierState
            {
                LastSeenId = GetString(map, "LastSeenId")
            };
        }
        catch
        {
            return new NotifierState();
        }
    }

    private void SaveState(string lastSeenId)
    {
        EnsureAppDataDir();
        Dictionary<string, object> map = new Dictionary<string, object>();
        map["LastSeenId"] = lastSeenId;
        File.WriteAllText(this.statePath, this.serializer.Serialize(map), Encoding.UTF8);
    }

    private void CreateTrayIcon()
    {
        this.trayIcon = LoadTrayIcon();
        this.notifyIcon = new Forms.NotifyIcon();
        this.notifyIcon.Icon = this.trayIcon;
        this.notifyIcon.Text = "Fasa Certificados";
        this.notifyIcon.Visible = true;

        Forms.ContextMenuStrip menu = new Forms.ContextMenuStrip();
        Forms.ToolStripMenuItem openItem = new Forms.ToolStripMenuItem("Abrir central");
        openItem.Click += delegate { OpenUrl(JoinAppUrl(this.config.BaseUrl, "/notificacoes-internas")); };
        Forms.ToolStripMenuItem previewItem = new Forms.ToolStripMenuItem("Mostrar teste");
        previewItem.Click += delegate { ShowPreviewPopup(); };
        Forms.ToolStripMenuItem exitItem = new Forms.ToolStripMenuItem("Sair");
        exitItem.Click += delegate { Shutdown(); };

        menu.Items.Add(openItem);
        menu.Items.Add(previewItem);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add(exitItem);
        this.notifyIcon.ContextMenuStrip = menu;
    }

    private void StartPolling(bool runOnce)
    {
        this.shouldExitAfterCheck = runOnce;
        this.pollTimer = new DispatcherTimer();
        this.pollTimer.Interval = TimeSpan.FromSeconds(this.config.IntervalSeconds);
        this.pollTimer.Tick += delegate { CheckForNotificationsAsync(false); };
        this.pollTimer.Start();
        this.application.Dispatcher.BeginInvoke(new Action(delegate { CheckForNotificationsAsync(runOnce); }));
        Log("Notificador WPF iniciado. Intervalo: " + this.config.IntervalSeconds.ToString(CultureInfo.InvariantCulture) + "s. BaseUrl: " + this.config.BaseUrl + ".");
    }

    private void CheckForNotificationsAsync(bool runOnce)
    {
        if (this.isChecking)
        {
            return;
        }

        this.isChecking = true;
        ThreadPool.QueueUserWorkItem(delegate
        {
            SummaryDto summary = null;
            Exception failure = null;

            try
            {
                summary = LoadSummary();
            }
            catch (Exception ex)
            {
                failure = ex;
            }

            this.application.Dispatcher.BeginInvoke(new Action(delegate
            {
                this.isChecking = false;

                if (failure != null)
                {
                    Log("Falha ao consultar notificacoes: " + failure.Message);
                }
                else
                {
                    ProcessSummary(summary);
                }

                if (runOnce || this.shouldExitAfterCheck)
                {
                    Shutdown();
                }
            }));
        });
    }

    private void ProcessSummary(SummaryDto summary)
    {
        if (summary == null || summary.LatestNotification == null || string.IsNullOrWhiteSpace(summary.LatestNotification.Id))
        {
            return;
        }

        NotificationDto latest = summary.LatestNotification;

        if (this.state == null)
        {
            this.state = new NotifierState();
        }

        if (latest.Id == this.state.LastSeenId)
        {
            return;
        }

        bool hasBaseline = !string.IsNullOrWhiteSpace(this.state.LastSeenId);

        if (hasBaseline || NotificationCreatedAfterStartup(latest))
        {
            ShowNotification(latest);
            Log("Popup WPF exibido para notificacao " + latest.Id + ".");
        }
        else
        {
            Log("Linha de base definida em " + latest.Id + ".");
        }

        this.state.LastSeenId = latest.Id;
        SaveState(this.state.LastSeenId);
    }

    private bool NotificationCreatedAfterStartup(NotificationDto notification)
    {
        if (notification == null || string.IsNullOrWhiteSpace(notification.CreatedAt))
        {
            return false;
        }

        DateTimeOffset createdAt;

        if (!DateTimeOffset.TryParse(notification.CreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out createdAt))
        {
            return false;
        }

        return createdAt.UtcDateTime > this.startedAtUtc.AddSeconds(-2);
    }

    private void ShowNotification(NotificationDto notification)
    {
        string url = JoinAppUrl(this.config.BaseUrl, notification.Href);
        string downloadPath = ResolveCertificateDownloadPath(notification);
        string downloadUrl = string.IsNullOrWhiteSpace(downloadPath)
            ? null
            : JoinAppUrl(this.config.BaseUrl, downloadPath);

        ShowWindow(new NotificationWindow(notification, url, downloadUrl, this.config.Token, this.iconPath));
    }

    private string ResolveCertificateDownloadPath(NotificationDto notification)
    {
        if (notification == null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(notification.WindowsDownloadHref))
        {
            return notification.WindowsDownloadHref;
        }

        bool certificateNotification =
            string.Equals(notification.Type, "certificate_created", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(notification.Type, "certificate_updated", StringComparison.OrdinalIgnoreCase);

        if (!certificateNotification || string.IsNullOrWhiteSpace(notification.Id))
        {
            return null;
        }

        return "/api/internal-notifications/windows/" + notification.Id + "/certificate-file";
    }

    private void ShowPreviewPopup()
    {
        NotificationDto preview = new NotificationDto
        {
            Id = "preview",
            Title = "Teste do notificador Fasa",
            Body = "Esta janela confirma que as notificacoes internas aparecem na tela.",
            Href = "/notificacoes-internas",
            CreatedAt = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture)
        };

        ShowWindow(new NotificationWindow(preview, JoinAppUrl(this.config.BaseUrl, preview.Href), null, this.config.Token, this.iconPath));
    }

    private void ShowWindow(NotificationWindow window)
    {
        this.activeWindows.Add(window);
        ArrangeNotificationWindows(true);

        window.Closed += delegate
        {
            this.activeWindows.Remove(window);
            ArrangeNotificationWindows(true);

            if (this.options != null && this.options.PreviewPopup && this.notifyIcon == null && this.activeWindows.Count == 0)
            {
                Shutdown();
            }
        };
        window.Show();
    }

    private void ArrangeNotificationWindows(bool animate)
    {
        Rect area = SystemParameters.WorkArea;
        const double margin = 24;
        const double gap = 12;
        double nextBottom = area.Bottom - margin;

        for (int index = this.activeWindows.Count - 1; index >= 0; index--)
        {
            NotificationWindow window = this.activeWindows[index];

            if (window == null)
            {
                continue;
            }

            double left = area.Right - window.Width - margin;
            double top = nextBottom - window.Height;

            if (top < area.Top + margin)
            {
                top = area.Top + margin;
            }

            window.MoveTo(left, top, animate);
            nextBottom = top - gap;
        }
    }

    private string BuildSelfTestMessage(SummaryDto summary)
    {
        StringBuilder builder = new StringBuilder();
        builder.AppendLine("Conexao validada.");
        builder.AppendLine("Notificacoes ativas: " + summary.ActiveCount.ToString(CultureInfo.InvariantCulture));

        if (summary.LatestNotification != null && !string.IsNullOrWhiteSpace(summary.LatestNotification.Title))
        {
            builder.AppendLine("Ultima notificacao: " + summary.LatestNotification.Title);
        }
        else
        {
            builder.AppendLine("Nenhuma notificacao interna ativa.");
        }

        return builder.ToString();
    }

    private string JoinAppUrl(string baseUrl, string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return baseUrl + "/notificacoes-internas";
        }

        if (path.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || path.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return path;
        }

        if (!path.StartsWith("/", StringComparison.Ordinal))
        {
            path = "/" + path;
        }

        return baseUrl + path;
    }

    private string ResolveIconPath()
    {
        string local = Path.Combine(this.appDir, "fasa.ico");

        if (File.Exists(local))
        {
            return local;
        }

        string sourceTree = Path.GetFullPath(Path.Combine(this.appDir, "..", "..", "src", "app", "favicon.ico"));

        if (File.Exists(sourceTree))
        {
            return sourceTree;
        }

        return null;
    }

    private Drawing.Icon LoadTrayIcon()
    {
        if (!string.IsNullOrWhiteSpace(this.iconPath) && File.Exists(this.iconPath))
        {
            try
            {
                return new Drawing.Icon(this.iconPath);
            }
            catch (Exception ex)
            {
                Log("Falha ao carregar icone: " + ex.Message);
            }
        }

        return (Drawing.Icon)Drawing.SystemIcons.Information.Clone();
    }

    private void OpenUrl(string url)
    {
        try
        {
            ProcessStartInfo info = new ProcessStartInfo(url);
            info.UseShellExecute = true;
            Process.Start(info);
        }
        catch (Exception ex)
        {
            Log("Falha ao abrir URL: " + ex.Message);
        }
    }

    private void Shutdown()
    {
        if (this.pollTimer != null)
        {
            this.pollTimer.Stop();
        }

        if (this.application != null)
        {
            this.application.Shutdown();
        }
    }

    private void DisposeResources()
    {
        if (this.notifyIcon != null)
        {
            this.notifyIcon.Visible = false;
            this.notifyIcon.Dispose();
            this.notifyIcon = null;
        }

        if (this.trayIcon != null)
        {
            this.trayIcon.Dispose();
            this.trayIcon = null;
        }

        if (this.singleInstanceMutex != null)
        {
            try
            {
                this.singleInstanceMutex.ReleaseMutex();
            }
            catch
            {
            }

            this.singleInstanceMutex.Dispose();
            this.singleInstanceMutex = null;
        }

        Log("Notificador WPF encerrado.");
    }

    private void EnsureAppDataDir()
    {
        if (!Directory.Exists(this.appDataDir))
        {
            Directory.CreateDirectory(this.appDataDir);
        }
    }

    private void Log(string message)
    {
        try
        {
            EnsureAppDataDir();
            File.AppendAllText(
                this.logPath,
                "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + "] " + message + Environment.NewLine,
                Encoding.UTF8
            );
        }
        catch
        {
        }
    }
}

internal sealed class NotificationWindow : Window
{
    private readonly NotificationDto notification;
    private readonly string url;
    private readonly string downloadUrl;
    private readonly string downloadToken;
    private readonly string iconPath;

    public NotificationWindow(NotificationDto notification, string url, string downloadUrl, string downloadToken, string iconPath)
    {
        this.notification = notification;
        this.url = url;
        this.downloadUrl = downloadUrl;
        this.downloadToken = downloadToken;
        this.iconPath = iconPath;

        this.Width = 580;
        this.Height = 274;
        this.WindowStyle = WindowStyle.None;
        this.ResizeMode = ResizeMode.NoResize;
        this.AllowsTransparency = true;
        this.Background = Brushes.Transparent;
        this.ShowInTaskbar = false;
        this.Topmost = true;
        this.ShowActivated = true;
        this.SnapsToDevicePixels = true;
        this.UseLayoutRounding = true;
        this.Opacity = 0;
        this.Content = BuildContent();

        if (!string.IsNullOrWhiteSpace(this.iconPath) && File.Exists(this.iconPath))
        {
            try
            {
                this.Icon = BitmapFrame.Create(new Uri(this.iconPath, UriKind.Absolute));
            }
            catch
            {
            }
        }

        this.Loaded += delegate
        {
            BeginEntranceAnimation();
        };
        this.KeyDown += delegate(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                this.Close();
            }

            if (e.Key == Key.Enter)
            {
                OpenNotification();
            }
        };
        this.MouseLeftButtonDown += delegate
        {
            try
            {
                this.DragMove();
            }
            catch
            {
            }
        };
    }

    private UIElement BuildContent()
    {
        Grid root = new Grid();
        root.Margin = new Thickness(14);

        Border card = new Border();
        card.Background = HexBrush("#ffffff");
        card.BorderBrush = HexBrush("#dbeafe");
        card.BorderThickness = new Thickness(1);
        card.CornerRadius = new CornerRadius(24);
        card.Effect = new DropShadowEffect
        {
            Color = ColorFromHex("#0f172a"),
            BlurRadius = 26,
            ShadowDepth = 8,
            Opacity = 0.20,
            Direction = 270
        };

        Grid layout = new Grid();
        layout.ClipToBounds = true;
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(92) });
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(76) });
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(78) });

        Border headerBand = new Border();
        headerBand.Background = HexBrush("#f8fbff");
        headerBand.CornerRadius = new CornerRadius(24, 24, 0, 0);
        Grid.SetRow(headerBand, 0);
        layout.Children.Add(headerBand);

        Grid header = new Grid();
        header.Margin = new Thickness(26, 24, 26, 0);
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(62) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(44) });
        Grid.SetRow(header, 0);

        header.Children.Add(BuildLogo());

        StackPanel textStack = new StackPanel();
        textStack.VerticalAlignment = VerticalAlignment.Top;
        Grid.SetColumn(textStack, 1);
        textStack.Children.Add(BuildMetaRow());

        TextBlock title = new TextBlock();
        title.Text = SafeTitle();
        title.Margin = new Thickness(0, 9, 0, 0);
        title.Foreground = HexBrush("#0f172a");
        title.FontFamily = new FontFamily("Segoe UI");
        title.FontSize = 15;
        title.FontWeight = FontWeights.SemiBold;
        title.TextTrimming = TextTrimming.CharacterEllipsis;
        title.UseLayoutRounding = true;
        textStack.Children.Add(title);

        header.Children.Add(textStack);

        Button closeIcon = CreateTextButton("x", 34, 34, "#f8fbff", "#e2e8f0", "#64748b", "#0f172a", "#dbeafe", "#bfdbfe");
        closeIcon.FontSize = 15;
        closeIcon.FontWeight = FontWeights.Bold;
        closeIcon.Click += delegate { this.Close(); };
        Grid.SetColumn(closeIcon, 2);
        header.Children.Add(closeIcon);
        layout.Children.Add(header);

        TextBlock body = new TextBlock();
        body.Text = SafeBody();
        body.Margin = new Thickness(28, 14, 28, 10);
        body.Foreground = HexBrush("#475569");
        body.FontFamily = new FontFamily("Segoe UI");
        body.FontSize = 13;
        body.LineHeight = 20;
        body.TextWrapping = TextWrapping.Wrap;
        body.TextTrimming = TextTrimming.CharacterEllipsis;
        body.MaxHeight = 48;
        Grid.SetRow(body, 1);
        layout.Children.Add(body);

        Border divider = new Border();
        divider.Height = 1;
        divider.Background = HexBrush("#e2e8f0");
        divider.VerticalAlignment = VerticalAlignment.Bottom;
        divider.Margin = new Thickness(28, 0, 28, 0);
        Grid.SetRow(divider, 1);
        layout.Children.Add(divider);

        Grid footer = new Grid();
        footer.Margin = new Thickness(28, 16, 28, 18);
        bool hasDownloadAction = HasDownloadAction();
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(88) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(112) });
        if (hasDownloadAction)
        {
            footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(148) });
        }
        Grid.SetRow(footer, 2);

        TextBlock product = new TextBlock();
        product.Text = "Fasa Certificados";
        product.VerticalAlignment = VerticalAlignment.Center;
        product.Foreground = HexBrush("#64748b");
        product.FontFamily = new FontFamily("Segoe UI");
        product.FontSize = 12;
        Grid.SetColumn(product, 0);
        footer.Children.Add(product);

        Button closeButton = CreateTextButton("Fechar", 88, 40, "#ffffff", "#f8fafc", "#334155", "#0f172a", "#cbd5e1", "#94a3b8");
        closeButton.Click += delegate { this.Close(); };
        Grid.SetColumn(closeButton, 1);
        footer.Children.Add(closeButton);

        Button openButton = hasDownloadAction
            ? CreateTextButton("Abrir aviso", 112, 40, "#ffffff", "#f8fafc", "#334155", "#0f172a", "#cbd5e1", "#94a3b8")
            : CreateTextButton("Abrir aviso", 112, 40, "#2563eb", "#1d4ed8", "#ffffff", "#ffffff", "#2563eb", "#1d4ed8");
        openButton.Click += delegate { OpenNotification(); };
        Grid.SetColumn(openButton, 3);
        footer.Children.Add(openButton);

        if (hasDownloadAction)
        {
            Button downloadButton = CreateTextButton(SafeDownloadLabel(), 148, 40, "#2563eb", "#1d4ed8", "#ffffff", "#ffffff", "#2563eb", "#1d4ed8");
            downloadButton.Click += delegate { StartDownload(downloadButton); };
            Grid.SetColumn(downloadButton, 5);
            footer.Children.Add(downloadButton);
        }

        layout.Children.Add(footer);
        card.Child = layout;
        root.Children.Add(card);
        return root;
    }

    private UIElement BuildLogo()
    {
        Border logoShell = new Border();
        logoShell.Width = 50;
        logoShell.Height = 50;
        logoShell.Background = HexBrush("#eff6ff");
        logoShell.BorderBrush = HexBrush("#bfdbfe");
        logoShell.BorderThickness = new Thickness(1);
        logoShell.CornerRadius = new CornerRadius(18);
        logoShell.HorizontalAlignment = HorizontalAlignment.Left;
        logoShell.VerticalAlignment = VerticalAlignment.Top;

        if (!string.IsNullOrWhiteSpace(this.iconPath) && File.Exists(this.iconPath))
        {
            try
            {
                Image image = new Image();
                image.Source = BitmapFrame.Create(new Uri(this.iconPath, UriKind.Absolute));
                image.Width = 31;
                image.Height = 31;
                image.Stretch = Stretch.Uniform;
                logoShell.Child = image;
                return logoShell;
            }
            catch
            {
            }
        }

        TextBlock fallback = new TextBlock();
        fallback.Text = "F";
        fallback.Foreground = HexBrush("#2563eb");
        fallback.FontFamily = new FontFamily("Segoe UI");
        fallback.FontSize = 18;
        fallback.FontWeight = FontWeights.Bold;
        fallback.HorizontalAlignment = HorizontalAlignment.Center;
        fallback.VerticalAlignment = VerticalAlignment.Center;
        logoShell.Child = fallback;
        return logoShell;
    }

    private UIElement BuildMetaRow()
    {
        Grid row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(12) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        Border pill = new Border();
        pill.Background = HexBrush("#eff6ff");
        pill.BorderBrush = HexBrush("#bfdbfe");
        pill.BorderThickness = new Thickness(1);
        pill.CornerRadius = new CornerRadius(12);
        pill.Padding = new Thickness(12, 4, 12, 5);

        TextBlock pillText = new TextBlock();
        pillText.Text = "Aviso interno";
        pillText.Foreground = HexBrush("#1d4ed8");
        pillText.FontFamily = new FontFamily("Segoe UI");
        pillText.FontSize = 11;
        pillText.FontWeight = FontWeights.SemiBold;
        pill.Child = pillText;
        row.Children.Add(pill);

        StackPanel meta = new StackPanel();
        meta.Orientation = Orientation.Horizontal;
        meta.HorizontalAlignment = HorizontalAlignment.Right;
        meta.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(meta, 2);

        TextBlock brand = new TextBlock();
        brand.Text = "Fasa Certificados";
        brand.Foreground = HexBrush("#64748b");
        brand.FontFamily = new FontFamily("Segoe UI");
        brand.FontSize = 12;
        brand.Margin = new Thickness(0, 0, 14, 0);
        meta.Children.Add(brand);

        TextBlock time = new TextBlock();
        time.Text = "Agora";
        time.Foreground = HexBrush("#64748b");
        time.FontFamily = new FontFamily("Segoe UI");
        time.FontSize = 12;
        meta.Children.Add(time);

        row.Children.Add(meta);
        return row;
    }

    private Button CreateTextButton(
        string text,
        double width,
        double height,
        string back,
        string hoverBack,
        string fore,
        string hoverFore,
        string border,
        string hoverBorder)
    {
        Button button = new Button();
        button.Content = text;
        button.Width = width;
        button.Height = height;
        button.Background = HexBrush(back);
        button.Foreground = HexBrush(fore);
        button.BorderBrush = HexBrush(border);
        button.BorderThickness = new Thickness(1);
        button.Cursor = Cursors.Hand;
        button.FontFamily = new FontFamily("Segoe UI");
        button.FontSize = 13;
        button.FontWeight = FontWeights.SemiBold;
        button.FocusVisualStyle = null;
        button.Template = CreateRoundedButtonTemplate();
        button.MouseEnter += delegate
        {
            button.Background = HexBrush(hoverBack);
            button.Foreground = HexBrush(hoverFore);
            button.BorderBrush = HexBrush(hoverBorder);
        };
        button.MouseLeave += delegate
        {
            button.Background = HexBrush(back);
            button.Foreground = HexBrush(fore);
            button.BorderBrush = HexBrush(border);
        };

        return button;
    }

    private ControlTemplate CreateRoundedButtonTemplate()
    {
        FrameworkElementFactory border = new FrameworkElementFactory(typeof(Border));
        border.Name = "buttonBorder";
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(14));
        border.SetBinding(Border.BackgroundProperty, new Binding("Background") { RelativeSource = RelativeSource.TemplatedParent });
        border.SetBinding(Border.BorderBrushProperty, new Binding("BorderBrush") { RelativeSource = RelativeSource.TemplatedParent });
        border.SetBinding(Border.BorderThicknessProperty, new Binding("BorderThickness") { RelativeSource = RelativeSource.TemplatedParent });
        border.SetValue(Border.SnapsToDevicePixelsProperty, true);

        FrameworkElementFactory presenter = new FrameworkElementFactory(typeof(ContentPresenter));
        presenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        presenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        presenter.SetValue(ContentPresenter.RecognizesAccessKeyProperty, false);
        border.AppendChild(presenter);

        ControlTemplate template = new ControlTemplate(typeof(Button));
        template.VisualTree = border;
        return template;
    }

    private string SafeTitle()
    {
        if (this.notification != null && !string.IsNullOrWhiteSpace(this.notification.Title))
        {
            return this.notification.Title;
        }

        return "Nova notificacao interna";
    }

    private string SafeBody()
    {
        if (this.notification != null && !string.IsNullOrWhiteSpace(this.notification.Body))
        {
            return this.notification.Body;
        }

        return "Abra a central interna para revisar.";
    }

    private bool HasDownloadAction()
    {
        return !string.IsNullOrWhiteSpace(this.downloadUrl);
    }

    private string SafeDownloadLabel()
    {
        if (this.notification != null && !string.IsNullOrWhiteSpace(this.notification.DownloadLabel))
        {
            return this.notification.DownloadLabel;
        }

        return "Baixar certificado";
    }

    public void MoveTo(double left, double top, bool animate)
    {
        if (!animate || !this.IsLoaded)
        {
            this.BeginAnimation(Window.LeftProperty, null);
            this.BeginAnimation(Window.TopProperty, null);
            this.Left = left;
            this.Top = top;
            return;
        }

        CubicEase ease = new CubicEase();
        ease.EasingMode = EasingMode.EaseOut;

        DoubleAnimation slideX = new DoubleAnimation(this.Left, left, TimeSpan.FromMilliseconds(160));
        slideX.EasingFunction = ease;
        DoubleAnimation slideY = new DoubleAnimation(this.Top, top, TimeSpan.FromMilliseconds(160));
        slideY.EasingFunction = ease;
        this.BeginAnimation(Window.LeftProperty, slideX);
        this.BeginAnimation(Window.TopProperty, slideY);
    }

    private void BeginEntranceAnimation()
    {
        CubicEase ease = new CubicEase();
        ease.EasingMode = EasingMode.EaseOut;
        double targetLeft = this.Left;
        double targetTop = this.Top;
        this.Left = targetLeft + 24;
        this.Top = targetTop + 18;

        DoubleAnimation fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(180));
        fade.EasingFunction = ease;
        this.BeginAnimation(Window.OpacityProperty, fade);

        DoubleAnimation slideX = new DoubleAnimation(this.Left, targetLeft, TimeSpan.FromMilliseconds(180));
        slideX.EasingFunction = ease;
        DoubleAnimation slideY = new DoubleAnimation(this.Top, targetTop, TimeSpan.FromMilliseconds(180));
        slideY.EasingFunction = ease;
        this.BeginAnimation(Window.LeftProperty, slideX);
        this.BeginAnimation(Window.TopProperty, slideY);
    }

    private void OpenNotification()
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(this.url))
            {
                ProcessStartInfo info = new ProcessStartInfo(this.url);
                info.UseShellExecute = true;
                Process.Start(info);
            }
        }
        catch
        {
        }

        this.Close();
    }

    private void StartDownload(Button button)
    {
        if (!HasDownloadAction())
        {
            return;
        }

        object originalContent = button.Content;
        button.IsEnabled = false;
        button.Content = "Baixando...";

        ThreadPool.QueueUserWorkItem(delegate
        {
            string downloadedPath = null;
            Exception failure = null;

            try
            {
                downloadedPath = DownloadCertificateToDownloads();
            }
            catch (Exception ex)
            {
                failure = ex;
            }

            this.Dispatcher.BeginInvoke(new Action(delegate
            {
                button.Content = originalContent;
                button.IsEnabled = true;

                if (failure != null)
                {
                    WpfMessageBox.Show(
                        BuildDownloadFailureMessage(failure),
                        "Fasa Certificados",
                        MessageBoxButton.OK,
                        MessageBoxImage.Warning
                    );
                    return;
                }

                WpfMessageBox.Show(
                    "Certificado baixado em:" + Environment.NewLine + downloadedPath,
                    "Fasa Certificados",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information
                );
                this.Close();
            }));
        });
    }

    private string BuildDownloadFailureMessage(Exception failure)
    {
        string detail = GetDownloadFailureDetail(failure);
        string message = "Nao foi possivel baixar o certificado.";

        if (!string.IsNullOrWhiteSpace(detail))
        {
            message += Environment.NewLine + Environment.NewLine + detail;
        }
        else
        {
            message += " Verifique a conexao do notificador e tente novamente.";
        }

        return message;
    }

    private string GetDownloadFailureDetail(Exception failure)
    {
        WebException webException = failure as WebException;

        if (webException != null)
        {
            HttpWebResponse response = webException.Response as HttpWebResponse;

            if (response != null)
            {
                int status = (int)response.StatusCode;

                if (status == 401 || status == 403)
                {
                    return "O token do notificador foi recusado. Confira WINDOWS_NOTIFIER_TOKEN na Vercel e no app instalado.";
                }

                if (status == 404)
                {
                    return "O servidor ainda nao tem a rota de download direto publicada. Faca o deploy do projeto atualizado na Vercel.";
                }

                if (status == 502)
                {
                    return "O servidor nao conseguiu ler o PFX no Storage. Verifique se o certificado existe no bucket privado.";
                }

                return "Servidor retornou status " + status.ToString(CultureInfo.InvariantCulture) + ".";
            }

            return "Servidor indisponivel ou sem resposta. Verifique a internet e a URL configurada.";
        }

        if (failure is UnauthorizedAccessException)
        {
            return "O Windows nao permitiu gravar na pasta Downloads.";
        }

        if (failure is IOException)
        {
            return "Nao foi possivel gravar o arquivo na pasta Downloads.";
        }

        if (!string.IsNullOrWhiteSpace(failure.Message))
        {
            return failure.Message;
        }

        return null;
    }

    private string DownloadCertificateToDownloads()
    {
        if (string.IsNullOrWhiteSpace(this.downloadUrl))
        {
            throw new InvalidOperationException("Link de download nao informado.");
        }

        if (string.IsNullOrWhiteSpace(this.downloadToken))
        {
            throw new InvalidOperationException("Token do notificador nao configurado.");
        }

        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(this.downloadUrl);
        request.Method = "GET";
        request.Headers[HttpRequestHeader.Authorization] = "Bearer " + this.downloadToken;
        request.Accept = "application/x-pkcs12, application/octet-stream";
        request.Timeout = 30000;

        using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
        {
            if ((int)response.StatusCode < 200 || (int)response.StatusCode >= 300)
            {
                throw new InvalidOperationException("Servidor retornou status " + ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture) + ".");
            }

            string downloadsDir = GetDownloadsDirectory();
            Directory.CreateDirectory(downloadsDir);

            string fileName = SanitizeFileName(ReadFileNameFromResponse(response));
            string targetPath = GetAvailableDownloadPath(downloadsDir, fileName);

            using (Stream responseStream = response.GetResponseStream())
            using (FileStream fileStream = File.Create(targetPath))
            {
                if (responseStream == null)
                {
                    throw new InvalidOperationException("Resposta de download vazia.");
                }

                byte[] buffer = new byte[81920];
                int read;

                while ((read = responseStream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    fileStream.Write(buffer, 0, read);
                }
            }

            return targetPath;
        }
    }

    private string GetDownloadsDirectory()
    {
        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

        if (string.IsNullOrWhiteSpace(userProfile))
        {
            return Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        }

        return Path.Combine(userProfile, "Downloads");
    }

    private string ReadFileNameFromResponse(HttpWebResponse response)
    {
        string disposition = response.Headers["Content-Disposition"];
        string headerFileName = ReadContentDispositionFileName(disposition);

        if (!string.IsNullOrWhiteSpace(headerFileName))
        {
            return headerFileName;
        }

        return "certificado-fasa.pfx";
    }

    private string ReadContentDispositionFileName(string header)
    {
        if (string.IsNullOrWhiteSpace(header))
        {
            return null;
        }

        string[] parts = header.Split(';');

        foreach (string rawPart in parts)
        {
            string part = rawPart.Trim();

            if (part.StartsWith("filename*=", StringComparison.OrdinalIgnoreCase))
            {
                string value = part.Substring("filename*=".Length).Trim().Trim('"');
                int encodingSeparator = value.IndexOf("''", StringComparison.Ordinal);

                if (encodingSeparator >= 0)
                {
                    value = value.Substring(encodingSeparator + 2);
                }

                return Uri.UnescapeDataString(value);
            }
        }

        foreach (string rawPart in parts)
        {
            string part = rawPart.Trim();

            if (part.StartsWith("filename=", StringComparison.OrdinalIgnoreCase))
            {
                return part.Substring("filename=".Length).Trim().Trim('"');
            }
        }

        return null;
    }

    private string SanitizeFileName(string value)
    {
        string fileName = string.IsNullOrWhiteSpace(value) ? "certificado-fasa.pfx" : Path.GetFileName(value.Trim());

        foreach (char invalidChar in Path.GetInvalidFileNameChars())
        {
            fileName = fileName.Replace(invalidChar, '-');
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = "certificado-fasa.pfx";
        }

        if (!fileName.EndsWith(".pfx", StringComparison.OrdinalIgnoreCase))
        {
            fileName += ".pfx";
        }

        return fileName;
    }

    private string GetAvailableDownloadPath(string directory, string fileName)
    {
        string candidate = Path.Combine(directory, fileName);

        if (!File.Exists(candidate))
        {
            return candidate;
        }

        string name = Path.GetFileNameWithoutExtension(fileName);
        string extension = Path.GetExtension(fileName);

        for (int index = 1; index < 1000; index++)
        {
            candidate = Path.Combine(directory, name + " (" + index.ToString(CultureInfo.InvariantCulture) + ")" + extension);

            if (!File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new IOException("Nao foi possivel encontrar um nome livre para salvar o certificado.");
    }

    private SolidColorBrush HexBrush(string value)
    {
        return new SolidColorBrush(ColorFromHex(value));
    }

    private Color ColorFromHex(string value)
    {
        return (Color)ColorConverter.ConvertFromString(value);
    }
}
