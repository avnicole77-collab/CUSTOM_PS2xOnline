$ErrorActionPreference = 'Stop'

function Assert-Command($commandName) {
    if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $commandName"
    }
}

Assert-Command 'git'
Assert-Command 'C:\Program Files\dotnet\dotnet.exe'

$dotnet = 'C:\Program Files\dotnet\dotnet.exe'
& $dotnet --info | Out-Host

$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion.Major -lt 10) {
    throw 'Unsupported Windows version. Requires Windows 10 or newer.'
}

$testPath = Join-Path $PWD 'logs'
if (-not (Test-Path $testPath)) {
    New-Item -ItemType Directory -Path $testPath | Out-Null
}

Write-Host 'Development setup validated successfully.'
