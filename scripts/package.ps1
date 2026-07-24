$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$publishOutput = Join-Path $projectRoot 'publish\win-x64'
if (-not (Test-Path $publishOutput)) {
    throw 'Publish output not found. Run publish.ps1 first.'
}

$compilerCandidates = @(
    (Join-Path $env:LocalAppData 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
)
$compiler = $compilerCandidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
    Select-Object -First 1

if (-not $compiler) {
    throw 'Inno Setup 6 was not found. Install it before packaging.'
}

$installerScript = Join-Path $projectRoot 'installer\CUSTOM_PS2xOnline.iss'
& $compiler $installerScript
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup failed with exit code $LASTEXITCODE."
}

$installer = Join-Path $projectRoot 'artifacts\installer\CUSTOM_PS2xOnline-Setup.exe'
if (-not (Test-Path -LiteralPath $installer)) {
    throw 'The installer was not created.'
}

Write-Host "Installer created at $installer"
