[CmdletBinding()]
param(
  [string]$ConfigPath = "",
  [switch]$SelfTest,
  [switch]$PreviewPopup,
  [switch]$RunOnce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:ShouldExit = $false
$script:Config = $null
$script:LastNotificationUrl = $null
$script:StartedAtUtc = (Get-Date).ToUniversalTime()
$script:ActivePopupForms = @()
$script:ScriptDir = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$script:ResolvedConfigPath = if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath } else { Join-Path $script:ScriptDir "config.local.json" }
$script:AppDataDir = Join-Path $env:LOCALAPPDATA "FasaCertificados"
$script:StatePath = Join-Path $script:AppDataDir "internal-notifier-state.json"
$script:LogPath = Join-Path $script:AppDataDir "internal-notifier.log"

function Write-NotifierLog {
  param([string]$Message)

  if (-not (Test-Path -Path $script:AppDataDir)) {
    New-Item -ItemType Directory -Force -Path $script:AppDataDir | Out-Null
  }

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $script:LogPath -Value "[$timestamp] $Message"
}

function Show-SetupMessage {
  param([string]$Message)

  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    "Fasa Certificados",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  ) | Out-Null
}

function Read-NotifierConfig {
  if (-not (Test-Path -Path $script:ResolvedConfigPath)) {
    throw "Arquivo de configuracao nao encontrado: $script:ResolvedConfigPath. Copie config.example.json para config.local.json e preencha baseUrl e token."
  }

  $raw = Get-Content -Path $script:ResolvedConfigPath -Raw
  $config = $raw | ConvertFrom-Json
  $baseUrl = [string]$config.baseUrl
  $token = [string]$config.token
  $intervalSeconds = 60

  if ($null -ne $config.intervalSeconds) {
    $intervalSeconds = [int]$config.intervalSeconds
  }

  if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    throw "baseUrl nao informado em config.local.json."
  }

  if ([string]::IsNullOrWhiteSpace($token) -or $token -eq "cole_o_mesmo_valor_do_WINDOWS_NOTIFIER_TOKEN") {
    throw "token nao informado em config.local.json."
  }

  if ($intervalSeconds -lt 30) {
    $intervalSeconds = 30
  }

  if ($intervalSeconds -gt 3600) {
    $intervalSeconds = 3600
  }

  return [pscustomobject]@{
    BaseUrl = $baseUrl.TrimEnd("/")
    Token = $token
    IntervalSeconds = $intervalSeconds
  }
}

function Join-AppUrl {
  param(
    [string]$BaseUrl,
    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return "$BaseUrl/notificacoes-internas"
  }

  if ($Path.StartsWith("http://") -or $Path.StartsWith("https://")) {
    return $Path
  }

  if (-not $Path.StartsWith("/")) {
    $Path = "/$Path"
  }

  return "$BaseUrl$Path"
}

function Read-NotifierState {
  if (-not (Test-Path -Path $script:StatePath)) {
    return [pscustomobject]@{ LastSeenId = $null }
  }

  try {
    return (Get-Content -Path $script:StatePath -Raw | ConvertFrom-Json)
  } catch {
    return [pscustomobject]@{ LastSeenId = $null }
  }
}

function Save-NotifierState {
  param([string]$LastSeenId)

  if (-not (Test-Path -Path $script:AppDataDir)) {
    New-Item -ItemType Directory -Force -Path $script:AppDataDir | Out-Null
  }

  [pscustomobject]@{ LastSeenId = $LastSeenId } |
    ConvertTo-Json |
    Set-Content -Path $script:StatePath -Encoding UTF8
}

function Invoke-NotifierSummary {
  param($Config)

  $uri = Join-AppUrl -BaseUrl $Config.BaseUrl -Path "/api/internal-notifications/windows/summary"
  $headers = @{
    Authorization = "Bearer $($Config.Token)"
    Accept = "application/json"
  }

  return Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec 20
}

function Get-NotificationBody {
  param($Notification)

  if ($null -ne $Notification.body -and -not [string]::IsNullOrWhiteSpace([string]$Notification.body)) {
    return [string]$Notification.body
  }

  return "Abra a central interna para revisar."
}

