/**
 * Telegram Bot - يحول الرسائل بين شخصين
 * 
 * Usage: node telegram-bot.js
 * 
 * الوظيفة: أي رسالة يرسلها أحد الشخصين تصل للآخر تلقائياً
 */

require("dotenv").config();
const { Telegraf } = require("telegraf");

// ── Configuration ──
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

// Validate configuration
if (!BOT_TOKEN) {
  console.error("❌ ERROR: TELEGRAM_BOT_TOKEN غير موجود في ملف .env");
  process.exit(1);
}

if (CHAT_IDS.length !== 2) {
  console.error("❌ ERROR: يجب أن يكون هناك شخصين بالضبط في TELEGRAM_CHAT_ID");
  console.error(`   عدد الأشخاص الحالي: ${CHAT_IDS.length}`);
  process.exit(1);
}

const [PERSON_1, PERSON_2] = CHAT_IDS;

console.log("🤖 بوت التلجرام - تحويل الرسائل");
console.log("=" .repeat(50));
console.log(`✅ الشخص الأول: ${PERSON_1}`);
console.log(`✅ الشخص الثاني: ${PERSON_2}`);
console.log("");

// Create bot instance
const bot = new Telegraf(BOT_TOKEN);

console.log("🚀 البوت يعمل الآن...");
console.log("📨 أي رسالة من أحد الشخصين ستصل للآخر تلقائياً");
console.log("");

// Helper function to get the other person's chat ID
function getOtherPerson(fromChatId) {
  const from = fromChatId.toString();
  if (from === PERSON_1) return PERSON_2;
  if (from === PERSON_2) return PERSON_1;
  return null;
}

// Helper function to get person label
function getPersonLabel(chatId) {
  const id = chatId.toString();
  if (id === PERSON_1) return "الشخص الأول";
  if (id === PERSON_2) return "الشخص الثاني";
  return "شخص غير معروف";
}

