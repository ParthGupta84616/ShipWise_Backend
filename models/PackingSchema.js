const mongoose = require("mongoose");

const PackingSchema = new mongoose.Schema({
  productName: { type: String, required: false },
  shape: { type: String, required: false },
  weight: { type: Number, required: false },
  quantity: { type: Number, default: 1 },
  price: { type: Number, required: false },
  length: { type: Number, required: false },
  breadth: { type: Number, required: false },
  height: { type: Number, required: false },
  cartons: [
    {
      cartonIndex: { type: Number, required: false },
      length: { type: Number, required: false },
      breadth: { type: Number, required: false },
      height: { type: Number, required: false },
      maxWeight: { type: Number, required: false },
      quantityAvailable: { type: Number, required: false },
    },
  ],
  results: {
    packingResults: [
      {
        cartonIndex: { type: Number, required: false },
        cartonsUsed: { type: Number, required: false },
        fitBreadthwise: { type: Boolean, required: false },
        fitHeightwise: { type: Boolean, required: false },
        fitLengthwise: { type: Boolean, required: false },
        orientation: { type: String, required: false },
        totalItemsPacked: { type: Number, required: false },
      },
    ],
    remainingQuantity: { type: Number, required: false },
    success: { type: Boolean, required: false },
  },
});

module.exports = mongoose.model("Packing", PackingSchema);
