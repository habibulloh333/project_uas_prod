require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db.js');                 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken, authorizeRole } = require('./auth.js');

const app = express();
const PORT = 3300;
const JWT_SECRET = process.env.JWT_SECRET;

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json());

// Endpoint status 
app.get("/status", (req, res) => {
  res.json({ status: "API Vendor is running" });
});


// === AUTH ROUTES (Refactored for pg) ===
app.post('/auth/register', async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password || password.length < 6) {
    return res.status(400).json({
      error: 'Username dan password (min 6 char) harus diisi'
    });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const sql =
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username';

    const result = await db.query(sql, [
      username.toLowerCase(),
      hashedPassword,
      'user'
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // Kode error unik PostgreSQL
      return res.status(409).json({ error: 'Username sudah digunakan' });
    }
    next(err);
  }
});

app.post('/auth/register-admin', async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Username dan password (min 6 char) harus diisi' });
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const sql = 'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username';
    const result = await db.query(sql, [username.toLowerCase(), hashedPassword, 'admin']);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username sudah digunakan' });
    }
    next(err);
  }
});

app.post('/auth/login', async (req, res, next) => {
  const { username, password } = req.body;
  try {
    const sql = "SELECT * FROM users WHERE username = $1";
    const result = await db.query(sql, [username.toLowerCase()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Kredensial tidak valid' });
    }
    const payload = { user: { id: user.id, username: user.username, role: user.role } };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login berhasil', token: token });
  } catch (err) {
    next(err);
  }
});

/* =============================================================
   GET ALL PRODUCTS (Vendor B)
============================================================= */
app.get('/vendor-b/fashion', async (req, res, next) => {
  const sql = `
    SELECT 
      sku,
      product_name AS "productName",
      price,
      is_available AS "isAvailable",
      created_at
    FROM vendor_b_products
    ORDER BY sku ASC
  `;

  try {
    const result = await db.query(sql);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/* =============================================================
   GET PRODUCT BY SKU
============================================================= */
app.get('/vendor-b/fashion/:sku', async (req, res, next) => {
  const sql = `
    SELECT 
      sku,
      product_name AS "productName",
      price,
      is_available AS "isAvailable",
      created_at
    FROM vendor_b_products
    WHERE sku = $1
  `;

  try {
    const result = await db.query(sql, [req.params.sku]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Produk tidak ditemukan" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/* =============================================================
   CREATE PRODUCT (menggunakan SKU sebagai primary unique key)
============================================================= */
app.post('/vendor-b/fashion', authenticateToken, async (req, res, next) => {
  const { sku, productName, price, isAvailable } = req.body;

  if (!sku || !productName || !price || !isAvailable) {
    return res.status(400).json({
      error: 'sku, productName, price, dan isAvailable wajib diisi'
    });
  }

  if (isAvailable !== "Tersedia" && isAvailable !== "Habis") {
      return res
        .status(400)
        .json({ error: "isAvailable harus 'Tersedia' atau 'Habis'." });
    }

  const sql = `
    INSERT INTO vendor_b_products (sku, product_name, price, is_available)
    VALUES ($1, $2, $3, $4)
    RETURNING sku, product_name AS "productName", price, is_available AS "isAvailable"
  `;

  try {
    const result = await db.query(sql, [
      sku,
      productName,
      price,
      isAvailable
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'SKU sudah digunakan' });
    }
    next(err);
  }
});

/* =============================================================
   UPDATE PRODUCT by SKU
============================================================= */
app.put('/vendor-b/fashion/:sku',
  authenticateToken,
  authorizeRole('admin'),
  async (req, res, next) => {

    const { productName, price, isAvailable } = req.body;

    const sql = `
      UPDATE vendor_b_products
      SET product_name = $1, price = $2, is_available = $3
      WHERE sku = $4
      RETURNING sku, product_name AS "productName", price, is_available AS "isAvailable"
    `;

    try {
      const result = await db.query(sql, [
        productName,
        price,
        isAvailable,
        req.params.sku
      ]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Produk tidak ditemukan" });
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
});

/* =============================================================
   DELETE PRODUCT by SKU
============================================================= */
app.delete('/vendor-b/fashion/:sku',
  authenticateToken,
  authorizeRole('admin'),
  async (req, res, next) => {

    const sql = `DELETE FROM vendor_b_products WHERE sku = $1 RETURNING *`;

    try {
      const result = await db.query(sql, [req.params.sku]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Produk tidak ditemukan" });
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
});

// === FALLBACK & ERROR HANDLING ===
app.use((req, res) => {
  res.status(404).json({ error: 'Route tidak ditemukan' });
});

app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.stack);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

// === START SERVER ===
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server aktif di http://localhost:${PORT}`);
});
