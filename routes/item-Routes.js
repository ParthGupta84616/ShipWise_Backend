const express = require("express");
const router = express.Router();
const { validationResult, body, query } = require('express-validator');
const ItemData = require("../models/ItemSchema.js");
const DailyAdded = require("../models/DailyAddedSchema");
const DailyPacked = require("../models/DailyPackedSchema");

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

      const { productName, quantity, weight, price, brand, dimensions, category, shape, productDetails, unitOfMeasurement, unitOfWeight } = req.body;

      // Find the item by productName
      let item = await ItemData.findOne({ productName: productName.trim() });

      if (item) {
        // Calculate difference in quantity if quantity is being updated
        let quantityDiff = 0;
        if (quantity !== undefined) {
          quantityDiff = Math.abs(Number(quantity) - Number(item.quantity));
          item.quantity = quantity;
        }
        // Update only provided fields
        if (weight !== undefined) item.weight = weight;
        if (price !== undefined) item.price = price;
        if (brand !== undefined) item.brand = brand;
        if (category !== undefined) item.category = category;
        if (shape !== undefined) item.shape = shape;
        if (productDetails !== undefined) item.productDetails = productDetails;
        if (unitOfMeasurement !== undefined) item.unitOfMeasurement = unitOfMeasurement;
        if (unitOfWeight !== undefined) item.unitOfWeight = unitOfWeight;
        if (dimensions && typeof dimensions === 'object') {
          item.dimensions = { ...item.dimensions, ...dimensions };
        }

        item.lastUpdatedBy = req.user._id;
        item.lastUpdated = new Date();

        await item.save();

        // Increment daily added count by abs difference if quantity was updated and only if increased
        if (quantity !== undefined && Number(quantity) > Number(item.quantity)) {
          const quantityDiff = Number(quantity) - Number(item.quantity);
          if (quantityDiff > 0) {
            const todayStr = new Date().toISOString().slice(0, 10);
            const dailyDoc = await DailyAdded.findOne({ user: req.user._id, date: todayStr });
            if (dailyDoc) {
              await DailyAdded.updateOne(
                { user: req.user._id, date: todayStr },
                { $inc: { count: quantityDiff } }
              );
            } else {
              await DailyAdded.create({
                user: req.user._id,
                date: todayStr,
                count: quantityDiff
              });
            }
          }
        }

        return res.status(200).json({ 
          success: true,
          message: "Item updated successfully!", 
          data: item 
        });
      } else {
        // Create a new item
        const newItem = new ItemData({ 
          productName: productName.trim(), 
          quantity: quantity !== undefined ? quantity : 0,
          weight,
          price,
          brand,
          dimensions,
          category,
          shape,
          productDetails,
          unitOfMeasurement,
          unitOfWeight,
          createdBy: req.user._id,
          lastUpdatedBy: req.user._id,
          createdAt: new Date(),
          lastUpdated: new Date()
        });

        await newItem.save();

        // Increment daily added count
        const todayStr = new Date().toISOString().slice(0, 10);
        const addCount = quantity !== undefined ? Math.abs(Number(quantity)) : 0;
        const dailyDoc = await DailyAdded.findOne({ user: req.user._id, date: todayStr });
        if (dailyDoc) {
          await DailyAdded.updateOne(
            { user: req.user._id, date: todayStr },
            { $inc: { count: addCount } }
          );
        } else {
          await DailyAdded.create({
            user: req.user._id,
            date: todayStr,
            count: addCount
          });
        }

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

      // Fetch daily sold (packed) data for last 7 days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);
      const daysArr = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        daysArr.push(date.toISOString().slice(0, 10));
      }
      const dailyPackedDocs = await DailyPacked.find({
        user: req.user._id,
        date: { $in: daysArr }
      }).lean();
      const soldMap = {};
      dailyPackedDocs.forEach(doc => {
        soldMap[doc.date] = doc.count;
      });
      const dailySold = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dateStr = date.toISOString().slice(0, 10);
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
        dailySold.push({
          date: dateStr,
          day: dayName,
          quantity: soldMap[dateStr] || 0
        });
      }

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
          dailyData: dailyData.data,
          dailySold 
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

    // Calculate start and end dates for the last 7 days (including today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);

    // Build array of last 7 days in YYYY-MM-DD format
    const daysArr = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      daysArr.push(date.toISOString().slice(0, 10));
    }

    // Fetch daily added counts for the user for the last 7 days
    const dailyAddedDocs = await DailyAdded.find({
      user: typeof userId === "string" ? require("mongoose").Types.ObjectId(userId) : userId,
      date: { $in: daysArr }
    }).lean();

    // Map date to count
    const countMap = {};
    dailyAddedDocs.forEach(doc => {
      countMap[doc.date] = doc.count;
    });

    // Build result for each of the last 7 days
    const result = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      result.push({
        date: dateStr,
        day: dayName,
        quantity: countMap[dateStr] || 0
      });
    }

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
    const userObjectId = typeof userId === "string" ? require("mongoose").Types.ObjectId(userId) : userId;

    // Calculate start and end dates for the last 7 days (including today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);

    // Build array of last 7 days in YYYY-MM-DD format
    const daysArr = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      daysArr.push(date.toISOString().slice(0, 10));
    }

    // Fetch daily added counts for the user for the last 7 days
    const dailyAddedDocs = await DailyAdded.find({
      user: userObjectId,
      date: { $in: daysArr }
    }).lean();

    // Map date to count
    const dataMap = {};
    dailyAddedDocs.forEach(doc => {
      dataMap[doc.date] = doc.count;
    });

    // Build result for each of the last 7 days
    const result = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      result.push({
        date: dateStr,
        day: dayName,
        quantity: dataMap[dateStr] || 0
      });
    }

    return {
      success: true,
      message: "Daily quantity for last 7 days retrieved successfully",
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

// Example: When an item is sold, increment daily packed count
// (Place this logic wherever your "item sold" operation happens)
/*
const todayStr = new Date().toISOString().slice(0, 10);
await DailyPacked.findOneAndUpdate(
  { user: req.user._id, date: todayStr },
  { $inc: { count: 1 } },
  { upsert: true, new: true }
);
*/

module.exports = router;

