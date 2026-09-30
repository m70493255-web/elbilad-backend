const Product = require("../models/Product");
const jwt = require("jsonwebtoken");

async function revalidateProducts() {
  try {
    const url = `${process.env.FRONTEND_URL}/api/revalidate?secret=${process.env.REVALIDATE_SECRET}&tag=products`;
    await fetch(url, { method: "POST" });
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
  return str
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
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
    const product = await Product.findById(req.params.id).lean({ virtuals: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch {
    res.status(404).json({ message: "Product not found" });
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
