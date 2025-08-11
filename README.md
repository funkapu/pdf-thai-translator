# 📄 PDF Thai Translator

เครื่องมือแปลเอกสาร PDF ภาษาอังกฤษ → ไทย อัตโนมัติ  
ใช้ **Google Gemini API** ร่วมกับ **React (Frontend)** และ **Express (Backend)**  
เพียงอัปโหลดไฟล์ PDF ระบบจะแปลเนื้อหาและส่งกลับไฟล์ PDF เวอร์ชันภาษาไทย

---

## ✨ Features
- 🗂 อัปโหลดไฟล์ PDF ภาษาอังกฤษ และดาวน์โหลดไฟล์แปลภาษาไทย
- ⚡ ประมวลผลรวดเร็วด้วย **Gemini API**
- 🖥 รองรับทั้งฝั่ง **Frontend (React)** และ **Backend (Express)**
- 📑 คงรูปแบบเนื้อหา และใช้ฟอนต์ไทยใน PDF
- 🔒 จัดการ API Key ผ่าน `.env` เพื่อความปลอดภัย

---

## 🛠 Tech Stack
- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **AI Translation:** Google Gemini API
- **PDF Processing:** pdf-lib, pdfjs-dist
- **File Upload:** Multer

---

## 📂 Project Structure
project-folder/
│
├── client/ # React Frontend
│ ├── src/
│ └── vite.config.js
│
├── server/ # Express Backend
│ ├── app.js
│ ├── package.json
│ └── .env # เก็บ API key (ห้าม push ขึ้น GitHub)
│
└── README.md

---

## ⚙️ Installation

### 1️⃣ Clone Repository
```bash
git clone https://github.com/YOUR_USERNAME/pdf-thai-translator.git
cd pdf-thai-translator
2️⃣ ติดตั้ง Dependencies

--Backend -- 
cd server
npm install

-- frontend --
cd ../client
npm install

🔑 Environment Variables
สร้างไฟล์ .env ในโฟลเดอร์ server/
ใส่ API key ของ Gemini แบบนี้:
GEMINI_API_KEY=YOUR_API_KEY
PORT=3001

🚀 Running the App
Start Backend:
cd server
npm run dev

Start Frontend:
cd ../client
npm run dev

เปิดเบราว์เซอร์ไปที่ http://localhost:5173
