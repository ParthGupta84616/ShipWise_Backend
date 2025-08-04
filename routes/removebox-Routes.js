const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');
const BoxData = require("../models/BoxSchema");
const ItemData = require("../models/ItemSchema");
const DailyPacked = require("../models/DailyPackedSchema");

const { authenticateToken } = require('../middleware/auth.middleware');
const { sanitizeInput } = require('../middleware/validation.middleware');

// Validation middleware for box removal
const validateRemoveBox = [
  body('boxName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Box name must be between 1-100 characters'),
    
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer')
];

// Enhanced box removal route
router.post("/removebox", 
  authenticateToken,
  sanitizeInput,
  validateRemoveBox,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { boxName, quantity } = req.body;
      const quantityToRemove = parseInt(quantity, 10);

      // Find the box by its name
      const box = await BoxData.findOne({ 
        box_name: boxName.trim() 
      });

      if (!box) {
        return res.status(404).json({ 
          success: false,
          message: "Box not found in inventory" 
        });
      }

      // Check if sufficient quantity is available
      if (quantityToRemove > box.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient quantity. Available: ${box.quantity}, Requested: ${quantityToRemove}`
        });
      }

      const previousQuantity = box.quantity;
      box.quantity -= quantityToRemove;

      // If quantity becomes zero, delete the box
      if (box.quantity === 0) {
        await BoxData.findByIdAndDelete(box._id);
        
        return res.status(200).json({ 
          success: true,
          message: "Box removed completely from inventory",
          data: {
            boxName: box.box_name,
            previousQuantity,
            quantityRemoved: quantityToRemove,
            finalQuantity: 0,
            boxDeleted: true
          }
        });
      }

      // Save updated box data
      await box.save();
      
      res.status(200).json({ 
        success: true,
        message: "Box quantity updated successfully",
        data: {
          boxName: box.box_name,
          previousQuantity,
          quantityRemoved: quantityToRemove,
          remainingQuantity: box.quantity,
          boxDeleted: false
        }
      });

    } catch (error) {
      console.error("Error removing box:", error);
      res.status(500).json({ 
        success: false,
        message: "Internal server error while removing box" 
      });
    }
  }
);

/**
 * Remove boxes and items together.
 * POST /removeboxitem
 * Body: { boxId, itemId, boxQuantity, itemQuantity }
 * - Decrements box and item quantities.
 * - If any becomes 0, sets deletedAt to now and removes from collection.
 */
router.post("/removeboxitem",
  authenticateToken,
  sanitizeInput,
  async (req, res) => {
    try {
      const { boxId, itemId, boxQuantity, itemQuantity } = req.body;

      if (!boxId || !itemId || !boxQuantity || !itemQuantity) {
        return res.status(400).json({
          success: false,
          message: "boxId, itemId, boxQuantity, and itemQuantity are required"
        });
      }

      // Find box and item
      const box = await BoxData.findById(boxId);
      const item = await ItemData.findById(itemId);

      if (!box) {
        return res.status(404).json({ success: false, message: "Box not found" });
      }
      if (!item) {
        return res.status(404).json({ success: false, message: "Item not found" });
      }

      // Check if enough quantity exists
      if (box.quantity < Number(boxQuantity)) {
        return res.status(400).json({ success: false, message: "Insufficient box quantity" });
      }
      if (item.quantity < Number(itemQuantity)) {
        return res.status(400).json({ success: false, message: "Insufficient item quantity" });
      }

      // Decrement quantities
      box.quantity -= Number(boxQuantity);
      item.quantity -= Number(itemQuantity);

      const now = new Date();
      let boxDeleted = false, itemDeleted = false;

      // If box quantity is 0, set deletedAt and remove
      if (box.quantity === 0) {
        box.deletedAt = now;
        await BoxData.findByIdAndDelete(box._id);
        boxDeleted = true;
      } else {
        await box.save();
      }

      // If item quantity is 0, set deletedAt and remove
      if (item.quantity === 0) {
        item.deletedAt = now;
        await ItemData.findByIdAndDelete(item._id);
        itemDeleted = true;
      } else {
        await item.save();
      }

      // --- INTEGRATE DailyPacked increment here ---
      const todayStr = new Date().toISOString().slice(0, 10);
      const packedDoc = await DailyPacked.findOne({ user: req.user._id, date: todayStr });
      const packedCount = Number(itemQuantity);
      if (packedDoc) {
        await DailyPacked.updateOne(
          { user: req.user._id, date: todayStr },
          { $inc: { count: packedCount } }
        );
      } else {
        await DailyPacked.create({
          user: req.user._id,
          date: todayStr,
          count: packedCount
        });
      }
      // --- END DailyPacked increment ---

      return res.status(200).json({
        success: true,
        message: "Box and item quantities updated successfully",
        data: {
          boxId,
          itemId,
          boxDeleted,
          itemDeleted,
          boxRemaining: boxDeleted ? 0 : box.quantity,
          itemRemaining: itemDeleted ? 0 : item.quantity
        }
      });
    } catch (error) {
      console.error("Error removing box and item:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while removing box and item"
      });
    }
  }
);

// Get all boxes with enhanced response
router.get("/getboxes", 
  authenticateToken,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, sortBy = 'box_name', sortOrder = 'asc' } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [boxes, total] = await Promise.all([
        BoxData.find()
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        BoxData.countDocuments()
      ]);

      // Calculate total volume and capacity
      const totalVolume = boxes.reduce((sum, box) => 
        sum + (box.length * box.breadth * box.height * box.quantity), 0
      );

      const totalCapacity = boxes.reduce((sum, box) => 
        sum + (box.max_weight * box.quantity), 0
      );

      res.status(200).json({
        success: true,
        message: "Boxes retrieved successfully",
        data: {
          boxes,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalBoxes: total,
            boxesPerPage: parseInt(limit)
          },
          summary: {
            totalVolume: Math.round(totalVolume * 100) / 100,
            totalCapacity: Math.round(totalCapacity * 100) / 100,
            uniqueBoxTypes: total
          }
        }
      });

    } catch (error) {
      console.error("Error fetching boxes:", error);
      res.status(500).json({ 
        success: false,
        message: "Error fetching boxes" 
      });
    }
  }
);

// Get box statistics
router.get("/box-statistics", 
  authenticateToken,
  async (req, res) => {
    try {
      const stats = await BoxData.aggregate([
        {
          $group: {
            _id: null,
            totalBoxes: { $sum: "$quantity" },
            averageVolume: { 
              $avg: { $multiply: ["$length", "$breadth", "$height"] } 
            },
            averageWeight: { $avg: "$max_weight" },
            minWeight: { $min: "$max_weight" },
            maxWeight: { $max: "$max_weight" }
          }
        }
      ]);

      const result = stats[0] || {
        totalBoxes: 0,
        averageVolume: 0,
        averageWeight: 0,
        minWeight: 0,
        maxWeight: 0
      };

      res.status(200).json({
        success: true,
        message: "Box statistics retrieved successfully",
        data: {
          ...result,
          averageVolume: Math.round(result.averageVolume * 100) / 100,
          averageWeight: Math.round(result.averageWeight * 100) / 100
        }
      });

    } catch (error) {
      console.error("Error fetching box statistics:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching box statistics"
      });
    }
  }
);

module.exports = router;
