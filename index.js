require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// [PERBAIKAN UTAMA DISINI] 
// Kita perbesar batas data masuk jadi 50MB agar gambar Base64 tidak ditolak
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));

// [PENTING] Gunakan MemoryStorage untuk Vercel (Biar tidak error EROFS)
// [PERBAIKAN] Tambahkan 'fieldSize' agar teks panjang tidak error
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 10 * 1024 * 1024, // Batas ukuran file (10MB)
        fieldSize: 50 * 1024 * 1024 // [WAJIB] Batas ukuran teks/field (50MB)
    }
});

// Konfigurasi Database Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, 
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10, 
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 20000, // Timeout diperpanjang
    acquireTimeout: 20000
});

// Tes Koneksi Database
db.getConnection((err, connection) => {
    if (err) console.error('❌ Database Error:', err.message);
    else { console.log('✅ Database Terhubung!'); connection.release(); }
});

// === LOGIKA GAMBAR BASE64 ===
function processArticleData(body, files) {
    let finalContent = [];
    
    const toArray = (val) => {
        if (Array.isArray(val)) return val;
        if (val === undefined || val === null) return [];
        return [val];
    };
    
    const types = toArray(body.blockType);
    const texts = toArray(body.textInput); 
    const imgStatus = toArray(body.imgStatus); 
    const oldImgNames = toArray(body.oldImgName);

    let fileUploadIndex = 0; 

    for (let i = 0; i < types.length; i++) {
        if (types[i] === 'text') {
            finalContent.push({ tipe: 'text', isi: texts[i] || '' });
        } 
        else if (types[i] === 'image') {
            const status = imgStatus[i];
            const oldName = oldImgNames[i];
            let finalImageContent = oldName;

            if (status === 'new') {
                if (files && files[fileUploadIndex]) {
                    // Convert file jadi Base64 String Panjang
                    const file = files[fileUploadIndex];
                    const b64 = Buffer.from(file.buffer).toString('base64');
                    finalImageContent = `data:${file.mimetype};base64,${b64}`;
                    fileUploadIndex++; 
                }
            }
            finalContent.push({ tipe: 'image', isi: finalImageContent || '' });
        }
    }
    return JSON.stringify(finalContent);
}

// === ROUTES ===

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '12345') {
        res.json({ status: true, message: "Login Sukses" });
    } else {
        res.status(401).json({ status: false, message: "Gagal Login" });
    }
});

app.get('/api/data', (req, res) => {
    db.query("SELECT * FROM ar_content ORDER BY id DESC", (err, result) => {
        if (err) return res.status(500).json({status: false, message: err.message});
        
        const processed = result.map(item => {
            let konten = [];
            try { konten = JSON.parse(item.konten_data); } catch(e){}
            return { id: item.id, judul: item.judul, konten: konten };
        });
        res.json({ status: true, data: processed });
    });
});

app.get('/api/data/:id', (req, res) => {
    const id = req.params.id;
    db.query("SELECT * FROM ar_content WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json({status: false, message: err.message});
        if (result.length === 0) return res.status(404).json({status: false, message: "Not Found"});
        
        const item = result[0];
        let konten = [];
        try { konten = JSON.parse(item.konten_data); } catch(e){}
        res.json({ status: true, data: { id: item.id, judul: item.judul, konten: konten } });
    });
});

app.post('/api/data', upload.array('images[]'), (req, res) => {
    const { judul } = req.body;
    if(!judul) return res.status(400).json({message: "Judul wajib diisi"});

    try {
        const jsonString = processArticleData(req.body, req.files);
        db.query("INSERT INTO ar_content (judul, konten_data) VALUES (?, ?)", [judul, jsonString], (err, result) => {
            if(err) {
                console.error("SQL Error:", err); // Cek terminal server jika error
                return res.status(500).json({message: "Gagal DB: " + err.message});
            }
            res.json({status: true, message: "Tersimpan!"});
        });
    } catch (e) { res.status(500).json({message: "Processing Error: " + e.message}); }
});

app.put('/api/data/:id', upload.array('images[]'), (req, res) => {
    const { judul } = req.body;
    const id = req.params.id;
    try {
        const jsonString = processArticleData(req.body, req.files);
        db.query("UPDATE ar_content SET judul = ?, konten_data = ? WHERE id = ?", [judul, jsonString, id], (err, result) => {
            if(err) {
                console.error("SQL Error:", err);
                return res.status(500).json({message: "Gagal Update: " + err.message});
            }
            res.json({status: true, message: "Terupdate!"});
        });
    } catch (e) { res.status(500).json({message: "Processing Error: " + e.message}); }
});

app.delete('/api/data/:id', (req, res) => {
    const id = req.params.id;
    db.query("DELETE FROM ar_content WHERE id = ?", [id], (err, result) => {
        if(err) return res.status(500).json({message: err.message});
        res.json({status: true});
    });
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));
}
module.exports = app;