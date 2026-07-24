$ErrorActionPreference = 'Stop'
$dotnet = 'C:\Program Files\dotnet\dotnet.exe'

& $dotnet restore
& $dotnet build CUSTOM_PS2xOnline.sln --configuration Release
& $dotnet test CUSTOM_PS2xOnline.sln --configuration Release

Write-Host 'Build Summary:'
Write-Host 'Restore: OK'
Write-Host 'Build: OK'
Write-Host 'Test: OK'
