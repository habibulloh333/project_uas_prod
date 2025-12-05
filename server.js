// ======================
// Mahasiswa 4 – API Gateway Final
// ======================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db.js');
const JWT_SECRET = process.env.JWT_SECRET;
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authenticateToken, authorizeRole } = require("./auth.js");

const app = express();
const PORT = 3300;

app.use(cors());
app.use(express.json());

app.post("/auth/register", async (req, res, next) => {
  const { username, password, role } = req.body;
  if (!username || !password || password.length < 6) {
    return res
      .status(400)
      .json({ error: "Username dan password (min 6 char) harus diisi" });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const sql =
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username";
    const result = await db.query(sql, [
      username.toLowerCase(),
      hashedPassword,
      "user",
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Username sudah digunakan" });
    }
    next(err);
  }
});

app.post("/auth/register-admin", async (req, res, next) => {
  const { username, password, adminKey } = req.body;
  if (!username || !password || password.length < 6) {
    return res
      .status(400)
      .json({ error: "Username dan password (min 6 char) harus diisi" });
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const sql =
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username";
    const result = await db.query(sql, [
      username.toLowerCase(),
      hashedPassword,
      "admin",
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username sudah digunakan" });
    }
    next(err);
  }
});

app.post("/auth/login", async (req, res, next) => {
  const { username, password } = req.body;
  try {
    const sql = "SELECT * FROM users WHERE username = $1";
    const result = await db.query(sql, [username.toLowerCase()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Kredensial tidak valid" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Kredensial tidak valid" });
    }
    const payload = {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login berhasil", token: token });
  } catch (err) {
    next(err);
  }
});

// VENDOR A

pp.get("/api/vendor-a/products", async (req, res, next) => {
  console.log("[GET /api/vendor-a/products] Fetching all products from DB");
  const sql =
    "SELECT kd_produk, nm_brg, hrg, ket_stok FROM vendor_a_products ORDER BY kd_produk ASC";

  try {
    const result = await db.query(sql);
    res.json(result.rows); // Mengembalikan array produk
  } catch (err) {
    console.error("Database error on GET all products:", err);
    next(err); // Lempar error ke error handler global
  }
});

// 2. GET Product by ID (kd_produk) (Vendor A)
// Endpoint: GET /api/vendor-a/products/:kd_produk
app.get("/api/vendor-a/products/:kd_produk", async (req, res, next) => {
  const { kd_produk } = req.params;
  console.log(
    `[GET /api/vendor-a/products/${kd_produk}] Fetching product from DB`
  );

  const sql =
    "SELECT kd_produk, nm_brg, hrg, ket_stok FROM vendor_a_products WHERE kd_produk = $1";
  const values = [kd_produk];

  try {
    const result = await db.query(sql, values);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          error: `Produk dengan kd_produk ${kd_produk} tidak ditemukan.`,
        });
    }

    res.json(result.rows[0]); // Mengembalikan satu produk
  } catch (err) {
    console.error("Database error on GET product by ID:", err);
    next(err);
  }
});

// 3. POST Create New Product (Vendor A)
// Endpoint: POST /api/vendor-a/products
// Body: { "kd_produk": "A004", "nm_brg": "...", "hrg": "...", "ket_stok": "..." }
app.post(
  "/api/vendor-a/products",
  authenticateToken,
  async (req, res, next) => {
    const { kd_produk, nm_brg, hrg, ket_stok } = req.body;
    console.log(
      "[POST /api/vendor-a/products] Creating new product in DB:",
      req.body
    );

    // Validasi input sederhana
    if (!kd_produk || !nm_brg || !hrg || !ket_stok) {
      return res
        .status(400)
        .json({
          error: "Semua field (kd_produk, nm_brg, hrg, ket_stok) wajib diisi.",
        });
    }

    // Validasi tipe data string
    if (
      typeof kd_produk !== "string" ||
      typeof nm_brg !== "string" ||
      typeof hrg !== "string" ||
      typeof ket_stok !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "Semua field harus berupa string." });
    }

    // Validasi nilai ket_stok
    if (ket_stok !== "ada" && ket_stok !== "habis") {
      return res
        .status(400)
        .json({ error: "ket_stok harus 'ada' atau 'habis'." });
    }

    const sql =
      "INSERT INTO vendor_a_products (kd_produk, nm_brg, hrg, ket_stok) VALUES ($1, $2, $3, $4) RETURNING *";
    const values = [kd_produk, nm_brg, hrg, ket_stok]; // Urutan sesuai placeholder $1, $2, $3, $4

    try {
      const result = await db.query(sql, values);
      res.status(201).json(result.rows[0]); // Mengembalikan produk yang baru dibuat
    } catch (err) {
      if (err.code === "23505") {
        // Error code untuk unique_violation di PostgreSQL
        return res
          .status(409)
          .json({ error: `Produk dengan kd_produk ${kd_produk} sudah ada.` });
      }
      console.error("Database error on POST new product:", err);
      next(err);
    }
  }
);

