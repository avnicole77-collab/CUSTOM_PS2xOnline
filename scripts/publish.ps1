$ErrorActionPreference = 'Stop'
$dotnet = 'C:\Program Files\dotnet\dotnet.exe'
$projectRoot = Split-Path -Parent $PSScriptRoot
$publishOutput = Join-Path $projectRoot 'publish\win-x64'

New-Item -ItemType Directory -Force -Path $publishOutput | Out-Null

& $dotnet publish (Join-Path $projectRoot 'src\CUSTOM_PS2xOnline.App\CUSTOM_PS2xOnline.App.csproj') --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=false -o $publishOutput
if ($LASTEXITCODE -ne 0) {
    throw "Publish failed with exit code $LASTEXITCODE."
}

Write-Host "Published to $publishOutput"
