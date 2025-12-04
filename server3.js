
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg'); 
const { authenticateToken, authorizeRole } = require('./auth.js'); 

const app = express();
const PORT = 3200;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL tidak terdefinisi di .env!");
    process.exit(1);
}

// Inisialisasi Pool Koneksi Database Neon
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json());

// HELPER FUNCTIONS (Pemformatan & Perhitungan) 
const calculateFinalPrice = (base_price, tax) => {
    if (typeof base_price !== 'number' || typeof tax !== 'number') {
        throw new Error('base_price dan tax harus berupa angka');
    }
    return base_price + tax;
};

const formatProductResponse = (dbProduct) => ({
    id: dbProduct.id,
    details: {
        name: dbProduct.name,
        category: dbProduct.category
    },
    pricing: {
        base_price: dbProduct.base_price,
        tax: dbProduct.tax,
        harga_final: dbProduct.harga_final // Perhitungan final
    },
    stock: dbProduct.stock,
    created_by: dbProduct.created_by,
    created_at: dbProduct.created_at
});

// STATUS ENDPOINT 
app.get('/status', async (req, res) => {
    let totalProducts = 0;
    try {
        const result = await pool.query('SELECT COUNT(*) FROM products');
        totalProducts = parseInt(result.rows[0].count);
    } catch (e) {
        console.error("Warning: Gagal menghitung produk, tabel mungkin belum dibuat.");
    }

    res.json({ 
        ok: true, 
        service: 'vendor-c-resto-api',
        vendor: 'Vendor C - Resto & Kuliner Banyuwangi',
        total_products: totalProducts
    });
});

// AUTH ROUTES (CRUD ke NEON)

// Register (Digunakan untuk User dan Admin)
const registerUser = async (req, res, role) => {
    const { username, password } = req.body; 
    
    if (!username || !password || password.length < 6) {
        return res.status(400).json({ error: "Username dan password (min 6 char) harus diisi" });
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const sql =
            "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role";
        const result = await pool.query(sql, [
            username.toLowerCase(),
            hashedPassword,
            role, 
        ]);
        
        res.status(201).json({
            success: true,
            message: `Registrasi ${role} berhasil!`,
            user: result.rows[0]
        });
    } catch (err) {
        if (err.code === "23505") { 
            return res.status(409).json({ error: "Username sudah digunakan" });
        }
        console.error(err);
        res.status(500).json({ error: "Registrasi gagal." });
    }
}

app.post("/auth/register", (req, res, next) => registerUser(req, res, 'user'));
app.post("/auth/register-admin", (req, res, next) => registerUser(req, res, 'admin')); 
// Login
app.post("/auth/login", async (req, res, next) => {
    const { username, password } = req.body;
    try {
        const sql = "SELECT * FROM users WHERE username = $1";
        const result = await pool.query(sql, [username.toLowerCase()]);
        const user = result.rows[0];
        
        if (!user) {
            return res.status(401).json({ error: "Username atau password salah!" });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(401).json({ error: "Username atau password salah!" });
        }
        
        const payload = { user: { id: user.id, username: user.username, role: user.role } };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
        
        res.json({ 
            success: true,
            message: "Login berhasil", 
            token: token,
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Login gagal." });
    }
});

// PRODUCTS ROUTES (CRUD ke NEON)

// GET All Products (Public)
app.get('/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id ASC'); 
        const formattedProducts = result.rows.map(formatProductResponse);

        res.json({
            success: true,
            total: formattedProducts.length,
            data: formattedProducts
        });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data dari database Neon. (Tabel products mungkin belum dibuat)' });
    }
});

// GET Product by ID (Public)
app.get('/products/:id', async (req, res) => {
    const productId = req.params.id;
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }
        res.json({ success: true, data: formatProductResponse(result.rows[0]) });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data dari database Neon' });
    }
});

// CREATE Product (Protected - User atau Admin)
app.post('/products', authenticateToken, async (req, res) => {
    const { name, category, base_price, tax, stock } = req.body;

    if (!name || !category || typeof base_price !== 'number' || typeof tax !== 'number' || typeof stock !== 'number') {
        return res.status(400).json({ error: 'Semua field wajib diisi dan harus berupa angka' });
    }

    try {
        const harga_final = calculateFinalPrice(base_price, tax);
        
        const query = `
            INSERT INTO products (name, category, base_price, tax, stock, harga_final, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const values = [name, category, base_price, tax, stock, harga_final, req.user.username];
        const result = await pool.query(query, values);

        res.status(201).json({
            success: true,
            message: 'Produk berhasil ditambahkan!',
            data: formatProductResponse(result.rows[0])
        });
    } catch (err) {
        res.status(500).json({ error: 'Gagal membuat produk di database Neon: ' + err.message });
    }
});

// UPDATE Product (Protected - Hanya ADMIN)
app.put('/products/:id', [authenticateToken, authorizeRole('admin')], async (req, res) => {
    const productId = req.params.id;
    const { name, category, base_price, tax, stock } = req.body;
    
    try {
        const existingProductResult = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        
        if (existingProductResult.rows.length === 0) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }
        
        const current = existingProductResult.rows[0];

        const newBasePrice = base_price !== undefined ? base_price : current.base_price;
        const newTax = tax !== undefined ? tax : current.tax;
        const newHargaFinal = calculateFinalPrice(newBasePrice, newTax);

        const query = `
            UPDATE products 
            SET name = $1, category = $2, base_price = $3, tax = $4, stock = $5, harga_final = $6, updated_by = $7, updated_at = NOW()
            WHERE id = $8
            RETURNING *
        `;
        const values = [
            name || current.name, 
            category || current.category, 
            newBasePrice, 
            newTax, 
            stock !== undefined ? stock : current.stock, 
            newHargaFinal, 
            req.user.username, 
            productId
        ];
        
        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'Produk berhasil diupdate!',
            data: formatProductResponse(result.rows[0])
        });
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengupdate produk di database Neon: ' + err.message });
    }
});

// DELETE Product (Protected - Hanya ADMIN)
app.delete('/products/:id', [authenticateToken, authorizeRole('admin')], async (req, res) => {
    const productId = req.params.id;

    try {
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [productId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }

        res.json({
            success: true,
            message: 'Produk berhasil dihapus!',
            deleted_product: formatProductResponse(result.rows[0])
        });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus produk dari database Neon: ' + err.message });
    }
});

// ERROR HANDLING & START SERVER

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err.stack);
    res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 server 3 API berjalan di http://localhost:${PORT}`);
    console.log("---------------------------------------------------------------");
});