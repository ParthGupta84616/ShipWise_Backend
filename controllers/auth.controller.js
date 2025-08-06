const User = require("../models/auth.model");
const { validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { _id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );

  const refreshToken = jwt.sign(
    { _id: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '14d' }
  );

  return { accessToken, refreshToken };
};

// Register controller
exports.registerController = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email or phone'
      });
    }

    // Generate activation token
    const activationToken = crypto.randomBytes(32).toString('hex');
    const activationTokenExpiry = new Date(Date.now() + 60 * 60 * 1000 * 24 * 30); // 30 days

    // Create user - SET isActive to false during registration
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      phone,
      activationToken,
      activationTokenExpiry,
      isActive: false,  // Set to false during registration
      emailVerified: false
    });

    await newUser.save();

    // Send activation email
    if (process.env.NODE_ENV !== 'test') {
      await sendActivationEmail(email, activationToken, name);
    }

    res.status(201).json({
      success: true,
      message: `Registration successful. Activation email sent to ${email}`,
      data: {
        email,
        activationRequired: true
      }
    });
  } catch (error) {
    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email or phone'
      });
    }
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during registration"
    });
  }
};

// Account activation
exports.activationController = async (req, res) => {
  try {
    // Get token from URL params
    const token = req.params.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Activation token is required"
      });
    }

    const user = await User.findOne({
      activationToken: token,
      activationTokenExpiry: { $gt: new Date() },
      emailVerified: false
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired activation token"
      });
    }

    // Activate user - SET BOTH emailVerified AND isActive to true
    user.emailVerified = true;
    user.isActive = true;  // IMPORTANT: Activate the user account
    user.activationToken = undefined;
    user.activationTokenExpiry = undefined;
    await user.save();

    // For mobile: just return success, no JWT
    res.status(200).json({
      success: true,
      message: "Account activated successfully. You can now log in from the app."
    });

  } catch (error) {
    console.error("Activation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during activation"
    });
  }
};

// Sign in controller
exports.signinController = async (req, res) => {
  try {
    const errors = validationResult(req);
    console.log(errors);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, deviceInfo } = req.body;

    // Find user - check both emailVerified AND isActive
    const user = await User.findOne({
      email: email.toLowerCase()
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Account not activated. Please verify your email before logging in."
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact support."
      });
    }

    if (!user.authenticate(password)) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Update last login and device info
    user.lastLogin = new Date();
    if (deviceInfo) {
      user.deviceInfo = deviceInfo;
    }
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    res.status(200).json({
      success: true,
      message: "Sign in successful",
      data: {
        accessToken,
        refreshToken,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          lastLogin: user.lastLogin,
          company : user.company,
          address : user.address,
        }
      }
    });

  } catch (error) {
    console.error("Sign in error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during sign in"
    });
  }
};

// Refresh token controller - FIXED
exports.refreshTokenController = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is required"
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.message);
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token"
      });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: "Invalid token type"
      });
    }

    const user = await User.findById(decoded._id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User account is inactive"
      });
    }

    if (!user.emailVerified) {
      return res.status(401).json({
        success: false,
        message: "User email not verified"
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user._id);

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: tokens
    });

  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token"
    });
  }
};

// Forgot password controller
exports.forgotPasswordController = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();

    // Send reset email
    if (process.env.NODE_ENV !== 'test') {
      await sendPasswordResetEmail(email, resetToken, user.name);
    }

    res.status(200).json({
      success: true,
      message: "Password reset link sent to your email"
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Reset password controller
exports.resetPasswordController = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token"
      });
    }

    // Update password
    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful"
    });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Sign out controller
exports.signoutController = async (req, res) => {
  try {
    // In a production app, you might want to blacklist the token
    res.status(200).json({
      success: true,
      message: "Signed out successfully"
    });
  } catch (error) {
    console.error("Sign out error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Helper function to send activation email
const sendActivationEmail = async (email, token, name) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const emailData = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Activate Your ShipWise Account',
    html: `
      <h2>Welcome to ShipWise, ${name}!</h2>
      <p>Please activate your account by clicking the link below:</p>
      <p><a href="${process.env.CLIENT_URL}/api/activation/${token}">Activate Account</a></p>
      <p>This link will expire in 30 minutes.</p>
      <p>If you didn't create this account, please ignore this email.</p>
    `,
  };

  await transporter.sendMail(emailData);
};

// Helper function to send password reset email
const sendPasswordResetEmail = async (email, token, name) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const emailData = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Password Reset - ShipWise',
    html: `
      <h2>Password Reset Request</h2>
      <p>Hello ${name},</p>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <p><a href="${process.env.CLIENT_URL}/auth/reset-password/${token}">Reset Password</a></p>
      <p>This link will expire in 15 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  };

  await transporter.sendMail(emailData);
};

// Check if user is verified (activated) by email
exports.checkVerifiedController = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    res.status(200).json({
      success: true,
      verified: !!user.emailVerified,
      message: user.emailVerified ? "User is verified" : "User is not verified"
    });
  } catch (error) {
    console.error("Check verified error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};