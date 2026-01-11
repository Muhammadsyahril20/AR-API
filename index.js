require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Folder Upload
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Database Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_ar_unity_v2', 
    port: process.env.DB_PORT || 3306,
    connectionLimit: 10, 
    waitForConnections: true,
    queueLimit: 0
});

db.getConnection((err, connection) => {
    if (err) console.error('❌ Database Gagal Konek:', err.message);
    else { console.log('✅ Database Terkoneksi (Pool Mode)!'); connection.release(); }
});

// === [PERBAIKAN LOGIKA DISINI] ===
function processArticleData(body, files) {
    let finalContent = [];
    
    const toArray = (val) => {
        if (Array.isArray(val)) return val;
        if (val === undefined || val === null) return [];
        return [val];
    };
    
    // Semua array ini panjangnya SAMA (sejajar)
    const types = toArray(body.blockType);
    const texts = toArray(body.textInput); 
    const imgStatus = toArray(body.imgStatus); 
    const oldImgNames = toArray(body.oldImgName);

    // Index khusus hanya untuk file fisik yang diupload (karena file tidak punya dummy kosong)
    let fileUploadIndex = 0; 

    for (let i = 0; i < types.length; i++) {
        if (types[i] === 'text') {
            // PERBAIKAN: Langsung pakai index 'i' karena texts[i] sudah sejajar
            finalContent.push({ tipe: 'text', isi: texts[i] || '' });
        } 
        else if (types[i] === 'image') {
            const status = imgStatus[i];
            const oldName = oldImgNames[i];
            let finalImageName = oldName;

            if (status === 'new') {
                if (files && files[fileUploadIndex]) {
                    finalImageName = files[fileUploadIndex].filename;
                    
                    // Hapus file lama
                    if(oldName && oldName.includes('.')) {
                        try {
                            const oldPath = path.join(__dirname, 'public/uploads', oldName);
                            if(fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                        } catch(e) {}
                    }
                    fileUploadIndex++; // Geser ke file upload berikutnya
                }
            }
            
            finalContent.push({ tipe: 'image', isi: finalImageName || '' });
        }
    }
    return JSON.stringify(finalContent);
}

// === ROUTES ===

app.get('/api/data', (req, res) => {
    db.query("SELECT * FROM ar_content ORDER BY id DESC", (err, result) => {
        if (err) return res.status(500).json({status: false, message: err.message});
        
        const processed = result.map(item => {
            let konten = [];
            try { konten = JSON.parse(item.konten_data); } catch(e){}
            if(Array.isArray(konten)) {
                konten.forEach(k => {
                    if(k.tipe === 'image') k.url_lengkap = `${req.protocol}://${req.get('host')}/uploads/${k.isi}`;
                });
            }
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
        
        if(Array.isArray(konten)) {
            konten.forEach(k => {
                if(k.tipe === 'image') k.url_lengkap = `${req.protocol}://${req.get('host')}/uploads/${k.isi}`;
            });
        }
        
        res.json({ status: true, data: { id: item.id, judul: item.judul, konten: konten } });
    });
});

app.post('/api/data', upload.array('images[]'), (req, res) => {
    const { judul } = req.body;
    if(!judul) return res.status(400).json({message: "Judul wajib diisi"});

    try {
        const jsonString = processArticleData(req.body, req.files);
        db.query("INSERT INTO ar_content (judul, konten_data) VALUES (?, ?)", [judul, jsonString], (err, result) => {
            if(err) return res.status(500).json({message: err.message});
            res.json({status: true, message: "Data tersimpan!"});
        });
    } catch (e) { res.status(500).json({message: e.message}); }
});

app.put('/api/data/:id', upload.array('images[]'), (req, res) => {
    const { judul } = req.body;
    const id = req.params.id;
    try {
        const jsonString = processArticleData(req.body, req.files);
        db.query("UPDATE ar_content SET judul = ?, konten_data = ? WHERE id = ?", [judul, jsonString, id], (err, result) => {
            if(err) return res.status(500).json({message: err.message});
            res.json({status: true, message: "Data diupdate!"});
        });
    } catch (e) { res.status(500).json({message: e.message}); }
});

app.delete('/api/data/:id', (req, res) => {
    const id = req.params.id;
    db.query("SELECT konten_data FROM ar_content WHERE id = ?", [id], (err, rows) => {
        if(rows.length > 0) {
            try {
                const k = JSON.parse(rows[0].konten_data);
                if(Array.isArray(k)) {
                    k.forEach(b => {
                        if(b.tipe === 'image' && b.isi) {
                            const p = path.join(__dirname, 'public/uploads', b.isi);
                            if(fs.existsSync(p)) fs.unlinkSync(p);
                        }
                    });
                }
            } catch(e){}
        }
        db.query("DELETE FROM ar_content WHERE id = ?", [id], (err, result) => {
            if(err) return res.status(500).json({message: err.message});
            res.json({status: true});
        });
    });
});
// --- TAMBAHAN FITUR LOGIN ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Ganti 'admin' dan '12345' dengan username/password yang kamu mau
    if (username === 'admin' && password === '12345') {
        res.json({ status: true, message: "Login Sukses" });
    } else {
        res.status(401).json({ status: false, message: "Login Gagal" });
    }
});
if (require.main === module) {
    app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));
}
module.exports = app;