function Get-NotificationCreatedAt {
  param($Notification)

  if ($null -eq $Notification) {
    return $null
  }

  $createdAtProperty = $Notification.PSObject.Properties["createdAt"]
  if ($null -ne $createdAtProperty -and -not [string]::IsNullOrWhiteSpace([string]$createdAtProperty.Value)) {
    return [string]$createdAtProperty.Value
  }

  $createdAtSnakeProperty = $Notification.PSObject.Properties["created_at"]
  if ($null -ne $createdAtSnakeProperty -and -not [string]::IsNullOrWhiteSpace([string]$createdAtSnakeProperty.Value)) {
    return [string]$createdAtSnakeProperty.Value
  }

  return $null
}

function Get-UiColor {
  param([string]$Hex)

  return [System.Drawing.ColorTranslator]::FromHtml($Hex)
}

function New-RoundedRectanglePath {
  param(
    [int]$Width,
    [int]$Height,
    [int]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $safeWidth = [Math]::Max($Width - 1, 1)
  $safeHeight = [Math]::Max($Height - 1, 1)
  $diameter = [Math]::Max($Radius * 2, 2)

  if ($diameter -gt $safeWidth) {
    $diameter = $safeWidth
  }

  if ($diameter -gt $safeHeight) {
    $diameter = $safeHeight
  }

  $arc = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $diameter, $diameter
  $path.AddArc($arc, 180, 90)
  $arc.X = $safeWidth - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $safeHeight - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = 0
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()

  return $path
}

function Set-RoundedRegion {
  param(
    [System.Windows.Forms.Control]$Control,
    [int]$Radius
  )

  $path = New-RoundedRectanglePath -Width $Control.Width -Height $Control.Height -Radius $Radius
  $region = New-Object System.Drawing.Region -ArgumentList $path
  $path.Dispose()
  $Control.Region = $region
}

function New-ActionButton {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [string]$BackColor,
    [string]$HoverBackColor,
    [string]$ForeColor,
    [string]$HoverForeColor,
    [string]$BorderColor,
    [string]$HoverBorderColor,
    [int]$BorderSize = 1,
    [int]$Radius = 14,
    [scriptblock]$OnClick
  )

  $button = New-Object System.Windows.Forms.Panel
  $button.SetBounds($X, $Y, $Width, $Height)
  $button.BackColor = Get-UiColor -Hex $BackColor
  $button.Cursor = [System.Windows.Forms.Cursors]::Hand
  $button.Tag = [pscustomobject]@{
    BackColor = $BackColor
    HoverBackColor = $HoverBackColor
    ForeColor = $ForeColor
    HoverForeColor = $HoverForeColor
    BorderColor = $BorderColor
    CurrentBorderColor = $BorderColor
    HoverBorderColor = $HoverBorderColor
    BorderSize = $BorderSize
    Radius = $Radius
  }
  Set-RoundedRegion -Control $button -Radius $Radius

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Dock = [System.Windows.Forms.DockStyle]::Fill
  $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $label.BackColor = [System.Drawing.Color]::Transparent
  $label.ForeColor = Get-UiColor -Hex $ForeColor
  $label.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
  $label.Cursor = [System.Windows.Forms.Cursors]::Hand
  $label.UseMnemonic = $false

  $button.Add_SizeChanged({
    param($Sender, $_EventArgs)
    Set-RoundedRegion -Control $Sender -Radius $Sender.Tag.Radius
  })
  $button.Add_Paint({
    param($Sender, $EventArgs)

    if ($Sender.Tag.BorderSize -le 0) {
      return
    }

    $EventArgs.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $borderPath = New-RoundedRectanglePath -Width $Sender.Width -Height $Sender.Height -Radius $Sender.Tag.Radius
    $borderPen = New-Object System.Drawing.Pen -ArgumentList (Get-UiColor -Hex $Sender.Tag.CurrentBorderColor), $Sender.Tag.BorderSize
    $EventArgs.Graphics.DrawPath($borderPen, $borderPath)
    $borderPen.Dispose()
    $borderPath.Dispose()
  })

  $hoverOn = {
    param($Sender, $_EventArgs)

    $target = if ($Sender -is [System.Windows.Forms.Label]) { $Sender.Parent } else { $Sender }
    $target.BackColor = Get-UiColor -Hex $target.Tag.HoverBackColor
    $target.Tag.CurrentBorderColor = $target.Tag.HoverBorderColor
    $target.Controls[0].ForeColor = Get-UiColor -Hex $target.Tag.HoverForeColor
    $target.Invalidate()
  }
  $hoverOff = {
    param($Sender, $_EventArgs)

    $target = if ($Sender -is [System.Windows.Forms.Label]) { $Sender.Parent } else { $Sender }
    $target.BackColor = Get-UiColor -Hex $target.Tag.BackColor
    $target.Tag.CurrentBorderColor = $target.Tag.BorderColor
    $target.Controls[0].ForeColor = Get-UiColor -Hex $target.Tag.ForeColor
    $target.Invalidate()
  }

  $button.Add_MouseEnter($hoverOn)
  $label.Add_MouseEnter($hoverOn)
  $button.Add_MouseLeave($hoverOff)
  $label.Add_MouseLeave($hoverOff)

  if ($null -ne $OnClick) {
    $button.Add_Click($OnClick)
    $label.Add_Click($OnClick)
  }

  $button.Controls.Add($label)
  return $button
}

