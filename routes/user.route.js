const express = require('express');
const router = express.Router();

// Import controllers
const { 
    readController, 
    updateController, 
    getProfileController,
    deleteController 
} = require('../controllers/user.controller');

// Import middleware
const { authenticateToken, requireAdmin, requireOwnershipOrAdmin } = require('../middleware/auth.middleware');
const { 
    validateProfileUpdate, 
    validateObjectId, 
    sanitizeInput 
} = require('../middleware/validation.middleware');

// User Routes
router.get('/user/profile', authenticateToken, getProfileController);
router.get('/user/:id', authenticateToken, validateObjectId('id'), requireOwnershipOrAdmin, readController);
router.put('/user/update', authenticateToken, sanitizeInput, validateProfileUpdate, updateController);
router.delete('/user/delete', authenticateToken, deleteController);

// Admin Routes
router.put('/admin/user/:id', authenticateToken, requireAdmin, validateObjectId('id'), sanitizeInput, validateProfileUpdate, updateController);

module.exports = router;