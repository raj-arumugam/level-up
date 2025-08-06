import { body, validationResult, param, query } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Enhanced error handling with detailed logging
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Log validation errors for monitoring
    console.warn('Validation failed:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      errors: errors.array()
    });
    
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: 'param' in error ? error.param : 'unknown',
        message: error.msg,
        value: 'value' in error ? error.value : undefined
      }))
    });
    return;
  }
  
  next();
};

/**
 * Enhanced validation rules for user registration
 */
export const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Please provide a valid email address')
    .custom(async (value: string) => {
      // Sanitize email
      const sanitized = DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      if (sanitized !== value) {
        throw new Error('Email contains invalid characters');
      }
      
      // Check for disposable email domains
      const disposableDomains = [
        '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
        'mailinator.com', 'throwaway.email', 'temp-mail.org'
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
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character')
    .custom((value: string) => {
      // Check for common weak passwords
      const weakPasswords = [
        'password123', '12345678', 'qwerty123', 'admin123',
        'password1', 'welcome123', 'letmein123'
      ];
      if (weakPasswords.includes(value.toLowerCase())) {
        throw new Error('Password is too common, please choose a stronger password');
      }
      return true;
    }),
  
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes')
    .customSanitizer((value: string) => {
      return DOMPurify.sanitize(value.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }),
  
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes')
    .customSanitizer((value: string) => {
      return DOMPurify.sanitize(value.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }),
  
  handleValidationErrors
];

/**
 * Enhanced validation rules for user login
 */
export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Please provide a valid email address')
    .customSanitizer((value: string) => {
      return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }),
  
  body('password')
    .notEmpty()
    .isLength({ max: 128 })
    .withMessage('Password is required and must be less than 128 characters'),
  
  handleValidationErrors
];

/**
 * Enhanced validation for stock positions
 */
export const validateCreatePosition = [
  body('symbol')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Stock symbol must be between 1 and 10 characters')
    .matches(/^[A-Za-z0-9.-]+$/)
    .withMessage('Stock symbol can only contain letters, numbers, dots, and hyphens')
    .customSanitizer((value: string) => {
      const sanitized = DOMPurify.sanitize(value.toUpperCase(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      return sanitized.replace(/[^A-Z0-9.-]/g, '');
    }),
  
  body('quantity')
    .isFloat({ min: 0.001, max: 1000000 })
    .withMessage('Quantity must be between 0.001 and 1,000,000')
    .customSanitizer((value: any) => {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.round(num * 1000) / 1000;
    }),
  
  body('purchasePrice')
    .isFloat({ min: 0.01, max: 100000 })
    .withMessage('Purchase price must be between $0.01 and $100,000')
    .customSanitizer((value: any) => {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.round(num * 100) / 100;
    }),
  
  body('purchaseDate')
    .isISO8601()
    .withMessage('Purchase date must be a valid date')
    .custom((value: string) => {
      const date = new Date(value);
      const now = new Date();
      const minDate = new Date('1900-01-01');
      
      if (date > now) {
        throw new Error('Purchase date cannot be in the future');
      }
      if (date < minDate) {
        throw new Error('Purchase date cannot be before 1900');
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * Enhanced validation for updating positions
 */
export const validateUpdatePosition = [
  param('id')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Position ID is required')
    .customSanitizer((value: string) => {
      return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }),
  
  body('quantity')
    .optional()
    .isFloat({ min: 0.001, max: 1000000 })
    .withMessage('Quantity must be between 0.001 and 1,000,000')
    .customSanitizer((value: any) => {
      if (value === undefined) return value;
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.round(num * 1000) / 1000;
    }),
  
  body('purchasePrice')
    .optional()
    .isFloat({ min: 0.01, max: 100000 })
    .withMessage('Purchase price must be between $0.01 and $100,000')
    .customSanitizer((value: any) => {
      if (value === undefined) return value;
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.round(num * 100) / 100;
    }),
  
  body('purchaseDate')
    .optional()
    .isISO8601()
    .withMessage('Purchase date must be a valid date')
    .custom((value: string) => {
      if (!value) return true;
      const date = new Date(value);
      const now = new Date();
      const minDate = new Date('1900-01-01');
      
      if (date > now) {
        throw new Error('Purchase date cannot be in the future');
      }
      if (date < minDate) {
        throw new Error('Purchase date cannot be before 1900');
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * Enhanced validation for analytics queries
 */
export const validateAnalyticsQuery = [
  query('period')
    .optional()
    .isIn(['1d', '1w', '1m', '3m', '6m', '1y', 'all'])
    .withMessage('Period must be one of: 1d, 1w, 1m, 3m, 6m, 1y, all'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date')
    .custom((value: string) => {
      if (!value) return true;
      const date = new Date(value);
      const minDate = new Date('1900-01-01');
      const maxDate = new Date();
      
      if (date < minDate || date > maxDate) {
        throw new Error('Start date must be between 1900 and today');
      }
      return true;
    }),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((value: string, { req }) => {
      if (!value) return true;
      const endDate = new Date(value);
      const maxDate = new Date();
      
      if (endDate > maxDate) {
        throw new Error('End date cannot be in the future');
      }
      
      if (req.query && req.query.startDate) {
        const startDate = new Date(req.query.startDate as string);
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
        
        // Limit date range to prevent excessive data queries
        const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 365 * 5) { // 5 years max
          throw new Error('Date range cannot exceed 5 years');
        }
      }
      return true;
    }),
  
  query('benchmark')
    .optional()
    .isLength({ min: 1, max: 10 })
    .matches(/^[A-Z0-9.-]+$/)
    .withMessage('Benchmark symbol must be a valid stock symbol')
    .customSanitizer((value: string) => {
      if (!value) return value;
      return DOMPurify.sanitize(value.toUpperCase(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }),
  
  handleValidationErrors
];

/**
 * Validation for position ID parameter
 */
export const validatePositionId = [
  param('id')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Position ID is required')
    .customSanitizer((value: string) => {
      return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }),
  
  handleValidationErrors
];