function Show-InternalNotificationWindow {
  param(
    [string]$Url,
    $Notification
  )

  foreach ($popup in @($script:ActivePopupForms)) {
    try {
      if ($null -ne $popup -and -not $popup.IsDisposed) {
        $popup.Close()
      }
    } catch {
      # Ignora janelas antigas ja descartadas pelo Windows.
    }
  }
  $script:ActivePopupForms = @()

  $cardWidth = 420
  $cardHeight = 196
  $radius = 22

  $shadow = New-Object System.Windows.Forms.Form
  $shadow.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $shadow.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $shadow.ShowInTaskbar = $false
  $shadow.TopMost = $true
  $shadow.BackColor = Get-UiColor -Hex "#0f172a"
  $shadow.Opacity = 0.18
  $shadow.ClientSize = New-Object System.Drawing.Size($cardWidth, $cardHeight)
  Set-RoundedRegion -Control $shadow -Radius $radius

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Fasa Certificados"
  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.ShowInTaskbar = $false
  $form.TopMost = $true
  $form.BackColor = [System.Drawing.Color]::White
  $form.ClientSize = New-Object System.Drawing.Size($cardWidth, $cardHeight)
  $form.Tag = [pscustomobject]@{
    Url = $Url
    Shadow = $shadow
  }
  $form.KeyPreview = $true
  Set-RoundedRegion -Control $form -Radius $radius

  $workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Location = New-Object System.Drawing.Point(
    ($workingArea.Right - $form.Width - 24),
    ($workingArea.Bottom - $form.Height - 24)
  )
  $shadow.Location = New-Object System.Drawing.Point(($form.Location.X + 8), ($form.Location.Y + 10))

  $form.Add_SizeChanged({
    param($Sender, $_EventArgs)
    Set-RoundedRegion -Control $Sender -Radius 22
  })
  $form.Add_Paint({
    param($Sender, $EventArgs)

    $EventArgs.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $borderPath = New-RoundedRectanglePath -Width $Sender.ClientSize.Width -Height $Sender.ClientSize.Height -Radius 22
    $borderPen = New-Object System.Drawing.Pen -ArgumentList (Get-UiColor -Hex "#dbeafe"), 1
    $EventArgs.Graphics.DrawPath($borderPen, $borderPath)
    $borderPen.Dispose()
    $borderPath.Dispose()
  })

  $iconWrap = New-Object System.Windows.Forms.Panel
  $iconWrap.BackColor = Get-UiColor -Hex "#eff6ff"
  $iconWrap.SetBounds(24, 24, 46, 46)
  Set-RoundedRegion -Control $iconWrap -Radius 16
  $iconWrap.Add_SizeChanged({
    param($Sender, $_EventArgs)
    Set-RoundedRegion -Control $Sender -Radius 16
  })

  $iconText = New-Object System.Windows.Forms.Label
  $iconText.Text = "F"
  $iconText.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $iconText.ForeColor = Get-UiColor -Hex "#2563eb"
  $iconText.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
  $iconText.SetBounds(0, 0, 46, 46)
  $iconWrap.Controls.Add($iconText)

  $brand = New-Object System.Windows.Forms.Label
  $brand.Text = "Fasa Certificados"
  $brand.ForeColor = Get-UiColor -Hex "#2563eb"
  $brand.Font = New-Object System.Drawing.Font("Segoe UI", 8.75, [System.Drawing.FontStyle]::Bold)
  $brand.SetBounds(84, 24, 240, 20)

  $title = New-Object System.Windows.Forms.Label
  $title.Text = [string]$Notification.title
  $title.ForeColor = Get-UiColor -Hex "#0f172a"
  $title.Font = New-Object System.Drawing.Font("Segoe UI", 10.75, [System.Drawing.FontStyle]::Bold)
  $title.AutoEllipsis = $true
  $title.UseMnemonic = $false
  $title.SetBounds(84, 47, 306, 25)

  $body = New-Object System.Windows.Forms.Label
  $body.Text = Get-NotificationBody -Notification $Notification
  $body.ForeColor = Get-UiColor -Hex "#475569"
  $body.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
  $body.AutoEllipsis = $true
  $body.UseMnemonic = $false
  $body.SetBounds(84, 78, 308, 46)

  $openNotification = {
    param($Sender, $_EventArgs)

    $owner = $Sender.FindForm()

    if ($null -ne $owner -and $null -ne $owner.Tag -and -not [string]::IsNullOrWhiteSpace([string]$owner.Tag.Url)) {
      Start-Process ([string]$owner.Tag.Url)
      $owner.Close()
    }
  }

  $closePopup = {
    param($Sender, $_EventArgs)

    $owner = $Sender.FindForm()

    if ($null -ne $owner) {
      $owner.Close()
    }
  }

  $closeButton = New-ActionButton `
    -Text "Fechar" `
    -X 176 `
    -Y 142 `
    -Width 94 `
    -Height 38 `
    -BackColor "#ffffff" `
    -HoverBackColor "#f8fafc" `
    -ForeColor "#334155" `
    -HoverForeColor "#0f172a" `
    -BorderColor "#cbd5e1" `
    -HoverBorderColor "#94a3b8" `
    -BorderSize 1 `
    -Radius 14 `
    -OnClick $closePopup

  $openButton = New-ActionButton `
    -Text "Abrir central" `
    -X 280 `
    -Y 142 `
    -Width 116 `
    -Height 38 `
    -BackColor "#2563eb" `
    -HoverBackColor "#1d4ed8" `
    -ForeColor "#ffffff" `
    -HoverForeColor "#ffffff" `
    -BorderColor "#2563eb" `
    -HoverBorderColor "#1d4ed8" `
    -BorderSize 0 `
    -Radius 14 `
    -OnClick $openNotification

  $form.Add_FormClosed({
    param($Sender, $_EventArgs)

    $shadowForm = $Sender.Tag.Shadow

    if ($null -ne $shadowForm -and -not $shadowForm.IsDisposed) {
      $shadowForm.Close()
      $shadowForm.Dispose()
    }

    $script:ActivePopupForms = @($script:ActivePopupForms | Where-Object { $_ -ne $Sender -and $_ -ne $shadowForm })
  })
  $form.Add_KeyDown({
    param($Sender, $EventArgs)

    if ($EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
      $Sender.Close()
    }

    if ($EventArgs.KeyCode -eq [System.Windows.Forms.Keys]::Enter -and $null -ne $Sender.Tag.Url) {
      Start-Process ([string]$Sender.Tag.Url)
      $Sender.Close()
    }
  })

  $form.Controls.Add($iconWrap)
  $form.Controls.Add($brand)
  $form.Controls.Add($title)
  $form.Controls.Add($body)
  $form.Controls.Add($closeButton)
  $form.Controls.Add($openButton)
  $script:ActivePopupForms += $shadow
  $script:ActivePopupForms += $form
  $shadow.Show()
  $form.Show()
  $form.Activate()
}

