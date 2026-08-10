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
$script:SingleInstanceMutex = $null
$script:SingleInstanceMutexCreated = $false
$script:TrayIcon = $null
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

function Resolve-NotifierAssetPath {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    $path = Join-Path $script:ScriptDir $candidate

    if (Test-Path -LiteralPath $path) {
      return (Resolve-Path -LiteralPath $path).Path
    }
  }

  return $null
}

function Get-NotifierIconPath {
  return Resolve-NotifierAssetPath -Candidates @(
    "fasa.ico",
    "..\..\src\app\favicon.ico"
  )
}

function New-NotifierIcon {
  $iconPath = Get-NotifierIconPath

  if (-not [string]::IsNullOrWhiteSpace($iconPath)) {
    try {
      return New-Object System.Drawing.Icon -ArgumentList $iconPath
    } catch {
      Write-NotifierLog "Falha ao carregar icone do notificador: $($_.Exception.Message)"
    }
  }

  return [System.Drawing.SystemIcons]::Information.Clone()
}

function New-NotifierLogoBitmap {
  $iconPath = Get-NotifierIconPath

  if ([string]::IsNullOrWhiteSpace($iconPath)) {
    return $null
  }

  try {
    $icon = New-Object System.Drawing.Icon -ArgumentList $iconPath
    $bitmap = $icon.ToBitmap()
    $icon.Dispose()
    return $bitmap
  } catch {
    Write-NotifierLog "Falha ao carregar logo do popup: $($_.Exception.Message)"
    return $null
  }
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

function New-PillLabel {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [string]$BackColor,
    [string]$ForeColor,
    [int]$Radius = 12
  )

  $pill = New-Object System.Windows.Forms.Panel
  $pill.SetBounds($X, $Y, $Width, $Height)
  $pill.BackColor = Get-UiColor -Hex $BackColor
  Set-RoundedRegion -Control $pill -Radius $Radius

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Dock = [System.Windows.Forms.DockStyle]::Fill
  $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $label.BackColor = [System.Drawing.Color]::Transparent
  $label.ForeColor = Get-UiColor -Hex $ForeColor
  $label.Font = New-Object System.Drawing.Font("Segoe UI", 8.25, [System.Drawing.FontStyle]::Bold)
  $label.UseMnemonic = $false

  $pill.Add_SizeChanged({
    param($Sender, $_EventArgs)
    Set-RoundedRegion -Control $Sender -Radius 12
  })
  $pill.Controls.Add($label)
  return $pill
}

