# BOSSMASTER AI CHAT & BATCH 0.1.0 Alpha

ซอร์สรุ่นเริ่มต้นสำหรับทดสอบบน Windows เป็นโปรแกรมแยกจาก WorkPad, UNI และ WP MY BOSS

## ฟังก์ชันที่ทำงานในรุ่นนี้

- สร้างบัญชี Owner และล็อกอินด้วย Username/Password
- Hash รหัสผ่านด้วย `scrypt` และ salt แยกรายบัญชี
- เก็บ OpenAI/Gemini API Key ด้วย Electron `safeStorage` ของระบบปฏิบัติการ
- UI สมัยใหม่ Dark Mode ตามพิมพ์เขียว
- แยก 3 โหมด: แชทธรรมดา / เขียนโค้ด / งานจำนวนมาก
- ห้องสนทนาหลายห้องและประวัติแยกตามผู้ใช้
- เชื่อม OpenAI Responses API และ Gemini generateContent
- โหลดรายชื่อโมเดลจาก API Key จริง ไม่ฝังชื่อโมเดลตายตัว
- แนบ TXT/CSV/JSON/XML/ไฟล์โค้ด/XLSX/XLSM และรูปภาพ
- Batch จาก CSV/XLSX/XLSM/JSON ครั้งละ 1–3 รายการ
- Pause/Resume/Cancel, Retry, Delay, Checkpoint ทุกชุด
- บังคับ Batch คืน JSON array และแยก `item_id`
- ส่งออกผลเป็น XLSX หรือ JSON

## ข้อจำกัดของรุ่น Alpha

- คำตอบแชทยังแสดงเมื่อ API ตอบครบ ไม่ใช่ Streaming ทีละ token
- PDF, DOCX และ ZIP เลือกแนบได้ แต่ยังไม่แตก/อ่านข้อความภายใน
- Code Workspace ในรุ่นนี้เป็นห้องแชทแยกสำหรับโค้ด ยังไม่มี Diff/เขียนไฟล์จริง
- Batch Validator รุ่นแรกตรวจ JSON และ item_id; Validator เฉพาะกฎ SEO จะเพิ่มในรุ่นถัดไป
- ยังไม่มีระบบ Server Login หลายเครื่อง บัญชีและข้อมูลอยู่ในเครื่องที่ติดตั้ง
- ยังไม่ได้ Build `Setup.exe` ในสภาพแวดล้อมนี้ ต้อง Build บน Windows

## วิธีทดสอบบน Windows

1. แตก ZIP นี้ในโฟลเดอร์ที่เขียนไฟล์ได้ เช่น `C:\BOSSMASTER_AI_CHAT_BATCH`
2. เปิด `INSTALL_AND_RUN.bat`
3. รอ `npm install` ให้เสร็จ โปรแกรมจะเปิดอัตโนมัติ
4. ครั้งแรกสร้างบัญชี Owner
5. เข้า Settings แล้วใส่ OpenAI API Key หรือ Gemini API Key
6. กดปุ่ม ↻ เพื่อโหลดรายชื่อโมเดล
7. เลือกโมเดลแล้วเริ่มแชท

ต้องมี Node.js LTS และ Internet ในขั้นติดตั้ง dependency เท่านั้น

## สร้าง Setup.exe และ Portable

เปิด `BUILD_WINDOWS.bat` โปรแกรมจะติดตั้ง dependency, ตรวจ syntax และ Build ไฟล์ไว้ในโฟลเดอร์ `release`

## ตำแหน่งข้อมูลจริง

ข้อมูลผู้ใช้ ห้องแชท คิวงาน และไฟล์ส่งออกอยู่ใน Electron userData ไม่ได้อยู่ในโฟลเดอร์ซอร์ส จึงไม่หายเมื่อ Build รุ่นใหม่ทับซอร์ส

## จุดที่แก้เองได้ง่าย

- หน้าตา/ตำแหน่ง: `src/index.html`, `src/styles.css`
- การทำงาน UI: `src/app.js`
- API/ฐานข้อมูล/Batch: `main.js`
- ค่าเริ่มต้น: `config/defaults.json`

ก่อนแก้ `main.js` ให้สำรองไฟล์ และรัน `TEST_SOURCE.bat` ทุกครั้ง
