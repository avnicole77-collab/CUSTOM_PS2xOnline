# CUSTOM PS2xOnline

## ภาพรวม
CUSTOM PS2xOnline คือโปรแกรม Windows สำหรับจัดการเกม PlayStation 2 ผ่าน PCSX2 และช่วยให้ผู้ใช้ตั้งค่าห้องออนไลน์สำหรับเล่นกับเพื่อนโดยใช้ระบบ Launcher และศูนย์ควบคุมเกมแบบ Native WPF

## ความต้องการระบบ
- Windows 10/11 64-bit
- .NET 8 Desktop Runtime
- PCSX2 ที่ติดตั้งอยู่จริง
- BIOS และเกมที่ผู้ใช้มีสิทธิ์ใช้งานเอง

## วิธีติดตั้ง Development Tools
1. ติดตั้ง .NET 8 SDK
2. ติดตั้ง Git
3. เปิด VS Code แล้วกด Open Folder

## วิธีเปิด Solution
```powershell
cd CUSTOM_PS2xOnline
& "C:\Program Files\dotnet\dotnet.exe" restore
& "C:\Program Files\dotnet\dotnet.exe" build CUSTOM_PS2xOnline.sln
```

## วิธี Build
```powershell
& "C:\Program Files\dotnet\dotnet.exe" build CUSTOM_PS2xOnline.sln --configuration Release
```

## วิธี Run
```powershell
& "C:\Program Files\dotnet\dotnet.exe" run --project src/CUSTOM_PS2xOnline.App/CUSTOM_PS2xOnline.App.csproj
```

## วิธี Test
```powershell
& "C:\Program Files\dotnet\dotnet.exe" test CUSTOM_PS2xOnline.sln --configuration Release
```

## วิธี Publish
```powershell
& "C:\Program Files\dotnet\dotnet.exe" publish src/CUSTOM_PS2xOnline.App/CUSTOM_PS2xOnline.App.csproj --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=false -o publish/win-x64
```

## วิธีตั้ง PCSX2
- ระบุ path ของ pcsx2-qt.exe
- เลือกโฟลเดอร์ BIOS
- เลือกโฟลเดอร์เกม
- ตรวจสอบ BIOS และ Memory Card ก่อนเปิดเกม

## วิธีเพิ่มเกม
- ใช้เมนู Scan Folder หรือ Add Game
- ตรวจสอบไฟล์ ISO/BIN/CHD/CSO
- ตรวจว่ามีไฟล์อยู่จริงและไม่ซ้ำ

## วิธีสร้างห้อง
- กด Create Room
- กรอก Room Name, Game, Max Players และ PIN
- ตรวจสอบ PCSX2, Game, Controller, Network และ Streaming Provider

## วิธี Join
- ใช้ Room Code และ PIN
- ตรวจ App Version, Internet, Controller, Ping และ Capacity

## วิธีแก้ Error
- ดู Logs
- อ่าน Error Code
- ทำ Safe Mode หากจำเป็น

## โครงสร้าง Project
- App = WPF UI
- Core = Models / Interfaces / Services
- Infrastructure = SQLite / Security / Repo
- PCSX2 = Emulator integration
- Network = Room / Connectivity
- Streaming = Provider integration layer
- Controllers = Gamepad mapping
- Updater = Update workflow

## Security Notes
- Password ไม่ถูกเก็บแบบ Plain Text
- ใช้ BCrypt สำหรับ hash/rhash
- เก็บข้อมูลลับใน Windows DPAPI หรือ Credential Manager
- ไม่บันทึก PIN, Token, Secret ใน Log

## Legal Notes
- ผู้ใช้ต้องมีสิทธิ์ใช้งานเกมและ BIOS ที่เปิดใช้งานเองเท่านั้น
- โปรแกรมนี้ไม่รวมการดาวน์โหลดเกมหรือ BIOS ที่ละเมิดต่อกฎหมาย
