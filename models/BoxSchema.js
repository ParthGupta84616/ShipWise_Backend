const mongoose = require("mongoose");

const BoxSchema = new mongoose.Schema({
  box_name: { type: String, required: true, unique: true },  // Box Name (Ensuring uniqueness)
  length: { type: Number, required: true },  // in inches
  breadth: { type: Number, required: true },  // in inches
  height: { type: Number, required: true },  // in inches
  max_weight: { type: Number, required: true },  // in kg
  quantity: { type: Number, required: true },  // Quantity of boxes
});

// Ensure box_name is unique (Corrected the schema name and index syntax)
BoxSchema.index({ box_name: 1 }, { unique: true });

module.exports = mongoose.model("BoxData", BoxSchema);
