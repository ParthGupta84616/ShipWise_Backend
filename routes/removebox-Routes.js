const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');
const BoxData = require("../models/BoxSchema");

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