// 4. PUT Update Product by ID (Vendor A)
// Endpoint: PUT /api/vendor-a/products/:kd_produk
// Body: { "nm_brg": "...", "hrg": "...", "ket_stok": "..." } (kd_produk tidak bisa diubah)
app.put(
  "/api/vendor-a/products/:kd_produk", 
  [authenticateToken, authorizeRole("admin")],   
  async (req, res, next) => {
    const { kd_produk } = req.params;
    const { nm_brg, hrg, ket_stok } = req.body; // kd_produk tidak diambil dari body
    console.log(
      `[PUT /api/vendor-a/products/${kd_produk}] Updating product in DB with data:`,
      req.body
    );

    // Validasi input sederhana
    if (!nm_brg || !hrg || !ket_stok) {
      return res
        .status(400)
        .json({
          error: "Field nm_brg, hrg, dan ket_stok wajib diisi untuk update.",
        });
    }

    // Validasi tipe data string
    if (
      typeof nm_brg !== "string" ||
      typeof hrg !== "string" ||
      typeof ket_stok !== "string"
    ) {
      return res
        .status(400)
        .json({
          error: "Field nm_brg, hrg, dan ket_stok harus berupa string.",
        });
    }

    // Validasi nilai ket_stok
    if (ket_stok !== "ada" && ket_stok !== "habis") {
      return res
        .status(400)
        .json({ error: "ket_stok harus 'ada' atau 'habis'." });
    }

    const sql =
      "UPDATE vendor_a_products SET nm_brg = $1, hrg = $2, ket_stok = $3 WHERE kd_produk = $4 RETURNING *";
    const values = [nm_brg, hrg, ket_stok, kd_produk]; // Urutan sesuai placeholder

    try {
      const result = await db.query(sql, values);

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({
            error: `Produk dengan kd_produk ${kd_produk} tidak ditemukan.`,
          });
      }

      res.json(result.rows[0]); // Mengembalikan produk yang telah diperbarui
    } catch (err) {
      console.error("Database error on PUT update product:", err);
      next(err);
    }
  }
);

// 5. DELETE Product by ID (Vendor A)
// Endpoint: DELETE /api/vendor-a/products/:kd_produk
app.delete(
  "/api/vendor-a/products/:kd_produk",
  [authenticateToken, authorizeRole("admin")],
  async (req, res, next) => {
    const { kd_produk } = req.params;
    console.log(
      `[DELETE /api/vendor-a/products/${kd_produk}] Deleting product from DB`
    );

    const sql =
      "DELETE FROM vendor_a_products WHERE kd_produk = $1 RETURNING *";
    const values = [kd_produk];

    try {
      const result = await db.query(sql, values);

      if (result.rows.length === 0) {
        return res
          .status(404)
          .json({
            error: `Produk dengan kd_produk ${kd_produk} tidak ditemukan.`,
          });
      }

      res.json({
        message: `Produk dengan kd_produk ${kd_produk} berhasil dihapus.`,
        deletedProduct: result.rows[0],
      });
    } catch (err) {
      console.error("Database error on DELETE product:", err);
      next(err);
    }
  }
);

// VENDOR B

