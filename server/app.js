import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Config =====
const PORT = process.env.PORT || 3001;
const app = express();
app.use(express.json({ limit: '10mb' }));

// Uploads dir
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Health
app.get('/health', (_req, res) => res.send('ok'));

// ===== Gemini (SDK ใหม่) =====
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY in .env');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-1.5-flash';

// ===== Fonts & pdf.js =====
const thaiFontPath = path.join(__dirname, 'assets', 'fonts', 'NotoSerifThai-Regular.ttf');

// pdf.js ต้องชี้ standard fonts เป็น file:// URL
const standardFontDataUrl = new URL(
  'node_modules/pdfjs-dist/standard_fonts/',
  import.meta.url
).href;

// ===== Helpers =====
function chunkText(s, maxLen = 4000) {
  if (!s) return [];
  const chunks = [];
  let cur = '';
  for (const seg of s.split(/(\s+)/)) {
    if (cur.length + seg.length > maxLen && cur.length > 0) {
      chunks.push(cur); cur = seg;
    } else cur += seg;
  }
  if (cur.trim().length) chunks.push(cur);
  return chunks;
}

// Concurrency limit แบบเบาๆ
async function mapConcurrent(items, limit, worker) {
  const ret = new Array(items.length);
  let i = 0, active = 0;
  return await new Promise((resolve, reject) => {
    const next = () => {
      if (i >= items.length && active === 0) return resolve(ret);
      while (active < limit && i < items.length) {
        const idx = i++; const item = items[idx]; active++;
        Promise.resolve(worker(item, idx)).then(
          (val) => { ret[idx] = val; active--; next(); },
          (err) => reject(err)
        );
      }
    };
    next();
  });
}

// Retry wrapper (สำหรับ 429/5xx/เน็ต)
async function withRetry(fn, { retries = 4, baseDelayMs = 800 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) {
      const code = e?.status || e?.statusCode;
      if (![429, 500, 502, 503, 504].includes(code)) throw e;
      const wait = baseDelayMs * Math.pow(2, i) + Math.random() * 200;
      console.warn(`↻ retry ${i + 1}/${retries} in ${wait | 0}ms (status ${code})`);
      await new Promise(r => setTimeout(r, wait));
      lastErr = e;
    }
  }
  throw lastErr;
}

// อ่านข้อความทีละหน้า
async function extractPages(buffer) {
  console.time('extract');
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl,
    disableFontFace: true, // ช่วยให้เสถียร/เร็วขึ้นบน Node
  }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ page: i, text });
  }
  console.timeEnd('extract');
  return pages;
}

// เรียกโมเดลแปล 1 chunk
async function translateChunk(enText) {
  const prompt = `
คุณคือระบบแปลเอกสาร อังกฤษ→ไทย
ข้อกำหนด:
- คงโครงสร้างประโยคและจุดประสงค์เดิม
- หลีกเลี่ยงการขยาย/ตัดเนื้อหา
- ชื่อเฉพาะ/คำเทคนิคให้คงทับศัพท์ในวงเล็บเมื่อจำเป็น
อินพุต (อังกฤษ):
${enText}

เอาต์พุต: ข้อความภาษาไทยล้วน
`;
  const resp = await withRetry(() =>
    ai.models.generateContent({ model: MODEL, contents: prompt })
  );
  return resp.text;
}

// ===== Route: แปล PDF =====
app.post('/api/translate', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const tempPath = req.file.path;

  try {
    console.log('=== 📄 เริ่มประมวลผลไฟล์:', req.file.originalname, '===');
    const buffer = await fs.readFile(tempPath);

    // 1) Extract
    console.log('➡️  กำลังอ่านข้อความจาก PDF...');
    const pages = await extractPages(buffer);
    console.log(`✅ อ่านสำเร็จ: เจอ ${pages.length} หน้า`);

    // 2) Translate (พร้อมกันสูงสุด 3 หน้า)
    console.time('translate_all');
    const translatedPages = await mapConcurrent(pages, 3, async (p) => {
      console.log(`\n=== 🔤 กำลังแปลหน้า ${p.page} ===`);
      const parts = chunkText(p.text, 4000);
      const outParts = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part.trim()) continue;
        console.log(`   ⏳ หน้า ${p.page} • chunk ${i + 1}/${parts.length} ...`);
        const th = await translateChunk(part);
        console.log(`   ✅ หน้า ${p.page} • เสร็จ chunk ${i + 1}`);
        outParts.push(th);
      }
      return { page: p.page, text: outParts.join('\n\n') };
    });
    console.timeEnd('translate_all');

    // 3) Build PDF (ฝังฟอนต์ไทย)
    console.log('\n🛠️  กำลังสร้างไฟล์ PDF ภาษาไทย...');
    console.time('build_pdf');
    const outPdf = await PDFDocument.create();
    outPdf.registerFontkit(fontkit);
    const thaiFontBytes = await fs.readFile(thaiFontPath);
    const thaiFont = await outPdf.embedFont(thaiFontBytes, { subset: true });

    const marginX = 40, marginY = 50, fontSize = 12, lineGap = 18;
    const wrap = (s, max = 95) => s ? (s.match(new RegExp(`.{1,${max}}`, 'g')) || []) : [];

    for (const p of translatedPages.sort((a, b) => a.page - b.page)) {
      let page = outPdf.addPage();
      let { width, height } = page.getSize();
      let y = height - marginY;

      for (const para of p.text.split(/\n{2,}/)) {
        const lines = wrap(para, 100);
        for (const line of lines) {
          if (y < marginY) {
            page = outPdf.addPage();
            ({ width, height } = page.getSize());
            y = height - marginY;
          }
          page.drawText(line, { x: marginX, y, size: fontSize, font: thaiFont });
          y -= lineGap;
        }
        y -= lineGap * 0.5; // paragraph gap
      }
    }
    const pdfBytes = await outPdf.save();
    console.timeEnd('build_pdf');

    console.log('📦 สร้าง PDF เสร็จแล้ว กำลังส่งกลับ...');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=translated.pdf');
    res.send(Buffer.from(pdfBytes));
    console.log('🎉 ส่งไฟล์แปลกลับไปเรียบร้อย');
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาด:', err);
    res.status(500).json({ error: 'translate_failed', detail: String(err?.message || err) });
  } finally {
    fs.unlink(tempPath).catch(() => {});
  }
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server on http://localhost:${PORT}`);
});