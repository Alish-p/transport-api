/* eslint-disable no-unused-vars */
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import connectDB from "./config/db.js";
import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/ErrorHandler.js";

dotenv.config();

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const app = express();
const port = process.env.PORT || 5001;

// -----------------------------------------------------------------------------
// Security & Core Middleware
// -----------------------------------------------------------------------------
app.use(helmet());

const corsOptions = {
  origin: ["https://transport-rewrite.onrender.com", "http://localhost:3031"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));

app.set("query parser", "extended");
// app.use(compression());
app.use(express.json());

// -----------------------------------------------------------------------------
// Database
// -----------------------------------------------------------------------------
connectDB();

// -----------------------------------------------------------------------------
// Rate Limiting
// -----------------------------------------------------------------------------
const limiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 200, // 200 requests per window
  message: "Too many requests from this device, please try again later.",
  headers: true,
});
app.use(limiter);

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
app.use("/api", routes);

// 404 for unknown API routes (keeps error shape consistent)
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "Route not found" });
  }
  next();
});

// -----------------------------------------------------------------------------
// Error Handling
// -----------------------------------------------------------------------------
app.use(errorHandler);

// -----------------------------------------------------------------------------
// Start Server
// -----------------------------------------------------------------------------
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
