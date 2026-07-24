# BOSSMASTER AI CHAT & BATCH 0.2.1

โปรแกรม Windows แยกอิสระสำหรับแชท AI เขียนโค้ด จดโน้ต และประมวลผลงานจำนวนมากผ่าน OpenAI/Gemini API

## ความสามารถ

- Owner/User/Viewer พร้อมข้อมูลแยกตามบัญชี
- รหัสผ่านแบบ `scrypt` และ API Key เข้ารหัสด้วย Windows `safeStorage`
- แชทแบบ Streaming พร้อมปุ่มหยุดทันที ประวัติหลายห้อง และ Dynamic Model List
- แนบรูป TXT/MD/CSV/JSON/XLSX/PDF/DOCX และอ่าน ZIP แบบปลอดภัยโดยไม่รันไฟล์
- Notepad ส่วนตัวบันทึกอัตโนมัติและไม่ส่งเข้า AI
- Code Workspace เปิดโฟลเดอร์ ค้นหา อ่าน แนบ และเขียนไฟล์หลังยืนยัน พร้อม Backup เดิม
- Batch 1–6 รายการต่อชุด, Pause/Resume/Cancel, Retry/Backoff, Retry FAIL และ Checkpoint
- Recovery งานค้างหลังเปิดโปรแกรมใหม่ และหยุดอัตโนมัติเมื่อผิดพลาดติดต่อกัน
- Structured JSON, Required Fields, ชนิดข้อมูล, ความยาว, จำนวนคำ/ย่อหน้า และคำต้องห้าม
- ล็อกค่าที่ต้องตรงต้นฉบับ และซ่อมเฉพาะช่องที่ตรวจไม่ผ่าน
- Export XLSX, CSV UTF-8 BOM, JSON และ JSONL โดยรักษาลำดับต้นฉบับ
- Budget Token รายวัน, Requests ต่อนาที, Provider Fallback, Usage และ Log ที่ไม่เก็บ API Key
- Backup/Restore ฐานข้อมูล พร้อม Safety Backup ก่อน Restore
- ป้องกัน navigation, popup, Node ใน renderer, ZIP traversal และ path/symlink ออกจาก Code Workspace

## ติดตั้งสำหรับผู้ใช้

1. เปิด `BOSSMASTER_AI_CHAT_BATCH_Setup_0.2.1_x64.exe`
2. เลือกตำแหน่งติดตั้งและเปิดโปรแกรม
3. ครั้งแรกสร้างบัญชี Owner
4. เปิด Settings แล้วกรอก API Key ของผู้ให้บริการ
5. โหลดรายชื่อโมเดลและเริ่มใช้งาน

Portable เปิดได้โดยไม่ติดตั้งจาก `BOSSMASTER_AI_CHAT_BATCH_Portable_0.2.1_x64.exe`

## พัฒนาและทดสอบ

ต้องมี Node.js LTS:

```text
npm install --no-audit --no-fund
npm test
npm start
npm run pack:win
npm run dist:win
```

หรือใช้ `INSTALL_AND_RUN.bat` และ `BUILD_WINDOWS.bat`

## สำรองและกู้คืน

เปิด Settings:

- `สำรองข้อมูล` เลือกตำแหน่งไฟล์ JSON
- `กู้คืนข้อมูล` เลือกไฟล์สำรอง โปรแกรมจะสร้าง Safety Backup ของข้อมูลปัจจุบันก่อนเสมอ
- การเปลี่ยนรหัสผ่านไม่ลบ Chat, Batch หรือ Notepad

ข้อมูลจริงอยู่ใน Electron userData ไม่ได้อยู่ในโฟลเดอร์ซอร์ส ห้ามนำ `database.json`, API Key, `node_modules` หรือ `release` ขึ้น Git

## โครงสร้างสำคัญ

- `main.js` — API, Auth, Storage, Batch, Validator, Backup และ Code Workspace
- `preload.js` — IPC Bridge แบบจำกัดสิทธิ์
- `src/index.html` — โครง UI
- `src/app.js` — การทำงานฝั่งหน้าจอ
- `src/styles.css` — รูปแบบ UI
- `config/defaults.json` — ค่าเริ่มต้น
- `scripts/generate-icon.ps1` — สร้างไอคอน Windows ซ้ำได้

## การทดสอบที่ต้องใช้ API Key จริง

ก่อน Release ให้ทดสอบ OpenAI และ Gemini อย่างละหนึ่งรอบ:

1. Streaming และ Stop
2. ไฟล์ PDF/DOCX/ZIP
3. Batch Sample พร้อม Pause/Resume/Retry FAIL
4. Validator และ Auto Repair
5. Export ทั้งสี่รูปแบบ

ไม่ควรรับรองว่าเนื้อหาจากโมเดลถูกต้อง 100% ผล Batch ที่เข้มงวดต้องผ่าน Validator และรายการเสี่ยงควรตรวจโดยผู้ใช้
