const mongoose = require("mongoose");

const productDownPaymentSchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true, trim: true },
  amounts: { type: [Number], default: [] },
});

// Drop obsolete legacy indexes (like productId_1) automatically if present
if (mongoose.connection) {
  const dropLegacyIndexes = async () => {
    try {
      const coll = mongoose.connection.collection("productdownpayments");
      const indexes = await coll.indexes();
      if (indexes.some((i) => i.name === "productId_1")) {
        await coll.dropIndex("productId_1");
        console.log("[ProductDownPayment] Dropped obsolete productId_1 index");
      }
    } catch {
      // Ignore if collection doesn't exist yet
    }
  };

  if (mongoose.connection.readyState === 1) {
    dropLegacyIndexes();
  } else {
    mongoose.connection.on("connected", dropLegacyIndexes);
  }
}

module.exports = mongoose.model("ProductDownPayment", productDownPaymentSchema);