function Show-InternalNotification {
  param(
    [System.Windows.Forms.NotifyIcon]$NotifyIcon,
    $Config,
    $Notification
  )

  $script:LastNotificationUrl = Join-AppUrl -BaseUrl $Config.BaseUrl -Path ([string]$Notification.href)
  Show-InternalNotificationWindow -Url $script:LastNotificationUrl -Notification $Notification
}

function Test-NotificationCreatedAfterStartup {
  param($Notification)

  $createdAtValue = Get-NotificationCreatedAt -Notification $Notification

  if ([string]::IsNullOrWhiteSpace($createdAtValue)) {
    return $false
  }

  try {
    $createdAt = [System.DateTimeOffset]::Parse($createdAtValue).UtcDateTime
    return $createdAt -gt $script:StartedAtUtc.AddSeconds(-2)
  } catch {
    return $false
  }
}

function Wait-WithEvents {
  param([int]$Seconds)

  $iterations = [Math]::Max($Seconds * 10, 1)

  for ($index = 0; $index -lt $iterations -and -not $script:ShouldExit; $index++) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 100
  }
}

try {
  $script:Config = Read-NotifierConfig

  if ($SelfTest) {
    $summary = Invoke-NotifierSummary -Config $script:Config
    Write-Host "Conexao validada."
    Write-Host "Notificacoes ativas: $($summary.active_count)"

    if ($summary.latest_notification) {
      Write-Host "Ultima notificacao: $($summary.latest_notification.title)"
    } else {
      Write-Host "Nenhuma notificacao interna ativa."
    }

    if (-not $PreviewPopup) {
      exit 0
    }
  }

  if ($PreviewPopup) {
    $previewNotification = [pscustomobject]@{
      title = "Teste do notificador Fasa"
      body = "Esta janela confirma que as notificacoes internas aparecem na tela."
      href = "/notificacoes-internas"
    }

    Show-InternalNotificationWindow `
      -Url (Join-AppUrl -BaseUrl $script:Config.BaseUrl -Path "/notificacoes-internas") `
      -Notification $previewNotification
    Wait-WithEvents -Seconds 30
    exit 0
  }

  $state = Read-NotifierState
  $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
  $notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
  $notifyIcon.Text = "Fasa Certificados"
  $notifyIcon.Visible = $true

  $menu = New-Object System.Windows.Forms.ContextMenu
  $openItem = New-Object System.Windows.Forms.MenuItem
  $openItem.Text = "Abrir central"
  $openItem.add_Click({
    Start-Process (Join-AppUrl -BaseUrl $script:Config.BaseUrl -Path "/notificacoes-internas")
  })
  $exitItem = New-Object System.Windows.Forms.MenuItem
  $exitItem.Text = "Sair"
  $exitItem.add_Click({
    $script:ShouldExit = $true
  })
  $menu.MenuItems.Add($openItem) | Out-Null
  $menu.MenuItems.Add($exitItem) | Out-Null
  $notifyIcon.ContextMenu = $menu
  $notifyIcon.add_BalloonTipClicked({
    if (-not [string]::IsNullOrWhiteSpace($script:LastNotificationUrl)) {
      Start-Process $script:LastNotificationUrl
    }
  })

  Write-NotifierLog "Notificador iniciado. Intervalo: $($script:Config.IntervalSeconds)s. BaseUrl: $($script:Config.BaseUrl)."

  do {
    try {
      $summary = Invoke-NotifierSummary -Config $script:Config
      $latest = $summary.latest_notification

      if ($latest -and $latest.id -ne $state.LastSeenId) {
        $hasBaseline = -not [string]::IsNullOrWhiteSpace([string]$state.LastSeenId)

        if ($hasBaseline -or (Test-NotificationCreatedAfterStartup -Notification $latest)) {
          Show-InternalNotification -NotifyIcon $notifyIcon -Config $script:Config -Notification $latest
          Write-NotifierLog "Popup exibido para notificacao $($latest.id)."
        } else {
          Write-NotifierLog "Linha de base definida em $($latest.id)."
        }

        $state.LastSeenId = [string]$latest.id
        Save-NotifierState -LastSeenId $state.LastSeenId
      }
    } catch {
      Write-NotifierLog "Falha ao consultar notificacoes: $($_.Exception.Message)"
    }

    if ($RunOnce) {
      break
    }

    Wait-WithEvents -Seconds $script:Config.IntervalSeconds
  } while (-not $script:ShouldExit)

  $notifyIcon.Visible = $false
  $notifyIcon.Dispose()
  Write-NotifierLog "Notificador encerrado."
} catch {
  Write-NotifierLog "Falha critica: $($_.Exception.Message)"
  Show-SetupMessage -Message $_.Exception.Message
  exit 1
}
