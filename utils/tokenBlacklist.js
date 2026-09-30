/**
 * نظام القائمة السوداء للتوكنات
 * يستخدم Map في الذاكرة للتخزين المؤقت
 * في الإنتاج، استبدل بـ Redis للتوزيع الأفقي
 */

const jwt = require("jsonwebtoken");

// تخزين مؤقت في الذاكرة (للتطوير)
// في الإنتاج: استخدم Redis
const blacklist = new Map();

/**
 * إضافة token للقائمة السوداء
 * @param {string} token - JWT token
 */
function addToBlacklist(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      console.error("Token غير صالح للقائمة السوداء");
      return false;
    }

    // حساب وقت انتهاء الصلاحية
    const expiresAt = decoded.exp * 1000; // تحويل لـ milliseconds
    const now = Date.now();
    const ttl = expiresAt - now;

    // إذا Token منتهي أصلاً، لا داعي لإضافته
    if (ttl <= 0) {
      return true;
    }

    // إضافة للقائمة السوداء
    blacklist.set(token, expiresAt);

    // حذف تلقائي بعد انتهاء الصلاحية
    setTimeout(() => {
      blacklist.delete(token);
    }, ttl);

    return true;
  } catch (err) {
    console.error("خطأ في إضافة token للقائمة السوداء:", err);
    return false;
  }
}

/**
 * التحقق من وجود token في القائمة السوداء
 * @param {string} token - JWT token
 * @returns {boolean}
 */
function isBlacklisted(token) {
  if (!blacklist.has(token)) {
    return false;
  }

  // التحقق من انتهاء الصلاحية
  const expiresAt = blacklist.get(token);
  if (Date.now() >= expiresAt) {
    blacklist.delete(token);
    return false;
  }

  return true;
}

/**
 * حذف tokens منتهية الصلاحية من الذاكرة
 * ينفذ دورياً كل ساعة
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleaned = 0;

  for (const [token, expiresAt] of blacklist.entries()) {
    if (now >= expiresAt) {
      blacklist.delete(token);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`تم حذف ${cleaned} token منتهي من القائمة السوداء`);
  }
}

// تنظيف تلقائي كل ساعة
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

/**
 * الحصول على إحصائيات القائمة السوداء
 */
function getStats() {
  return {
    totalTokens: blacklist.size,
    tokens: Array.from(blacklist.entries()).map(([token, expiresAt]) => ({
      tokenPreview: token.substring(0, 20) + "...",
      expiresAt: new Date(expiresAt).toISOString(),
    })),
  };
}

module.exports = {
  addToBlacklist,
  isBlacklisted,
  cleanupExpiredTokens,
  getStats,
};
