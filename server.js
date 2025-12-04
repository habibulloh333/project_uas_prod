// ======================
// Mahasiswa 4 – API Gateway Final
// ======================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db.js');

const app = express();
const PORT = 3300;

app.use(cors());
app.use(express.json());

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
