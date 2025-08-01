const mongoose = require("mongoose");

const ItemDataSchema = new mongoose.Schema({
  productName: { type: String, required: true, unique: true },
  category: { type: String, default: null },
  quantity: { type: Number, default: 0 },
  brand: { type: String, default: null },
  price: { type: Number, default: null },
  weight: { type: Number, default: null },
  shape: { type: String, default: null },
  dimensions: {
    side: { type: Number, default: null },
    length: { type: Number, default: null },
    breadth: { type: Number, default: null },
    height: { type: Number, default: null },
    radius: { type: Number, default: null },
  },
  productDetails: { type: String, default: null },
  unitOfMeasurement: { type: String, default: null },
  unitOfWeight: { type: String, default: null },
});

module.exports = mongoose.model("ItemData", ItemDataSchema);
