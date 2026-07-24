# Build Release

Use release build and publish with win-x64 self-contained output.

Example:
```
& "C:\Program Files\dotnet\dotnet.exe" publish src/CUSTOM_PS2xOnline.App/CUSTOM_PS2xOnline.App.csproj --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=false -o publish/win-x64
```

To create the Windows installer, install Inno Setup 6 and run:

```powershell
.\scripts\publish.ps1
.\scripts\package.ps1
```

The installer is written to `artifacts\installer\CUSTOM_PS2xOnline-Setup.exe`.
