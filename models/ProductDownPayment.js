const mongoose = require("mongoose");

const productDownPaymentSchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true, trim: true },
  amounts: { type: [Number], default: [] },
});

module.exports = mongoose.model("ProductDownPayment", productDownPaymentSchema);
