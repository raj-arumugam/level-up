import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query, param } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Enhanced rate limiting configurations
 */
export const createRateLimiter = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests from rate limiting
    skipSuccessfulRequests: false,
    // Skip failed requests from rate limiting
    skipFailedRequests: false,
    // Custom key generator to include user ID for authenticated requests
    keyGenerator: (req: Request) => {
      return req.user?.id || req.ip;
    }
  });
};

/**
 * Rate limiters for different endpoint types
 */
export const rateLimiters = {
  // General API rate limiting
  general: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests per window
    'Too many requests from this IP, please try again later.'
  ),
  
  // Authentication endpoints (more restrictive)
  auth: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    50, // 50 attempts per window (increased for development)
    'Too many authentication attempts, please try again later.'
  ),
  
  // Portfolio operations (moderate)
  portfolio: createRateLimiter(
    5 * 60 * 1000, // 5 minutes
    30, // 30 requests per window
    'Too many portfolio operations, please slow down.'
  ),
  
  // Market data requests (more restrictive due to external API limits)
  marketData: createRateLimiter(
    1 * 60 * 1000, // 1 minute
    10, // 10 requests per window
    'Too many market data requests, please wait before trying again.'
  )
};

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  
  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

/**
 * Recursively sanitize object properties
 */
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    // Remove potentially dangerous characters and HTML
    return DOMPurify.sanitize(obj.trim(), { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both key and value
      const sanitizedKey = DOMPurify.sanitize(key, { 
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      });
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
};

/**
 * Enhanced validation rules for stock symbols
 */
export const validateStockSymbol = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Stock symbol must be between 1 and 10 characters')
    .matches(/^[A-Za-z0-9.-]+$/)
    .withMessage('Stock symbol can only contain letters, numbers, dots, and hyphens')
    .customSanitizer((value: string) => {
      return value.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
    })
];

/**
 * Enhanced validation rules for financial amounts
 */
export const validateFinancialAmount = (fieldName: string, min: number = 0.01, max: number = 1000000) => [
  body(fieldName)
    .isFloat({ min, max })
    .withMessage(`${fieldName} must be between $${min} and $${max.toLocaleString()}`)
    .customSanitizer((value: any) => {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.round(num * 100) / 100; // Round to 2 decimal places
    })
];

/**
 * Enhanced validation rules for quantities
 */
export const validateQuantity = [
  body('quantity')
    .isFloat({ min: 0.001, max: 1000000 })
    .withMessage('Quantity must be between 0.001 and 1,000,000')
    .customSanitizer((value: any) => {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.round(num * 1000) / 1000; // Round to 3 decimal places
    })
];

/**
 * Enhanced validation rules for dates
 */
export const validateDate = (fieldName: string, allowFuture: boolean = false) => [
  body(fieldName)
    .isISO8601()
    .withMessage(`${fieldName} must be a valid date`)
    .custom((value: string) => {
      const date = new Date(value);
      const now = new Date();
      
      if (!allowFuture && date > now) {
        throw new Error(`${fieldName} cannot be in the future`);
      }
      
      // Check if date is not too far in the past (e.g., before 1900)
      const minDate = new Date('1900-01-01');
      if (date < minDate) {
        throw new Error(`${fieldName} cannot be before 1900`);
      }
      
      return true;
    })
];

/**
 * Enhanced validation for user registration
 */
export const enhancedValidateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 }) // RFC 5321 limit
    .withMessage('Please provide a valid email address')
    .custom(async (value: string) => {
      // Check for disposable email domains (basic list)
      const disposableDomains = [
        '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
        'mailinator.com', 'throwaway.email'
      ];
      const domain = value.split('@')[1]?.toLowerCase();
      if (disposableDomains.includes(domain)) {
        throw new Error('Disposable email addresses are not allowed');
      }
      return true;
    }),
  
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
  
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
  
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes')
];

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https:; " +
    "connect-src 'self' https://api.example.com; " +
    "frame-ancestors 'none';"
  );
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

/**
 * Request size limiting middleware
 */
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.get('content-length') || '0');
  const maxSize = 1024 * 1024; // 1MB limit
  
  if (contentLength > maxSize) {
    res.status(413).json({
      success: false,
      error: 'Request entity too large'
    });
    return;
  }
  
  next();
};

/**
 * IP whitelist middleware (for admin endpoints)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (!allowedIPs.includes(clientIP) && process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: 'Access denied from this IP address'
      });
      return;
    }
    
    next();
  };
};