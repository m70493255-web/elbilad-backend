const mongoose = require("mongoose");

const storageOptionSchema = new mongoose.Schema({
  storage: String,
  originalPrice: Number,
  salePrice: Number,
}, { _id: false });

const variantSchema = new mongoose.Schema({
  name: String,
  color: String,
  colorCode: String,
  defaultStorage: String,
  images: [String],
  storageOptions: [storageOptionSchema],
}, { _id: false });

const specItemSchema = new mongoose.Schema({
  key: String,
  value: String,
}, { _id: false });

const specGroupSchema = new mongoose.Schema({
  group: String,
  items: [specItemSchema],
}, { _id: false });

const mediaSchema = new mongoose.Schema({
  type: String,
  url: String,
  alt: String,
  sortOrder: Number,
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  type: String,
  title: String,
  subtitle: String,
  content: { type: mongoose.Schema.Types.Mixed },
  media: [mediaSchema],
  sortOrder: Number,
  isActive: { type: Boolean, default: true },
}, { _id: false });

const galleryItemSchema = new mongoose.Schema({
  url: String,
  caption: String,
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    brief: { type: String },
    originalPrice: { type: Number, required: true },
    salePrice: { type: Number },
    description: { type: String },
    image: { type: String },
    images: [{ type: String }],
    variants: [variantSchema],
    specGroups: [specGroupSchema],
    sections: [sectionSchema],
    gallery: [galleryItemSchema],
    specs: {
      screen: String,
      processor: String,
      ram: String,
      storage: String,
      rearCamera: String,
      frontCamera: String,
      battery: String,
      batteryLife: String,
      charging: String,
      os: String,
      extras: String,
    },
    freeDelivery: { type: Boolean, default: true },
    deliveryTime: { type: String, default: "24 ساعة" },
    warrantyYears: { type: Number, default: 2 },
    installment: {
      available: { type: Boolean, default: false },
      downPayment: Number,
      note: String,
      months: Number,
      conditions: [String],
      policy: String,
    },
    taxIncluded: { type: Boolean, default: true },
    category: { type: String },
    subCategory: { type: String },
    brand: { type: String },
    inStock: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ createdAt: -1 });

productSchema.virtual("discountPercent").get(function () {
  if (this.salePrice != null && this.salePrice !== this.originalPrice) {
    return Math.round(((this.originalPrice - this.salePrice) / this.originalPrice) * 100);
  }
  return 0;
});

productSchema.virtual("price").get(function () {
  return this.salePrice || this.originalPrice;
});

module.exports = mongoose.model("Product", productSchema);
