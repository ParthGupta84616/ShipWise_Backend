const express = require("express");
const router = express.Router();
const { validationResult, body, query } = require('express-validator');
const ItemData = require("../models/ItemSchema.js");

const { authenticateToken } = require('../middleware/auth.middleware');
const { sanitizeInput, validatePagination } = require('../middleware/validation.middleware');

// Validation for item data
const validateItemData = [
  body('productName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Product name must be between 1-100 characters'),
    
  body('quantity')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Quantity must be a non-negative integer'),
    
  body('weight')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Weight must be a non-negative number'),
    
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a non-negative number'),
    
  body('dimensions.length')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Length must be a non-negative number'),
    
  body('dimensions.breadth')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Breadth must be a non-negative number'),
    
  body('dimensions.height')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Height must be a non-negative number')
];

// Add or Update Item
router.post("/senditemdata", 
  authenticateToken,
  sanitizeInput,
  validateItemData,
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

      const { productName, quantity = 0, ...otherFields } = req.body;

      // Check if the item exists
      let item = await ItemData.findOne({ productName: productName.trim() });

      if (item) {
        // Update quantity and other fields
        const quantityToAdd = parseInt(quantity, 10) || 0;
        item.quantity = (item.quantity || 0) + quantityToAdd;
        
        // Update other non-null fields
        Object.keys(otherFields).forEach((key) => {
          if (otherFields[key] !== null && otherFields[key] !== undefined && otherFields[key] !== '') {
            if (key === 'dimensions' && typeof otherFields[key] === 'object') {
              item.dimensions = { ...item.dimensions, ...otherFields[key] };
            } else {
              item[key] = otherFields[key];
            }
          }
        });
        
        // Add user info for tracking
        item.lastUpdatedBy = req.user._id;
        item.lastUpdated = new Date();
        
        await item.save();
        
        return res.status(200).json({ 
          success: true,
          message: "Item updated successfully!", 
          data: item 
        });
      } else {
        // Create a new item
        const newItem = new ItemData({ 
          productName: productName.trim(), 
          quantity: parseInt(quantity, 10) || 0, 
          ...otherFields,
          createdBy: req.user._id,
          lastUpdatedBy: req.user._id
        });
        
        await newItem.save();
        
        return res.status(201).json({ 
          success: true,
          message: "Item added successfully!", 
          data: newItem 
        });
      }
    } catch (error) {
      console.error("Error in senditemdata:", error);
      
      if (error.code === 11000) {
        return res.status(409).json({ 
          success: false,
          message: "Item with this name already exists" 
        });
      }
      
      return res.status(500).json({ 
        success: false,
        message: "Failed to save or update item" 
      });
    }
  }
);

// Fetch All Items with pagination and filtering
router.get("/getitemdata", 
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
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const { category, search, sortBy = 'productName', sortOrder = 'asc' } = req.query;

      // Build filter
      const filter = {};
      if (category) filter.category = category;
      if (search) {
        filter.$or = [
          { productName: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } },
          { productDetails: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [items, total] = await Promise.all([
        ItemData.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        ItemData.countDocuments(filter)
      ]);

      return res.status(200).json({
        success: true,
        message: "Items retrieved successfully",
        data: {
          items,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
          }
        }
      });
    } catch (error) {
      console.error("Error fetching items:", error);
      return res.status(500).json({ 
        success: false,
        message: "Failed to fetch items" 
      });
    }
  }
);

// Get item by ID
router.get("/getitem/:id", authenticateToken, async (req, res) => {
  try {
    const item = await ItemData.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch item"
    });
  }
});

// Delete item
router.delete("/deleteitem/:id", authenticateToken, async (req, res) => {
  try {
    const item = await ItemData.findByIdAndDelete(req.params.id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Item deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete item"
    });
  }
});

module.exports = router;
