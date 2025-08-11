import { useState } from 'react';
import axios from 'axios';

export default function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const onUpload = async () => {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append('file', file);
    const resp = await axios.post('/api/translate', form, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'translated.pdf'; a.click();
    setLoading(false);
  };

  return (
    <div style={{maxWidth: 640, margin: '40px auto', fontFamily: 'sans-serif'}}>
      <h1>PDF → ไทย (Beta)</h1>
      <input type="file" accept="application/pdf" onChange={e=>setFile(e.target.files?.[0])}/>
      <button onClick={onUpload} disabled={!file || loading} style={{marginLeft: 12}}>
        {loading ? 'กำลังแปล...' : 'แปลและดาวน์โหลด'}
      </button>
      <p style={{marginTop: 16, color: '#666'}}>หมายเหตุ: รุ่นแรกจะคงรูปแบบแบบง่าย (ข้อความล้วน)</p>
    </div>
  );
}
