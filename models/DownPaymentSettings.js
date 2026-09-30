const mongoose = require("mongoose");

const downPaymentSettingsSchema = new mongoose.Schema({
  amounts: { type: [Number], default: [1000, 1500, 2000] },
});

module.exports = mongoose.model("DownPaymentSettings", downPaymentSettingsSchema);