// Helper function to get timestamp
function getTimestamp() {
  return new Date().toLocaleString('ar-SA', { 
    timeZone: 'Asia/Riyadh',
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

// Handle /start command
bot.command("start", (ctx) => {
  const chatId = ctx.chat.id.toString();
  
  let welcomeMessage = "🤖 مرحباً بك في بوت التواصل!\n\n";
  
  if (chatId === PERSON_1 || chatId === PERSON_2) {
    welcomeMessage += "✅ أنت مسجل في البوت\n";
    welcomeMessage += "📨 أي رسالة ترسلها ستصل للطرف الآخر تلقائياً\n\n";
    welcomeMessage += "يمكنك إرسال:\n";
    welcomeMessage += "• نصوص\n";
    welcomeMessage += "• صور\n";
    welcomeMessage += "• ملفات\n";
    welcomeMessage += "• مستندات\n";
    welcomeMessage += "• فيديوهات\n";
    welcomeMessage += "• رسائل صوتية";
  } else {
    welcomeMessage += "⚠️ أنت غير مسجل في البوت\n";
    welcomeMessage += `Chat ID الخاص بك: ${chatId}`;
  }
  
  ctx.reply(welcomeMessage);
});

// Handle text messages
bot.on("text", async (ctx) => {
  // Skip commands
  if (ctx.message.text.startsWith("/")) return;
  
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  // Check if sender is authorized
  if (!toChatId) {
    console.log(`⚠️  رسالة من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    const messageToSend = `📨 من ${senderLabel}\n⏰ ${timestamp}\n\n${ctx.message.text}`;
    await ctx.telegram.sendMessage(toChatId, messageToSend);
    console.log(`✅ نص من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل النص:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال رسالتك");
  }
});

// Handle photo messages
bot.on("photo", async (ctx) => {
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  if (!toChatId) {
    console.log(`⚠️  صورة من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Highest quality
    const caption = ctx.message.caption 
      ? `📸 صورة من ${senderLabel}\n⏰ ${timestamp}\n\n${ctx.message.caption}`
      : `📸 صورة من ${senderLabel}\n⏰ ${timestamp}`;
    
    await ctx.telegram.sendPhoto(toChatId, photo.file_id, { caption });
    console.log(`✅ صورة من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل الصورة:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال الصورة");
  }
});

// Handle document messages
bot.on("document", async (ctx) => {
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  if (!toChatId) {
    console.log(`⚠️  ملف من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    const caption = ctx.message.caption 
      ? `📄 ملف من ${senderLabel}\n⏰ ${timestamp}\n\n${ctx.message.caption}`
      : `📄 ملف من ${senderLabel}\n⏰ ${timestamp}`;
    
    await ctx.telegram.sendDocument(toChatId, ctx.message.document.file_id, { caption });
    console.log(`✅ ملف من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل الملف:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال الملف");
  }
});

// Handle video messages
bot.on("video", async (ctx) => {
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  if (!toChatId) {
    console.log(`⚠️  فيديو من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    const caption = ctx.message.caption 
      ? `🎥 فيديو من ${senderLabel}\n⏰ ${timestamp}\n\n${ctx.message.caption}`
      : `🎥 فيديو من ${senderLabel}\n⏰ ${timestamp}`;
    
    await ctx.telegram.sendVideo(toChatId, ctx.message.video.file_id, { caption });
    console.log(`✅ فيديو من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل الفيديو:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال الفيديو");
  }
});

// Handle voice messages
bot.on("voice", async (ctx) => {
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  if (!toChatId) {
    console.log(`⚠️  رسالة صوتية من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    const caption = `🎤 رسالة صوتية من ${senderLabel}\n⏰ ${timestamp}`;
    
    await ctx.telegram.sendVoice(toChatId, ctx.message.voice.file_id, { caption });
    console.log(`✅ رسالة صوتية من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل الرسالة الصوتية:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال الرسالة الصوتية");
  }
});

// Handle audio messages
bot.on("audio", async (ctx) => {
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  if (!toChatId) {
    console.log(`⚠️  ملف صوتي من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    const caption = ctx.message.caption 
      ? `🎵 ملف صوتي من ${senderLabel}\n⏰ ${timestamp}\n\n${ctx.message.caption}`
      : `🎵 ملف صوتي من ${senderLabel}\n⏰ ${timestamp}`;
    
    await ctx.telegram.sendAudio(toChatId, ctx.message.audio.file_id, { caption });
    console.log(`✅ ملف صوتي من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل الملف الصوتي:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال الملف الصوتي");
  }
});

// Handle sticker messages
bot.on("sticker", async (ctx) => {
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  if (!toChatId) {
    console.log(`⚠️  ملصق من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    await ctx.telegram.sendSticker(toChatId, ctx.message.sticker.file_id);
    await ctx.telegram.sendMessage(toChatId, `من ${senderLabel} ⬆️\n⏰ ${timestamp}`);
    console.log(`✅ ملصق من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل الملصق:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال الملصق");
  }
});

// Handle location messages
bot.on("location", async (ctx) => {
  const fromChatId = ctx.chat.id.toString();
  const toChatId = getOtherPerson(fromChatId);
  
  if (!toChatId) {
    console.log(`⚠️  موقع من شخص غير مسجل: ${fromChatId}`);
    return ctx.reply("⚠️ عذراً، أنت غير مسجل في هذا البوت");
  }
  
  const senderLabel = getPersonLabel(fromChatId);
  const timestamp = getTimestamp();
  
  try {
    await ctx.telegram.sendLocation(
      toChatId, 
      ctx.message.location.latitude, 
      ctx.message.location.longitude
    );
    await ctx.telegram.sendMessage(toChatId, `📍 موقع من ${senderLabel}\n⏰ ${timestamp}`);
    console.log(`✅ موقع من ${fromChatId} إلى ${toChatId}`);
  } catch (error) {
    console.error(`❌ خطأ في تحويل الموقع:`, error.message);
    ctx.reply("❌ عذراً، حدث خطأ في إرسال الموقع");
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`❌ خطأ في البوت:`, err);
});

// Start bot
bot.launch()
  .then(() => {
    console.log("✅ البوت متصل ويعمل!");
  })
  .catch((err) => {
    console.error("❌ فشل في تشغيل البوت:", err.message);
    process.exit(1);
  });

// Handle process termination
process.once("SIGINT", () => {
  console.log("\n👋 إيقاف البوت...");
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  console.log("\n👋 إيقاف البوت...");
  bot.stop("SIGTERM");
});
