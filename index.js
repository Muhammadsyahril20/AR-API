require('dotenv').config(); // Load settingan .env (Wajib paling atas)

const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000; // Biar Vercel yang atur Port

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Folder Public (Supaya bisa buka admin.html)
app.use(express.static(path.join(__dirname, 'public')));

// --- SETUP DATABASE (MODIFIKASI VERCEL) ---
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_ar_unity',
    port: process.env.DB_PORT || 3306,
    connectTimeout: 10000 
});

// Cek koneksi
db.connect((err) => {
    if (err) console.error('❌ Database Error:', err.message);
    else console.log('✅ Database Terkoneksi!');
});

// --- ROUTES API ---

app.get('/', (req, res) => {
    res.send("API AR Unity Berjalan! 🚀");
});

// 1. GET: Ambil Semua Data
app.get('/api/data', (req, res) => {
    const sql = "SELECT * FROM ar_content ORDER BY id DESC";
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ status: true, data: result });
    });
});

// 2. GET: Ambil Satu Data (Detail)
app.get('/api/data/:id', (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM ar_content WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ status: false, message: "Data null" });
        res.json({ status: true, data: result[0] });
    });
});

// 3. POST: Tambah Data Baru
app.post('/api/data', (req, res) => {
    const { judul, informasi } = req.body;
    
    if (!judul || !informasi) {
        return res.status(400).json({ status: false, message: "Judul dan Informasi wajib diisi!" });
    }

    const sql = "INSERT INTO ar_content (judul, informasi) VALUES (?, ?)";
    db.query(sql, [judul, informasi], (err, result) => {
        if (err) return res.status(500).json({ status: false, message: err.message });
        
        res.json({
            status: true,
            message: "Data berhasil ditambahkan!",
            insertedId: result.insertId
        });
    });
});

// [BARU] 4. PUT: Update Data (Fitur Edit)
app.put('/api/data/:id', (req, res) => {
    const id = req.params.id;
    const { judul, informasi } = req.body;

    if (!judul || !informasi) {
        return res.status(400).json({ status: false, message: "Data tidak lengkap!" });
    }

    const sql = "UPDATE ar_content SET judul = ?, informasi = ? WHERE id = ?";
    db.query(sql, [judul, informasi, id], (err, result) => {
        if (err) return res.status(500).json({ status: false, message: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ status: false, message: "ID tidak ditemukan" });
        }

        res.json({ status: true, message: "Data berhasil diupdate!" });
    });
});
app.delete('/api/data/:id', (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM ar_content WHERE id = ?";
    
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ status: false, message: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ status: false, message: "ID tidak ditemukan" });
        }

        res.json({ status: true, message: "Data berhasil dihapus!" });
    });
});

// --- EXPORT SERVER (PENTING BUAT VERCEL) ---
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server jalan! Buka Admin Panel di: http://localhost:${PORT}/admin.html`);
    });
}

module.exports = app;