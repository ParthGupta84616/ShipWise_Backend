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
          lastUpdatedBy: req.user._id,
          createdAt: new Date(),
          lastUpdated: new Date()
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
      
      const { category, search, sortBy = 'productName', sortOrder = 'asc', includeDeleted } = req.query;

      // Build filter
      const filter = { createdBy: req.user._id };
      if (category) filter.category = category;
      if (search) {
        filter.$or = [
          { productName: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } },
          { productDetails: { $regex: search, $options: 'i' } }
        ];
      }
      // Only exclude deleted items if not explicitly requested
      if (!includeDeleted || includeDeleted === "false") {
        filter.deletedAt = null;
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

      const dailyData = await getDailyTransaction(req.user._id);

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
          },
          dailyData: dailyData.data
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

// Soft-delete item
router.delete("/deleteitem/:id", authenticateToken, async (req, res) => {
  try {
    const item = await ItemData.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date(), lastUpdated: new Date(), lastUpdatedBy: req.user._id },
      { new: true }
    );
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



router.get("/daily-transaction", authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user._id;
    
    // Get all items created by user with createdAt field
    const counts = await ItemData.aggregate([
      { 
        $match: { 
          createdBy: typeof userId === "string" ? require("mongoose").Types.ObjectId(userId) : userId,
          createdAt: { $exists: true }
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          quantity: { $sum: "$quantity" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Create a map for easy lookup
    const dataMap = {};
    counts.forEach(item => {
      const date = new Date(item._id);
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      dataMap[dayName] = (dataMap[dayName] || 0) + item.quantity;
    });

    // Return data in Monday-Sunday order
    const orderedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const result = orderedDays.map(day => ({
      day: day,
      quantity: dataMap[day] || 0
    }));

    res.status(200).json({
      success: true,
      message: "Daily quantity created for last 7 days retrieved successfully",
      data: result
    });
  } catch (error) {
    console.error("Error fetching last 7 days daily quantity:", error);
    res.status(500).json({ success: false, message: "Failed to fetch last 7 days daily quantity", error: error.message });
  }
});

async function getDailyTransaction(userId) {
  try {
    const userObjectId = typeof userId === "string" ? mongoose.Types.ObjectId(userId) : userId;

    const counts = await ItemData.aggregate([
      {
        $match: {
          createdBy: userObjectId,
          createdAt: { $exists: true }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          quantity: { $sum: "$quantity" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    const dataMap = {};
    counts.forEach(item => {
      const date = new Date(item._id);
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      dataMap[dayName] = (dataMap[dayName] || 0) + item.quantity;
    });

    const orderedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const result = orderedDays.map(day => ({
      day: day,
      quantity: dataMap[day] || 0
    }));

    return {
      success: true,
      message: "Daily quantity created for last 7 days retrieved successfully",
      data: result
    };
  } catch (error) {
    console.error("Error fetching daily quantity:", error);
    return {
      success: false,
      message: "Failed to fetch daily quantity",
      error: error.message
    };
  }
}


module.exports = router;
      