function Show-NotificationEntranceAnimation {
  param(
    [System.Windows.Forms.Form]$Shadow,
    [System.Windows.Forms.Form]$Form,
    [System.Drawing.Point]$ShadowTargetLocation,
    [System.Drawing.Point]$FormTargetLocation
  )

  $startOffsetX = 24
  $startOffsetY = 18
  $shadowTargetOpacity = 0.18
  $formTargetOpacity = 0.98
  $frames = 14

  $Shadow.Opacity = 0.01
  $Form.Opacity = 0.01
  $Shadow.Location = New-Object System.Drawing.Point(($ShadowTargetLocation.X + $startOffsetX), ($ShadowTargetLocation.Y + $startOffsetY))
  $Form.Location = New-Object System.Drawing.Point(($FormTargetLocation.X + $startOffsetX), ($FormTargetLocation.Y + $startOffsetY))
  $Shadow.Show()
  $Form.Show()

  for ($frame = 1; $frame -le $frames; $frame++) {
    $progress = $frame / $frames
    $ease = 1 - [Math]::Pow((1 - $progress), 3)
    $nextFormX = [int]($FormTargetLocation.X + ($startOffsetX * (1 - $ease)))
    $nextFormY = [int]($FormTargetLocation.Y + ($startOffsetY * (1 - $ease)))
    $nextShadowX = [int]($ShadowTargetLocation.X + ($startOffsetX * (1 - $ease)))
    $nextShadowY = [int]($ShadowTargetLocation.Y + ($startOffsetY * (1 - $ease)))

    $Form.Location = New-Object System.Drawing.Point($nextFormX, $nextFormY)
    $Shadow.Location = New-Object System.Drawing.Point($nextShadowX, $nextShadowY)
    $Form.Opacity = [Math]::Min($formTargetOpacity, 0.08 + ($formTargetOpacity * $ease))
    $Shadow.Opacity = [Math]::Min($shadowTargetOpacity, $shadowTargetOpacity * $ease)
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 12
  }

  $Form.Location = $FormTargetLocation
  $Shadow.Location = $ShadowTargetLocation
  $Form.Opacity = $formTargetOpacity
  $Shadow.Opacity = $shadowTargetOpacity
  $Form.Activate()
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

  $cardWidth = 492
  $cardHeight = 244
  $radius = 24
  $logoBitmap = New-NotifierLogoBitmap

  $shadow = New-Object System.Windows.Forms.Form
  $shadow.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $shadow.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $shadow.ShowInTaskbar = $false
  $shadow.TopMost = $true
  $shadow.BackColor = Get-UiColor -Hex "#0f172a"
  $shadow.Opacity = 0.01
  $shadow.ClientSize = New-Object System.Drawing.Size(($cardWidth + 8), ($cardHeight + 8))
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
  $form.Opacity = 0.01
  $form.ClientSize = New-Object System.Drawing.Size($cardWidth, $cardHeight)
  $form.Tag = [pscustomobject]@{
    Url = $Url
    Shadow = $shadow
    LogoBitmap = $logoBitmap
  }
  $form.KeyPreview = $true
  Set-RoundedRegion -Control $form -Radius $radius

  $workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $formTargetLocation = New-Object System.Drawing.Point(
    ($workingArea.Right - $form.Width - 24),
    ($workingArea.Bottom - $form.Height - 24)
  )
  $shadowTargetLocation = New-Object System.Drawing.Point(($formTargetLocation.X + 8), ($formTargetLocation.Y + 10))
  $form.Location = $formTargetLocation
  $shadow.Location = $shadowTargetLocation

  $form.Add_SizeChanged({
    param($Sender, $_EventArgs)
    Set-RoundedRegion -Control $Sender -Radius 24
  })
  $form.Add_Paint({
    param($Sender, $EventArgs)

    $EventArgs.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $headerBrush = New-Object System.Drawing.SolidBrush -ArgumentList (Get-UiColor -Hex "#f8fbff")
    $footerBrush = New-Object System.Drawing.SolidBrush -ArgumentList (Get-UiColor -Hex "#f8fafc")
    $accentBrush = New-Object System.Drawing.SolidBrush -ArgumentList (Get-UiColor -Hex "#2563eb")
    $EventArgs.Graphics.FillRectangle($headerBrush, 0, 0, $Sender.ClientSize.Width, 92)
    $EventArgs.Graphics.FillRectangle($footerBrush, 0, 170, $Sender.ClientSize.Width, 74)
    $EventArgs.Graphics.FillRectangle($accentBrush, 0, 0, $Sender.ClientSize.Width, 4)
    $EventArgs.Graphics.FillRectangle($accentBrush, 0, 4, 5, 166)

    $borderPath = New-RoundedRectanglePath -Width $Sender.ClientSize.Width -Height $Sender.ClientSize.Height -Radius 24
    $borderPen = New-Object System.Drawing.Pen -ArgumentList (Get-UiColor -Hex "#dbeafe"), 1
    $dividerPen = New-Object System.Drawing.Pen -ArgumentList (Get-UiColor -Hex "#e2e8f0"), 1
    $EventArgs.Graphics.DrawLine($dividerPen, 24, 170, ($Sender.ClientSize.Width - 24), 170)
    $EventArgs.Graphics.DrawPath($borderPen, $borderPath)
    $headerBrush.Dispose()
    $footerBrush.Dispose()
    $accentBrush.Dispose()
    $borderPen.Dispose()
    $dividerPen.Dispose()
    $borderPath.Dispose()
  })

  $iconWrap = New-Object System.Windows.Forms.Panel
  $iconWrap.BackColor = [System.Drawing.Color]::White
  $iconWrap.SetBounds(28, 28, 56, 56)
  Set-RoundedRegion -Control $iconWrap -Radius 18
  $iconWrap.Add_SizeChanged({
    param($Sender, $_EventArgs)
    Set-RoundedRegion -Control $Sender -Radius 18
  })
  $iconWrap.Add_Paint({
    param($Sender, $EventArgs)

    $EventArgs.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $path = New-RoundedRectanglePath -Width $Sender.Width -Height $Sender.Height -Radius 18
    $pen = New-Object System.Drawing.Pen -ArgumentList (Get-UiColor -Hex "#bfdbfe"), 1
    $EventArgs.Graphics.DrawPath($pen, $path)
    $pen.Dispose()
    $path.Dispose()
  })

  if ($null -ne $logoBitmap) {
    $logo = New-Object System.Windows.Forms.PictureBox
    $logo.Image = $logoBitmap
    $logo.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
    $logo.BackColor = [System.Drawing.Color]::Transparent
    $logo.SetBounds(10, 10, 34, 34)
    $iconWrap.Controls.Add($logo)
  } else {
    $iconText = New-Object System.Windows.Forms.Label
    $iconText.Text = "F"
    $iconText.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $iconText.ForeColor = Get-UiColor -Hex "#2563eb"
    $iconText.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
    $iconText.SetBounds(0, 0, 56, 56)
    $iconWrap.Controls.Add($iconText)
  }

  $pill = New-PillLabel `
    -Text "Aviso interno" `
    -X 102 `
    -Y 27 `
    -Width 112 `
    -Height 24 `
    -BackColor "#eff6ff" `
    -ForeColor "#1d4ed8" `
    -Radius 12

  $brand = New-Object System.Windows.Forms.Label
  $brand.Text = "Fasa Certificados"
  $brand.ForeColor = Get-UiColor -Hex "#64748b"
  $brand.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
  $brand.SetBounds(224, 30, 154, 18)

  $timeLabel = New-Object System.Windows.Forms.Label
  $timeLabel.Text = "Agora"
  $timeLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
  $timeLabel.ForeColor = Get-UiColor -Hex "#64748b"
  $timeLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
  $timeLabel.SetBounds(390, 30, 64, 18)

  $title = New-Object System.Windows.Forms.Label
  $title.Text = [string]$Notification.title
  $title.ForeColor = Get-UiColor -Hex "#0f172a"
  $title.Font = New-Object System.Drawing.Font("Segoe UI", 11.5, [System.Drawing.FontStyle]::Bold)
  $title.AutoEllipsis = $true
  $title.UseMnemonic = $false
  $title.SetBounds(102, 58, 352, 28)

  $body = New-Object System.Windows.Forms.Label
  $body.Text = Get-NotificationBody -Notification $Notification
  $body.ForeColor = Get-UiColor -Hex "#475569"
  $body.Font = New-Object System.Drawing.Font("Segoe UI", 9.25, [System.Drawing.FontStyle]::Regular)
  $body.AutoEllipsis = $true
  $body.UseMnemonic = $false
  $body.SetBounds(28, 110, 426, 46)

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
    -X 250 `
    -Y 190 `
    -Width 86 `
    -Height 38 `
    -BackColor "#f8fafc" `
    -HoverBackColor "#eef2f7" `
    -ForeColor "#334155" `
    -HoverForeColor "#0f172a" `
    -BorderColor "#cbd5e1" `
    -HoverBorderColor "#94a3b8" `
    -BorderSize 1 `
    -Radius 14 `
    -OnClick $closePopup

  $openButton = New-ActionButton `
    -Text "Abrir aviso" `
    -X 348 `
    -Y 190 `
    -Width 106 `
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

    if ($null -ne $Sender.Tag.LogoBitmap) {
      $Sender.Tag.LogoBitmap.Dispose()
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
  $form.Controls.Add($pill)
  $form.Controls.Add($brand)
  $form.Controls.Add($timeLabel)
  $form.Controls.Add($title)
  $form.Controls.Add($body)
  $form.Controls.Add($closeButton)
  $form.Controls.Add($openButton)
  $script:ActivePopupForms += $shadow
  $script:ActivePopupForms += $form
  Show-NotificationEntranceAnimation `
    -Shadow $shadow `
    -Form $form `
    -ShadowTargetLocation $shadowTargetLocation `
    -FormTargetLocation $formTargetLocation
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

  $createdNew = $false
  $script:SingleInstanceMutex = New-Object System.Threading.Mutex($true, "FasaCertificadosInternalNotifier", [ref]$createdNew)
  $script:SingleInstanceMutexCreated = $createdNew

  if (-not $script:SingleInstanceMutexCreated) {
    Write-NotifierLog "Notificador ja estava em execucao. Nova instancia encerrada."
    if ($null -ne $script:SingleInstanceMutex) {
      $script:SingleInstanceMutex.Dispose()
    }
    exit 0
  }

  $state = Read-NotifierState
  $notifyIcon = New-Object System.Windows.Forms.NotifyIcon
  $script:TrayIcon = New-NotifierIcon
  $notifyIcon.Icon = $script:TrayIcon
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
  if ($null -ne $script:TrayIcon) {
    $script:TrayIcon.Dispose()
  }
  if ($script:SingleInstanceMutexCreated -and $null -ne $script:SingleInstanceMutex) {
    $script:SingleInstanceMutex.ReleaseMutex()
    $script:SingleInstanceMutex.Dispose()
  }
  Write-NotifierLog "Notificador encerrado."
} catch {
  Write-NotifierLog "Falha critica: $($_.Exception.Message)"
  if ($null -ne $script:TrayIcon) {
    $script:TrayIcon.Dispose()
  }
  if ($script:SingleInstanceMutexCreated -and $null -ne $script:SingleInstanceMutex) {
    $script:SingleInstanceMutex.ReleaseMutex()
    $script:SingleInstanceMutex.Dispose()
  }
  Show-SetupMessage -Message $_.Exception.Message
  exit 1
}
