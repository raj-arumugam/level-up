const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// Rate limiting configuration
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: message,
      retryAfter: Math.round(windowMs / 1000)
    });
  }
});

// Speed limiting configuration
const createSpeedLimit = (windowMs, delayAfter, delayMs) => slowDown({
  windowMs,
  delayAfter,
  delayMs,
  maxDelayMs: delayMs * 10
});

// Security middleware configuration
const securityConfig = {
  // Helmet configuration for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }),

  // Rate limiting rules
  rateLimits: {
    // General API rate limit
    general: createRateLimit(
      15 * 60 * 1000, // 15 minutes
      100, // limit each IP to 100 requests per windowMs
      'Too many requests from this IP, please try again later.'
    ),

    // Authentication rate limit
    auth: createRateLimit(
      15 * 60 * 1000, // 15 minutes
      5, // limit each IP to 5 login attempts per windowMs
      'Too many login attempts from this IP, please try again later.'
    ),

    // API creation rate limit
    create: createRateLimit(
      60 * 1000, // 1 minute
      10, // limit each IP to 10 creation requests per minute
      'Too many creation requests, please slow down.'
    ),

    // Password reset rate limit
    passwordReset: createRateLimit(
      60 * 60 * 1000, // 1 hour
      3, // limit each IP to 3 password reset attempts per hour
      'Too many password reset attempts, please try again later.'
    )
  },

  // Speed limiting (progressive delay)
  speedLimits: {
    // General API speed limit
    general: createSpeedLimit(
      15 * 60 * 1000, // 15 minutes
      50, // start slowing down after 50 requests
      500 // delay each request by 500ms
    ),

    // Authentication speed limit
    auth: createSpeedLimit(
      15 * 60 * 1000, // 15 minutes
      2, // start slowing down after 2 requests
      1000 // delay each request by 1000ms
    )
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },

  // Trust proxy configuration
  trustProxy: process.env.TRUST_PROXY === 'true' || false,

  // Session security
  session: {
    name: 'portfolio-tracker-session',
    secret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    }
  }
};

module.exports = securityConfig;