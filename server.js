const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config({ path: "./config/config.env" }); // Load environment variables

const app = express();

// Set trust proxy for correct client IP detection (important for Vercel/Proxies)
app.set('trust proxy', 1);

// Connect to the database
connectDB();

// Security middleware
app.use(helmet()); // Set various HTTP headers for security
app.use(compression()); // Compress responses

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
});
app.use(limiter);

// Body parsing middleware with size limits
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// CORS configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Route Imports
const authRouter = require("./routes/auth.route");
const userRouter = require("./routes/user.route");
const itemRouter = require("./routes/item-Routes");
const boxRouter = require("./routes/box-Routes");
const removeItemRouter = require("./routes/removeitem-Routes");
const removeBoxRouter = require("./routes/removebox-Routes");
const optimalPackingRouter = require("./routes/optimalpacking-Routes");
const packingRoutes = require("./routes/packing-route");
const shippingRoutes = require("./routes/shipping-Routes");
const geminiRoutes = require("./routes/gemini-Routes");

// Mount Routes with error handling
const routes = [
  { path: "/api", router: authRouter },
  { path: "/api", router: userRouter },
  { path: "/api", router: itemRouter },
  { path: "/api", router: boxRouter },
  { path: "/api", router: removeItemRouter },
  { path: "/api", router: removeBoxRouter },
  { path: "/api", router: optimalPackingRouter },
  { path: "/api", router: packingRoutes },
  { path: "/api", router: shippingRoutes },
  { path: "/api/ai", router: geminiRoutes },
];

routes.forEach(({ path, router }) => {
  app.use(path, router);
});

// Add error handler for invalid JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    // Handle invalid JSON
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body"
    });
  }
  next(err);
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);

  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Handle 404 Errors
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      "GET /health",
      "POST /api/optimal-packing2",
      "POST /api/calculate-shipping",
      "POST /api/ai/predict-dimensions",
      "GET /api/carton-sizes",
    ],
  });
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

// Start the Server only if not running in Vercel (i.e., not imported as a module)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  const os = require("os");
  // Get local network IPv4 addresses
  function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    const ips = getLocalIPs();
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    if (ips.length) {
      ips.forEach(ip =>
        console.log(`📊 Health check available at: http://${ip}:${PORT}/health`)
      );
    } else {
      console.log(`📊 Health check available at: http://localhost:${PORT}/health`);
    }
  });

  // Handle server errors
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      console.error("Server error:", error);
    }
  });
}

// For Vercel: export the app as the default export
module.exports = app;
