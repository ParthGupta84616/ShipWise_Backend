const express = require("express");
const router = express.Router();
const { body, validationResult } = require('express-validator');
const BoxData = require("../models/BoxSchema");

const { authenticateToken } = require('../middleware/auth.middleware');
const { sanitizeInput, validatePagination } = require('../middleware/validation.middleware');

// Enhanced validation for box data
const validateBoxData = [
  body('box_name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Box name must be between 1-100 characters')
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('Box name can only contain letters, numbers, spaces, hyphens, and underscores'),
    
  body('length')
    .isFloat({ min: 0.1 })
    .withMessage('Length must be greater than 0.1'),
    
  body('breadth')
    .isFloat({ min: 0.1 })
    .withMessage('Breadth must be greater than 0.1'),
    
  body('height')
    .isFloat({ min: 0.1 })
    .withMessage('Height must be greater than 0.1'),
    
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
    
  body('max_weight')
    .isFloat({ min: 0.1 })
    .withMessage('Max weight must be greater than 0.1')
];

const validateUpdateQuantity = [
  body('box_name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Box name is required'),
    
  body('additionalQuantity')
    .isInt({ min: 1 })
    .withMessage('Additional quantity must be a positive integer')
];

// Enhanced add box route
router.post("/addbox", 
  authenticateToken,
  sanitizeInput,
  // validateBoxData,
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

      const { box_name, length, breadth, height, quantity, max_weight } = req.body;

      // Check if box already exists
      const existingBox = await BoxData.findOne({ 
        box_name: box_name,
      });
      
      if (existingBox) {
        return res.status(409).json({ 
          success: false,
          message: "Box with this name already exists. Use update quantity instead." 
        });
      }

      // Calculate volume for reference
      const volume = length * breadth * height;

      // Create new box entry
      const newBox = new BoxData({
        box_name: box_name,
        length: parseFloat(length),
        breadth: parseFloat(breadth),
        height: parseFloat(height),
        quantity: parseInt(quantity),
        max_weight: parseFloat(max_weight),
        createdBy: req.user._id,
        createdAt: new Date(),
        lastUpdated: new Date(),
        lastUpdatedBy: req.user._id
      });

      await newBox.save();
      
      res.status(201).json({ 
        success: true,
        message: "Box added successfully!",
        data: {
          ...newBox.toObject(),
          volume: Math.round(volume * 100) / 100
        }
      });

    } catch (error) {
      console.error("Error adding box:", error);
      
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "Box with this name already exists"
        });
      }
      
      res.status(500).json({ 
        success: false,
        message: "Failed to add box" 
      });
    }
  }
);

// Enhanced update box quantity route
router.post("/updateboxquantity", 
  authenticateToken,
  sanitizeInput,
  validateUpdateQuantity,
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

      const { box_name, additionalQuantity } = req.body;
      const quantityToAdd = parseInt(additionalQuantity, 10);

      // Find the box by name
      const box = await BoxData.findOne({ 
        box_name: box_name,
      });
      
      if (!box) {
        return res.status(404).json({ 
          success: false,
          message: "Box not found" 
        });
      }

      const previousQuantity = box.quantity;
      box.quantity += quantityToAdd;
      box.lastUpdated = new Date();
      box.lastUpdatedBy = req.user._id;
      
      await box.save();

      res.status(200).json({ 
        success: true,
        message: "Box quantity updated successfully!",
        data: {
          box_name: box.box_name,
          previousQuantity,
          quantityAdded: quantityToAdd,
          newQuantity: box.quantity
        }
      });

    } catch (error) {
      console.error("Error updating box quantity:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to update box quantity" 
      });
    }
  }
);

// Enhanced get all boxes route
router.get("/getboxes", 
  authenticateToken,
  validatePagination,
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

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      
      const { 
        search, 
        sortBy = 'box_name', 
        sortOrder = 'asc',
        minWeight,
        maxWeight,
        minVolume,
        maxVolume
      } = req.query;

      // Build filter
      const filter = {};
      filter.createdBy = req.user._id; // Only fetch boxes created by this user

      if (search) {
        filter.box_name = { $regex: search, $options: 'i' };
      }
      
      if (minWeight || maxWeight) {
        filter.max_weight = {};
        if (minWeight) filter.max_weight.$gte = parseFloat(minWeight);
        if (maxWeight) filter.max_weight.$lte = parseFloat(maxWeight);
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      let query = BoxData.find(filter).sort(sort).skip(skip).limit(limit);
      
      const [boxes, total] = await Promise.all([
        query.lean(),
        BoxData.countDocuments(filter)
      ]);

      // Calculate volume for each box and apply volume filter if needed
      let processedBoxes = boxes.map(box => ({
        ...box,
        volume: Math.round(box.length * box.breadth * box.height * 100) / 100,
        capacity_efficiency: Math.round((box.max_weight / (box.length * box.breadth * box.height)) * 100) / 100
      }));

      // Apply volume filter if specified
      if (minVolume || maxVolume) {
        processedBoxes = processedBoxes.filter(box => {
          if (minVolume && box.volume < parseFloat(minVolume)) return false;
          if (maxVolume && box.volume > parseFloat(maxVolume)) return false;
          return true;
        });
      }

      res.status(200).json({
        success: true,
        message: "Boxes retrieved successfully",
        data: {
          boxes: processedBoxes,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalBoxes: total,
            boxesPerPage: limit,
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
          },
          filters: {
            search,
            weightRange: minWeight || maxWeight ? { minWeight, maxWeight } : null,
            volumeRange: minVolume || maxVolume ? { minVolume, maxVolume } : null
          }
        }
      });

    } catch (error) {
      console.error("Error fetching boxes:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch boxes" 
      });
    }
  }
);

// Get box by ID
router.get("/getbox/:id", 
  authenticateToken,
  async (req, res) => {
    try {
      const box = await BoxData.findById(req.params.id).lean();
      
      if (!box) {
        return res.status(404).json({
          success: false,
          message: "Box not found"
        });
      }

      const boxWithDetails = {
        ...box,
        volume: Math.round(box.length * box.breadth * box.height * 100) / 100,
        capacity_efficiency: Math.round((box.max_weight / (box.length * box.breadth * box.height)) * 100) / 100
      };

      res.status(200).json({
        success: true,
        data: boxWithDetails
      });

    } catch (error) {
      console.error("Error fetching box:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching box"
      });
    }
  }
);

// Delete box
router.delete("/deletebox/:id", 
  authenticateToken,
  async (req, res) => {
    try {
      const box = await BoxData.findByIdAndDelete(req.params.id);
      
      if (!box) {
        return res.status(404).json({
          success: false,
          message: "Box not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Box deleted successfully"
      });

    } catch (error) {
      console.error("Error deleting box:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting box"
      });
    }
  }
);

module.exports = router;