//GET ALL PRODUCTS (Vendor B)
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


//GET PRODUCT BY SKU
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

  //CREATE PRODUCT (menggunakan SKU sebagai primary unique key)
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


//UPDATE PRODUCT by SKU
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


//DELETE PRODUCT by SKU
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

// VENDOR C

//HELPER FUNCTIONS (Pemformatan & Perhitungan) 
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
        harga_final: dbProduct.harga_final 
    },
    stock: dbProduct.stock,
    created_by: dbProduct.created_by,
    created_at: dbProduct.created_at
});

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

// CREATE Product User atau Admin
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

// UPDATE Product Hanya ADMIN
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

// DELETE Product Hanya ADMIN
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


/* ============================================
   FORMATTER – Menyamakan format semua vendor
   + Tambahan Logika Validasi
============================================ */

// Vendor A (Mahasiswa 1) — Diskon 10%
const formatVendorAProduct = (p) => {
    const hargaAsli = parseFloat(p.hrg);
    const hargaFinal = hargaAsli * 0.9; // Diskon 10%

    return {
        vendor: "Vendor A (Warung Klontong)",
        kd_produk: p.kd_produk,
        nm_brg: p.nm_brg,
        hrg: hargaAsli,
        diskon: "10%",
        harga_diskon: hargaFinal,
        ket_stok: p.ket_stok
    };
};

// Vendor B (Mahasiswa 2) — Tidak ada aturan khusus
const formatVendorBProduct = (p) => ({
    vendor: "Vendor B (Distro Fashion)",
    sku: p.sku,
    productName: p.productName,
    price: p.price,
    isAvailable: p.isAvailable,
});

// Vendor C (Mahasiswa 3) — Food → Recommended
const formatVendorCProduct = (p) => {
    let nama = p.name;

    // Tambahkan Recommended untuk kategori Food
    if (p.category.toLowerCase() === "makanan") {
        nama = `${nama} (Recommended)`;
    }

    return {
        vendor: "Vendor C (Resto dan Kuliner)",
        id: p.id,
        details: {
            name: nama,
            category: p.category,
        },
        pricing: {
           base_price: p.base_price,
           tax: p.tax,
           harga_final: p.harga_final,
        },     
        stock: p.stock > 0 ? "ada" : "habis",
    };
};

/* ============================================
   GET ALL PRODUCTS — Gabungan A + B + C
============================================ */

app.get('/all-products', async (req, res) => {
    try {
        // === Vendor A ===
        const resultA = await db.query(`
            SELECT kd_produk, nm_brg, hrg, ket_stok 
            FROM vendor_a_products
            ORDER BY kd_produk ASC
        `);
        const dataA = resultA.rows.map(formatVendorAProduct);

        // === Vendor B ===
        const resultB = await db.query(`
            SELECT 
                sku, 
                product_name AS "productName",
                price,
                is_available AS "isAvailable"
            FROM vendor_b_products
            ORDER BY sku ASC
        `);
        const dataB = resultB.rows.map(formatVendorBProduct);

        // === Vendor C ===
        const resultC = await db.query(`
            SELECT 
                id, name, category, 
                base_price, tax, harga_final, stock 
            FROM products
            ORDER BY id ASC
        `);
        const dataC = resultC.rows.map(formatVendorCProduct);

        // === Gabungan semua data ===
        const all = [...dataA, ...dataB, ...dataC];

        res.json({
            success: true,
            total: all.length,
            applied_rules: [
                "Vendor A: Diskon 10%",
                "Vendor C (Food): Tambahan label (Recommended)"
            ],
            data: all
        });

    } catch (err) {
        console.error("GATEWAY ERROR:", err);
        res.status(500).json({ error: "Gagal membaca data gabungan" });
    }
});

app.get("/", (req, res) => {
  res.send("API berjalan dengan benar");
});


/* ============================================
   START SERVER
============================================ */

app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Gateway Mahasiswa 4 berjalan di http://localhost:${PORT}`);
    console.log(`Endpoint Gabungan: http://localhost:${PORT}/all-products`);
});
