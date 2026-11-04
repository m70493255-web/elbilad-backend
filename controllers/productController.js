const Product = require("../models/Product");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

async function revalidateProducts() {
  try {
    const raw = process.env.FRONTEND_URL || "http://localhost:3000";
    const urls = raw.split(",").map((u) => u.trim()).filter(Boolean);
    const secret = process.env.REVALIDATE_SECRET;
    if (!secret) return;
    for (const baseUrl of urls) {
      try {
        const cleanBase = baseUrl.replace(/\/$/, "");
        const url = `${cleanBase}/api/revalidate?secret=${encodeURIComponent(secret)}&tag=products`;
        await fetch(url, { method: "POST" });
      } catch { /* non-blocking */ }
    }
  } catch { /* non-blocking */ }
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "غير مصرح" });
  }
}

function normalizeArabic(str) {
  if (!str) return "";
  return String(str)
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

function escapeRegex(string) {
  return String(string || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ALLOWED_FIELDS = [
  "name", "category", "subCategory", "brand", "color", "storage",
  "network", "screenSize", "description", "deliveryTime",
  "originalPrice", "salePrice", "warrantyYears",
  "freeDelivery", "taxIncluded", "inStock",
  "installment", "specs", "colors", "image", "images",
];

function pickAllowed(body) {
  return ALLOWED_FIELDS.reduce((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key];
    return acc;
  }, {});
}

// Projection for homepage/listing: excludes heavy fields not needed in cards
const CARD_PROJECTION = {
  name: 1, originalPrice: 1, salePrice: 1, discountPercent: 1,
  image: 1, images: 1, color: 1, storage: 1,
  inStock: 1, brand: 1, category: 1, subCategory: 1,
  variants: 1,
  "installment.available": 1, "installment.downPayment": 1,
};

exports.getProducts = async (req, res) => {
  try {
    const { q, brand, full } = req.query;
    // full=1 returns all fields (used by product detail page)
    const projection = full === "1" ? {} : CARD_PROJECTION;
    const query = {};
    if (brand) query.brand = { $regex: new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    if (!q) return res.json(await Product.find(query, projection).lean({ virtuals: true }));

    const normalized = normalizeArabic(String(q).slice(0, 100));
    const products = await Product.find(query, projection).limit(200).lean({ virtuals: true });
    const filtered = products.filter((p) =>
      normalizeArabic(p.name).includes(normalized)
    );
    res.json(filtered);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id || "").trim();
    if (!rawId) return res.status(404).json({ message: "Product not found" });

    // 1. Try finding by MongoDB ObjectId if valid
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      const product = await Product.findById(rawId).lean({ virtuals: true });
      if (product) return res.json(product);
    }

    // 2. Try finding by exact name
    let product = await Product.findOne({ name: rawId }).lean({ virtuals: true });
    if (product) return res.json(product);

    // 3. Try finding by case-insensitive regex name
    const cleanQuery = rawId.replace(/[-_]+/g, " ").trim();
    if (cleanQuery) {
      product = await Product.findOne({
        name: { $regex: new RegExp(escapeRegex(cleanQuery), "i") },
      }).lean({ virtuals: true });
      if (product) return res.json(product);
    }

    // 4. Try finding by normalized Arabic name or slug match
    const normalizedRaw = normalizeArabic(cleanQuery);
    const allProducts = await Product.find({}, {}).limit(300).lean({ virtuals: true });

    product = allProducts.find((p) => slugify(p.name) === slugify(rawId));
    if (product) return res.json(product);

    product = allProducts.find((p) => {
      const normName = normalizeArabic(p.name || "");
      return normName.includes(normalizedRaw) || normalizedRaw.includes(normName);
    });
    if (product) return res.json(product);

    return res.status(404).json({ message: "Product not found" });
  } catch (err) {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
};

exports.createProduct = [requireAdmin, async (req, res) => {
  try {
    const data = pickAllowed(req.body);
    const product = await Product.create(data);
    revalidateProducts();
    res.status(201).json(product);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
}];

exports.updateProduct = [requireAdmin, async (req, res) => {
  try {
    const data = pickAllowed(req.body);
    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    revalidateProducts();
    res.json(product);
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
}];

exports.deleteProduct = [requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    revalidateProducts();
    res.json({ message: "Product deleted" });
  } catch {
    res.status(500).json({ error: "خطأ في الخادم" });
  }
}];
