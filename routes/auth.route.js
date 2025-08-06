const express = require('express');
const router = express.Router();

// Load Controllers
const {
    registerController,
    activationController,
    signinController,
    refreshTokenController,
    forgotPasswordController,
    resetPasswordController,
    signoutController,
    checkVerifiedController,
} = require('../controllers/auth.controller');

// Load Middleware
const { authRateLimit, passwordResetRateLimit } = require('../middleware/auth.middleware');
const { 
    validateRegistration, 
    validateLogin, 
    validateEmail, 
    validateToken, 
    validateRefreshToken,
    validatePasswordReset,
    sanitizeInput 
} = require('../middleware/validation.middleware');

// Authentication Routes
router.post('/register', 
    authRateLimit,
    sanitizeInput,
    validateRegistration, 
    registerController
);

router.post('/login', 
    authRateLimit,
    sanitizeInput,
    validateLogin, 
    signinController
);

// Change activation to GET and take token from URL param
router.get('/activation/:token', activationController);

router.post('/refresh-token', 
    sanitizeInput,
    refreshTokenController
);

router.post('/forgot-password', 
    passwordResetRateLimit,
    sanitizeInput,
    validateEmail, 
    forgotPasswordController
);

router.post('/reset-password', 
    sanitizeInput,
    validatePasswordReset, 
    resetPasswordController
);

router.post('/signout', signoutController);

// Add route to check if user is verified
router.post('/check-verified', sanitizeInput, require('../controllers/auth.controller').checkVerifiedController);

module.exports = router;

