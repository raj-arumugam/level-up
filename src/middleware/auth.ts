import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

/**
 * JWT Authentication middleware
 * Verifies the JWT token and attaches user to request object
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const parts = authHeader?.trim().split(/\s+/); // Split on any whitespace
    const token = parts && parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      });
      return;
    }

    // Verify token and get user
    const user = await authService.verifyToken(token);
    req.user = user;
    
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require authentication
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const parts = authHeader?.trim().split(/\s+/); // Split on any whitespace
    const token = parts && parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;

    if (token) {
      const user = await authService.verifyToken(token);
      req.user = user;
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};