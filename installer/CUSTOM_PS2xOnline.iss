[Setup]
AppId={{9D1233DC-C4D2-47D2-AC65-DB2256D67FB4}
AppName=CUSTOM PS2xOnline
AppVersion=1.0.0
AppPublisher=CUSTOM PS2xOnline
DefaultDirName={autopf}\CUSTOM PS2xOnline
DefaultGroupName=CUSTOM PS2xOnline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\CUSTOM_PS2xOnline.App.exe
OutputDir=..\artifacts\installer
OutputBaseFilename=CUSTOM_PS2xOnline-Setup

[Files]
Source: "..\publish\win-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\CUSTOM PS2xOnline"; Filename: "{app}\CUSTOM_PS2xOnline.App.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\CUSTOM PS2xOnline"; Filename: "{app}\CUSTOM_PS2xOnline.App.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\CUSTOM_PS2xOnline.App.exe"; Description: "Launch CUSTOM PS2xOnline"; Flags: nowait postinstall skipifsilent
