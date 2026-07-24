$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$assetDir = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
$pngPath = Join-Path $assetDir 'icon.png'
$icoPath = Join-Path $assetDir 'icon.ico'

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$rect = New-Object System.Drawing.Rectangle 12, 12, 232, 232
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(116, 65, 255),
  [System.Drawing.Color]::FromArgb(25, 112, 231),
  45
)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 46
$path.AddArc(12, 12, $radius, $radius, 180, 90)
$path.AddArc(244-$radius, 12, $radius, $radius, 270, 90)
$path.AddArc(244-$radius, 244-$radius, $radius, $radius, 0, 90)
$path.AddArc(12, 244-$radius, $radius, $radius, 90, 90)
$path.CloseFigure()
$graphics.FillPath($brush, $path)
$font = New-Object System.Drawing.Font 'Segoe UI', 132, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('B', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 8, 0, 240, 246), $format)
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

$png = [System.IO.File]::ReadAllBytes($pngPath)
$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$png.Length)
$writer.Write([UInt32]22)
$writer.Write($png)
$writer.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $stream.ToArray())
$writer.Dispose()
$stream.Dispose()
Write-Host "Created $icoPath"
