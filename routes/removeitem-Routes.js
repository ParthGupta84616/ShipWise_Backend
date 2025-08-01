const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const ItemData = require("../models/ItemSchema");

const { authenticateToken } = require("../middleware/auth.middleware");
const { sanitizeInput } = require("../middleware/validation.middleware");

// Validation middleware for item removal
const validateRemoveItem = [
  body("productName")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Product name must be between 1-100 characters"),

  body("quantity")
    .isInt({ min: 1 })
    .withMessage("Quantity must be a positive integer"),
];

// Enhanced item removal route
router.post(
  "/removeitem",
  authenticateToken,
  sanitizeInput,
  validateRemoveItem,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { productName, quantity } = req.body;
      const quantityToRemove = parseInt(quantity, 10);

      // Find the item
      const item = await ItemData.findOne({
        productName: productName.trim(),
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          message: "Item not found in inventory",
        });
      }

      // Check if sufficient quantity is available
      if (item.quantity < quantityToRemove) {
        return res.status(400).json({
          success: false,
          message: `Insufficient quantity. Available: ${item.quantity}, Requested: ${quantityToRemove}`,
        });
      }

      // Update item quantity
      const previousQuantity = item.quantity;
      item.quantity -= quantityToRemove;
      item.lastUpdatedBy = req.user._id;
      item.lastUpdated = new Date();

      // If quantity becomes zero, optionally delete the item
      if (item.quantity === 0) {
        await ItemData.findByIdAndDelete(item._id);

        return res.status(200).json({
          success: true,
          message: "Item removed completely from inventory",
          data: {
            productName: item.productName,
            previousQuantity,
            quantityRemoved: quantityToRemove,
            finalQuantity: 0,
            itemDeleted: true,
          },
        });
      }

      // Save updated item
      await item.save();

      res.status(200).json({
        success: true,
        message: "Item quantity updated successfully",
        data: {
          productName: item.productName,
          previousQuantity,
          quantityRemoved: quantityToRemove,
          remainingQuantity: item.quantity,
          itemDeleted: false,
        },
      });
    } catch (error) {
      console.error("Error removing item:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while removing item",
      });
    }
  }
);

// Get items with low stock
router.get(
  "/low-stock",
  authenticateToken,
  async (req, res) => {
    try {
      const { threshold = 10 } = req.query;
      const stockThreshold = parseInt(threshold, 10);

      const lowStockItems = await ItemData.find({
        quantity: { $lte: stockThreshold, $gt: 0 },
      })
        .select("productName quantity")
        .sort({ quantity: 1 });

      res.status(200).json({
        success: true,
        message: "Low stock items retrieved successfully",
        data: {
          items: lowStockItems,
          threshold: stockThreshold,
          count: lowStockItems.length,
        },
      });
    } catch (error) {
      console.error("Error fetching low stock items:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching low stock items",
      });
    }
  }
);

module.exports = router;
