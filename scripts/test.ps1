$ErrorActionPreference = 'Stop'
$dotnet = 'C:\Program Files\dotnet\dotnet.exe'
& $dotnet test CUSTOM_PS2xOnline.sln --configuration Release
