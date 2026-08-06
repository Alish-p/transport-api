import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';

import TransporterModel from '../entities/transporter/transporter.model.js';

/**
 * Middleware to authenticate transporter portal requests.
 * Verifies JWT with role === 'transporter', loads the Transporter document,
 * and sets req.transporter + req.tenant.
 */
const authenticateTransporter = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized. Please login.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'transporter') {
      return res.status(403).json({ message: 'Access denied. Invalid token type.' });
    }

    if (!decoded.tenant) {
      return res.status(400).json({ message: 'Tenant missing in token.' });
    }

    const transporter = await TransporterModel.findById(decoded.id);

    if (!transporter) {
      return res.status(401).json({ message: 'Transporter not found.' });
    }

    if (!transporter.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact your admin.' });
    }

    const tenantId = typeof decoded.tenant === 'object' ? decoded.tenant._id : decoded.tenant;
    req.transporter = transporter;
    req.tenant = new mongoose.Types.ObjectId(tenantId);
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    console.error('Error in authenticateTransporter middleware:', err);
    return res.status(500).json({ message: 'Internal server error during authentication.' });
  }
});

export { authenticateTransporter };
