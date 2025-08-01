const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth.middleware');
const { sanitizeInput } = require('../middleware/validation.middleware');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/images');
    // Create directory if it doesn't exist
    require('fs').mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `item-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  }
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to convert image to base64
async function fileToGenerativePart(filePath, mimeType) {
  const imageBuffer = await fs.readFile(filePath);
  return {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType
    }
  };
}

// Helper function to clean up uploaded files
async function cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Error cleaning up file:', error);
  }
}

// Predict item dimensions from image
router.post('/predict-dimensions', 
  authenticateToken,
  upload.single('image'),
  sanitizeInput,
  async (req, res) => {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Image file is required'
        });
      }

      filePath = req.file.path;
      const { referenceObject, unit = 'cm', additionalContext } = req.body;

      // Validate inputs
      if (referenceObject && typeof referenceObject !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Reference object must be a string'
        });
      }

      const allowedUnits = ['cm', 'inch', 'mm'];
      if (!allowedUnits.includes(unit)) {
        return res.status(400).json({
          success: false,
          message: 'Unit must be one of: cm, inch, mm'
        });
      }

      // Prepare the image for Gemini
      const imagePart = await fileToGenerativePart(filePath, req.file.mimetype);

      // Create detailed prompt for dimension prediction
      const prompt = `Analyze this image and predict the dimensions of the main object/item. 

Requirements:
1. Identify the main object in the image
2. Estimate its length, width/breadth, and height in ${unit}
3. Consider any reference objects if visible${referenceObject ? ` (Reference: ${referenceObject})` : ''}
4. Provide confidence level for your estimates
5. Identify the shape category (cube, cuboid, cylinder, sphere, irregular)
6. Estimate weight if possible based on material appearance

${additionalContext ? `Additional context: ${additionalContext}` : ''}

Return response in this exact JSON format:
{
  "object_name": "identified object name",
  "shape": "cube|cuboid|cylinder|sphere|irregular",
  "dimensions": {
    "length": number,
    "width": number,
    "height": number,
    "unit": "${unit}"
  },
  "estimated_weight": {
    "value": number,
    "unit": "kg",
    "confidence": "low|medium|high"
  },
  "material": "estimated material type",
  "confidence_level": "low|medium|high",
  "notes": "any additional observations",
  "reference_used": "description of reference objects used for scale"
}

Be as accurate as possible with measurements. If uncertain, indicate lower confidence.`;

      // Get Gemini model
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Generate response
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();

      // Parse JSON from response
      let parsedResult;
      try {
        // Extract JSON from response (in case there's extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Error parsing Gemini response:', parseError);
        return res.status(500).json({
          success: false,
          message: 'Failed to parse AI response',
          rawResponse: text.substring(0, 500) // First 500 chars for debugging
        });
      }

      // Validate parsed result structure
      if (!parsedResult.dimensions || !parsedResult.object_name) {
        return res.status(500).json({
          success: false,
          message: 'Invalid response format from AI',
          rawResponse: text.substring(0, 500)
        });
      }

      // Clean up uploaded file
      await cleanupFile(filePath);

      // Log successful prediction for analytics
      console.log(`Dimension prediction by user ${req.user._id}: ${parsedResult.object_name}`);

      res.status(200).json({
        success: true,
        message: 'Dimension prediction completed successfully',
        data: {
          prediction: parsedResult,
          processing_info: {
            image_processed: true,
            file_size: req.file.size,
            processing_time: new Date().toISOString(),
            user_id: req.user._id
          }
        }
      });

    } catch (error) {
      console.error('Error in dimension prediction:', error);
      
      // Clean up file in case of error
      if (filePath) {
        await cleanupFile(filePath);
      }

      if (error.message.includes('API key')) {
        return res.status(500).json({
          success: false,
          message: 'AI service configuration error'
        });
      }

      if (error.message.includes('quota') || error.message.includes('limit')) {
        return res.status(429).json({
          success: false,
          message: 'AI service temporarily unavailable. Please try again later.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error processing image for dimension prediction',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get prediction history for user
router.get('/prediction-history',
  authenticateToken,
  async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      // In a real app, you'd store predictions in database
      // For now, return mock data structure
      res.status(200).json({
        success: true,
        message: 'Prediction history retrieved',
        data: {
          predictions: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalPredictions: 0
          }
        }
      });
    } catch (error) {
      console.error('Error fetching prediction history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching prediction history'
      });
    }
  }
);

module.exports = router;
